/**
 * @since 1.0.0
 */
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import * as Equivalence from "effect/Equivalence"
import { identity } from "effect/Function"
import * as Iterable from "effect/Iterable"
import * as Mailbox from "effect/Mailbox"
import * as Option from "effect/Option"
import type { ParseError } from "effect/ParseResult"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { ConfigBuilder } from "./ConfigBuilder.js"
import { BuildError } from "./ContentlayerError.js"
import type * as Document from "./Document.js"
import { DocumentStorage } from "./DocumentStorage.js"
import { WatchMode } from "./References.js"
import type * as Source from "./Source.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface BuiltDocument {
  readonly document: Document.Document.AnyWithProps
  readonly fields: Record<string, unknown>
  readonly output: Source.Output<unknown>
}

/**
 * @since 1.0.0
 * @category run
 */
export const run = Effect.gen(function*() {
  const config = yield* ConfigBuilder
  const storage = yield* DocumentStorage
  const watchMode = yield* WatchMode

  return yield* config.config.pipe(
    Stream.tap(() => Effect.log("Building documents")),
    Stream.flatMap(
      Effect.fnUntraced(
        function*(config) {
          const idMap = new Map<string, Set<string>>()
          const idMapPrevious = new Map<string, Array<string>>()
          const idMailbox = yield* Mailbox.make<void, any>()
          const idEquiv = Arr.getEquivalence(Equivalence.string)
          let builtDocumentCount = 0

          const getIdCount = () => {
            const count = builtDocumentCount
            builtDocumentCount = 0
            return count
          }

          yield* storage.writeIndex(config.documents).pipe(
            Effect.catchAllCause(Effect.logWarning),
            Effect.annotateLogs({ fiber: "writeIndex" }),
            Effect.uninterruptible,
            Effect.fork
          )

          yield* Mailbox.toStream(idMailbox).pipe(
            Stream.debounce(500),
            Stream.tap(() => Effect.logInfo(`${getIdCount()} documents built`)),
            Stream.flatMap(() =>
              Stream.fromIterable(
                Iterable.map(idMap, ([documentName, ids]) => [documentName, Array.from(ids)] as const)
              )
            ),
            Stream.filter(([name, ids]) => {
              const previous = idMapPrevious.get(name)
              idMapPrevious.set(name, ids)
              return previous ? !idEquiv(ids, previous) : true
            }),
            Stream.mapEffect(([documentName, newIds]) => storage.writeIds(documentName, newIds), {
              concurrency: "unbounded"
            }),
            Stream.runDrain,
            Effect.uninterruptible,
            Effect.catchAllCause(Effect.logWarning),
            Effect.fork
          )

          return yield* Stream.fromIterable(config.documents).pipe(
            Stream.bindTo("document"),
            Stream.bind(
              "output",
              ({ document }) =>
                (document.source.events as Stream.Stream<Source.Event<any, any>>).pipe(
                  Stream.tap((event) => {
                    if (event._tag === "Added" && event.initial) {
                      return Effect.void
                    }
                    return Effect.annotateLogs(Effect.logInfo(`Document ${event._tag.toLowerCase()}`), {
                      document: document.name,
                      id: event.id
                    })
                  }),
                  Stream.filterMap((event) => {
                    if (event._tag === "Added") {
                      return Option.some(event.output)
                    }
                    const documentIds = idMap.get(document.name)
                    if (documentIds && documentIds.has(event.id)) {
                      documentIds.delete(event.id)
                      idMailbox.unsafeOffer(undefined)
                    }
                    return Option.none()
                  })
                ),
              { concurrency: "unbounded" }
            ),
            Stream.mapEffect(
              Effect.fnUntraced(
                function*({ document, output }) {
                  const decoded = yield* (Schema.decode(document.fields)(output.fields) as Effect.Effect<
                    Record<string, unknown>,
                    ParseError
                  >).pipe(
                    Effect.mapError((parseError) =>
                      new BuildError({
                        parseError,
                        documentType: document.name,
                        documentId: output.id
                      })
                    )
                  )
                  const fields = yield* resolveComputedFields({ document, output, fields: decoded })
                  yield* storage.write({ document, fields, output })
                  builtDocumentCount++

                  let documentIds = idMap.get(document.name)
                  if (!documentIds) {
                    documentIds = new Set()
                    idMap.set(document.name, documentIds)
                  }
                  if (!documentIds.has(output.id)) {
                    documentIds.add(output.id)
                    yield* idMailbox.offer(undefined)
                  }
                },
                Effect.catchAllCause((cause) => {
                  if (!watchMode) return Effect.failCause(cause)
                  // TODO: better errors and annotations
                  return Effect.logWarning(
                    "Error building document",
                    Either.match(Cause.failureOrCause(cause), {
                      onLeft: (error) => error.message,
                      onRight: identity
                    })
                  )
                }),
                (effect, { document, output }) =>
                  Effect.annotateLogs(effect, {
                    documentType: document.name,
                    documentId: output.id
                  })
              ),
              { concurrency: "unbounded" }
            ),
            Stream.runDrain,
            Effect.onExit((exit) => idMailbox.done(exit)),
            Effect.map(getIdCount)
          )
        },
        Effect.timed,
        Effect.flatMap(([duration, count]) =>
          Effect.log(`${count} documents built successfully in ${Duration.format(duration)}`)
        )
      ),
      { switch: true }
    ),
    Stream.runDrain,
    BuildError.catchAndLog,
    Effect.catchAllCause(Effect.logError)
  )
})

const resolveComputedFields = (options: {
  readonly document: Document.Document.AnyWithProps
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
