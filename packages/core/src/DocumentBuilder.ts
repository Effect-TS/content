/**
 * @since 1.0.0
 */
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { ConfigBuilder } from "./ConfigBuilder.js"
import type * as Document from "./Document.js"
import type * as Source from "./Source.js"

const make = Effect.gen(function*() {
  const config = yield* ConfigBuilder

  const documents = config.config.pipe(
    Stream.flatMap((config) =>
      Stream.fromIterable(config.documents).pipe(
        Stream.bindTo("document"),
        Stream.let("decodeFields", ({ document }) => Schema.decodeUnknown(Schema.Struct(document.fields))),
        Stream.bind("output", ({ document }) =>
          document.source.pipe(
            Stream.catchAllCause((cause) => Stream.drain(Effect.logError(cause)))
          ) as Stream.Stream<Source.Output<unknown>>),
        Stream.bind("fields", ({ decodeFields, document, output }) =>
          decodeFields(output.fields).pipe(
            Effect.flatMap((fields) => resolveComputedFields({ document, output, fields }))
          ), { concurrency: "unbounded" }),
        Stream.runForEach((_) =>
          Console.dir({
            fields: _.fields
          }, { depth: null })
        ),
        Effect.catchAllCause(Effect.logError)
      ), { switch: true }),
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
    Layer.provide(ConfigBuilder.Live)
  )
}

const resolveComputedFields = (options: {
  readonly document: Document.Document<any, any>
  readonly output: Source.Output<unknown>
  readonly fields: Record<string, unknown>
}) =>
  Effect.reduce(
    options.document.computedFields,
    options.fields,
    (fields, group) =>
      Effect.forEach(
        group,
        (field) =>
          field.resolve(fields, options.output.context).pipe(
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
  )
