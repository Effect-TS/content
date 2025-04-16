/**
 * @since 1.0.0
 */
import * as NodeWorker from "@effect/platform-node/NodeWorker"
import * as RpcClient from "@effect/rpc/RpcClient"
import * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Either from "effect/Either"
import * as Equivalence from "effect/Equivalence"
import { identity } from "effect/Function"
import * as Iterable from "effect/Iterable"
import * as Layer from "effect/Layer"
import * as Mailbox from "effect/Mailbox"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as OS from "node:os"
import * as WT from "node:worker_threads"
import { ConfigBuilder } from "./ConfigBuilder.ts"
import { ContentCache } from "./ContentCache.ts"
import { BuildError } from "./ContentlayerError.ts"
import * as ContentWorkerSchema from "./ContentWorkerSchema.ts"
import type * as Document from "./Document.ts"
import { DocumentStorage } from "./DocumentStorage.ts"
import { WatchMode } from "./References.ts"
import type * as Source from "./Source.ts"
import * as SourcePlugin from "./SourcePlugin.ts"

/**
 * @since 1.0.0
 * @category models
 */
export interface BuiltDocument {
  readonly document: Document.Document.AnyWithProps
  readonly fields: Record<string, unknown>
  readonly output: Source.Output<unknown>
}

const workerPoolSize = OS.cpus().length

/**
 * @since 1.0.0
 * @category run
 */
export const run = Effect.gen(function*() {
  const worker = yield* ContentWorkerPool
  const config = yield* ConfigBuilder
  const storage = yield* DocumentStorage
  const watchMode = yield* WatchMode
  const contentCache = yield* ContentCache

  return yield* config.config.pipe(
    watchMode ? identity : Stream.take(1),
    Stream.tap(() => Effect.log("Building documents")),
    Stream.flatMap(
      Effect.fnUntraced(
        function*(config) {
          const { documents } = config.config
          const idMap = new Map<string, Set<string>>()
          const idMapPrevious = new Map<string, Array<string>>()
          const idMailbox = yield* Mailbox.make<void, any>()
          const idEquiv = Arr.getEquivalence(Equivalence.string)
          const cache = yield* contentCache.regenerate(config.hash)
          let builtDocumentCount = 0

          const getIdCount = () => {
            const count = builtDocumentCount
            builtDocumentCount = 0
            return count
          }

          yield* storage.writeIndex(documents).pipe(
            Effect.catchAllCause(Effect.logWarning),
            Effect.annotateLogs({ fiber: "writeIndex" }),
            Effect.uninterruptible,
            Effect.fork
          )

          yield* Mailbox.toStream(idMailbox).pipe(
            Stream.debounce(500),
            Stream.tap(() =>
              Effect.logInfo(`${getIdCount()} documents built`).pipe(
                Effect.when(() => watchMode)
              )
            ),
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

          return yield* Stream.fromIterable(documents).pipe(
            Stream.bindTo("document"),
            Stream.bind(
              "event",
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
                      return Option.some(event)
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
            Stream.let("output", ({ event }) => event.output),
            Stream.mapEffect(
              Effect.fnUntraced(
                function*({ document, event, output }) {
                  const cached = event.initial && cache.exists(output.id, output.version)
                  if (!cached) {
                    yield* worker.ProcessDocument({
                      configPath: new ContentWorkerSchema.ConfigPath({
                        path: config.path,
                        entrypoint: config.entrypoint
                      }),
                      name: document.name,
                      id: output.id,
                      meta: output.meta
                    })
                    yield* cache.add(output.id, output.version)
                    builtDocumentCount++
                  }

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
            Effect.provideService(SourcePlugin.Enabled, false),
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

/**
 * @since 1.0.0
 * @category ContentWorkerPool
 */
export class ContentWorkerPool
  extends Effect.Service<ContentWorkerPool>()("@effect/contentlayer-core/DocumentBuilder/ContentWorkerPool", {
    scoped: RpcClient.make(ContentWorkerSchema.Rpcs),
    dependencies: [
      RpcClient.layerProtocolWorker({
        minSize: 1,
        maxSize: workerPoolSize,
        timeToLive: "30 seconds",
        concurrency: 3
      }).pipe(
        Layer.provide(NodeWorker.layerPlatform(() => tsWorker("./ContentWorker")))
      )
    ]
  })
{}

const tsWorker = (path: string) => {
  const isTypescript = import.meta.url.endsWith(".ts")
  if (!isTypescript) {
    const url = new URL(path + ".js", import.meta.url)
    return new WT.Worker(url)
  }
  const url = new URL(path + ".ts", import.meta.url)
  return new WT.Worker(url, {
    execArgv: ["--experimental-strip-types"]
  })
}
