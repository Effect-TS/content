/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Mailbox from "effect/Mailbox"
import type { ParseError } from "effect/ParseResult"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { ConfigBuilder } from "./ConfigBuilder.js"
import type * as Document from "./Document.js"
import { DocumentStorage } from "./DocumentStorage.js"
import type * as Source from "./Source.js"
import * as TypeBuilder from "./TypeBuilder.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface BuiltDocument {
  readonly document: Document.Document.Any
  readonly fields: Record<string, unknown>
  readonly output: Source.Output<unknown>
}

const make = Effect.gen(function*() {
  const config = yield* ConfigBuilder
  const storage = yield* DocumentStorage

  const documents = config.config.pipe(
    Stream.tap(() => Effect.log("Building documents")),
    Stream.flatMap(
      Effect.fnUntraced(
        function*(config) {
          const ids = new Set<string>()
          const idMailbox = yield* Mailbox.make<void, any>({ capacity: 1, strategy: "dropping" })

          yield* Stream.fromIterable(config.documents).pipe(
            Stream.flatMap((doc) => doc.source.removals, { concurrency: "unbounded" }),
            Stream.runForEach((id) =>
              Effect.sync(() => {
                if (!ids.has(id)) return
                ids.delete(id)
                idMailbox.offer(undefined)
              })
            ),
            Effect.fork
          )

          const types = config.documents.map((doc) => TypeBuilder.renderDocument(doc))
          yield* Effect.fork(storage.writeTypes(types))

          yield* Mailbox.toStream(idMailbox).pipe(
            Stream.debounce(500),
            Stream.runForEach(() => storage.writeIds(ids)),
            Effect.fork,
            Effect.uninterruptible
          )

          yield* Stream.fromIterable(config.documents).pipe(
            Stream.bindTo("document"),
            Stream.bind("output", ({ document }) => document.source.additions, {
              concurrency: "unbounded"
            }),
            Stream.bind("fields", ({ document, output }) =>
              Effect.flatMap(
                Schema.decode(document.fields)(output.fields) as Effect.Effect<Record<string, unknown>, ParseError>,
                (fields) => resolveComputedFields({ document, output, fields })
              ), { concurrency: "unbounded" }),
            Stream.mapEffect((out) => Effect.as(storage.write(out), out), { concurrency: "unbounded" }),
            Stream.runForEach(({ output }) =>
              Effect.sync(() => {
                if (ids.has(output.id)) return
                ids.add(output.id)
                idMailbox.offer(undefined)
              })
            ),
            Effect.onExit((exit) => idMailbox.done(exit))
          )
        },
        Effect.timed,
        Effect.matchCauseEffect({
          onSuccess: ([duration]) => Effect.log(`Documents built successfully in ${Duration.format(duration)}`),
          onFailure: (cause) => Effect.logError("Error building documents", cause)
        })
      ),
      { switch: true }
    ),
    Stream.runDrain,
    Effect.forkScoped
  )

  yield* documents
}).pipe(
  Effect.annotateLogs({
    module: "DocumentBuilder"
  })
)

export class DocumentBuilder extends Context.Tag("@effect/contentlayer-core/DocumentBuilder")<
  DocumentBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static readonly layer = Layer.scoped(DocumentBuilder, make)

  static readonly Live = this.layer.pipe(
    Layer.provide(ConfigBuilder.Live),
    Layer.provide(DocumentStorage.Default)
  )
}

const resolveComputedFields = (options: {
  readonly document: Document.Document<any, any>
  readonly output: Source.Output<unknown>
  readonly fields: Record<string, unknown>
}): Effect.Effect<Record<string, unknown>, ParseError> =>
  Effect.reduce(
    options.document.computedFields,
    options.fields,
    (fields, group) =>
      Effect.forEach(
        group,
        (field) =>
          field.resolve(fields, options.output).pipe(
            Effect.tap(Schema.validate(field.schema))
          ),
        { concurrency: group.length }
      ).pipe(
        Effect.map((values) => {
          const newFields = { ...fields }
          for (let index = 0; index < group.length; index++) {
            newFields[group[index].name] = values[index]
          }
          return newFields
        })
      )
  ) as Effect.Effect<Record<string, unknown>, ParseError>
