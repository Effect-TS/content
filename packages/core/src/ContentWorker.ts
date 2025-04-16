/**
 * @since 1.0.0
 */
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner"
import type { WorkerError } from "@effect/platform/WorkerError"
import * as RpcServer from "@effect/rpc/RpcServer"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Mailbox from "effect/Mailbox"
import * as MutableList from "effect/MutableList"
import { isParseError, type ParseError } from "effect/ParseResult"
import * as RcMap from "effect/RcMap"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { unify } from "effect/Unify"
import * as ConfigBuilder from "./ConfigBuilder.ts"
import { BuildError } from "./ContentlayerError.ts"
import * as ContentWorkerSchema from "./ContentWorkerSchema.ts"
import type * as Document from "./Document.ts"
import { DocumentStorage } from "./DocumentStorage.ts"
import * as Source from "./Source.ts"

const Handlers = ContentWorkerSchema.Rpcs.toLayer(Effect.gen(function*() {
  const storage = yield* DocumentStorage

  const configs = yield* RcMap.make({
    lookup: Effect.fnUntraced(function*(path: ContentWorkerSchema.ConfigPath) {
      const config = yield* ConfigBuilder.fromPath(path.path, path.entrypoint, "").pipe(
        Effect.flatten,
        Effect.orDie
      )

      const docProcessor = yield* RcMap.make({
        lookup: Effect.fnUntraced(function*(name: string) {
          const document = config.config.documents.find((doc) => doc.name === name)!
          const mailbox = yield* Mailbox.make<Source.WorkerEvent>()

          const resumes = new Map<string, MutableList.MutableList<(_: Effect.Effect<void, BuildError>) => void>>()

          yield* unify(document.source.events).pipe(
            Stream.orDie,
            Stream.mapEffect(
              Effect.fnUntraced(function*(event) {
                if (event._tag !== "Added") return
                const { output } = event
                const decoded = yield* (Schema.decode(document.fields)(output.fields) as Effect.Effect<
                  Record<string, unknown>,
                  ParseError
                >)
                const fields = yield* resolveComputedFields({ document, output, fields: decoded })
                yield* storage.write({ document, fields, output })

                const list = resumes.get(event.id)
                if (!list) return
                const resume = MutableList.shift(list)!
                if (MutableList.isEmpty(list)) {
                  resumes.delete(event.id)
                }
                resume(Effect.void)
              }, (effect, { id }) =>
                Effect.catchIf(
                  effect,
                  isParseError,
                  (parseError) => BuildError.fromParseError({ parseError, documentType: name, documentId: id })
                )),
              { concurrency: "unbounded" }
            ),
            Stream.runDrain,
            Effect.catchAllCause((cause) =>
              Effect.suspend(() => {
                for (const list of resumes.values()) {
                  for (const resume of list) {
                    resume(Effect.failCause(cause))
                  }
                }
                resumes.clear()
                return mailbox.clear
              })
            ),
            Effect.forever,
            Effect.provideService(Source.WorkerEventStream, Mailbox.toStream(mailbox)),
            Effect.forkScoped,
            Effect.interruptible
          )

          const process = (id: string, meta: unknown) =>
            Effect.async<void, BuildError>((resume) => {
              let list = resumes.get(id)
              if (!list) {
                resumes.set(id, list = MutableList.empty())
              }
              MutableList.append(list, resume)
              mailbox.unsafeOffer({ id, meta })
            })

          return process
        }),
        idleTimeToLive: "1 minute"
      })

      const process = (name: string, id: string, meta: unknown) =>
        RcMap.get(docProcessor, name).pipe(
          Effect.flatMap((process) => process(id, meta)),
          Effect.scoped
        )

      return { ...config, process } as const
    }),
    idleTimeToLive: "1 minute"
  })

  return {
    ProcessDocument: Effect.fnUntraced(function*({ configPath, id, meta, name }) {
      const config = yield* RcMap.get(configs, configPath)
      return yield* config.process(name, id, meta)
    })
  }
})).pipe(
  Layer.provide([DocumentStorage.Default, NodeContext.layer])
)

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

/**
 * @since 1.0.0
 * @category Layers
 */
export const layer: Layer.Layer<never, WorkerError> = RpcServer.layer(ContentWorkerSchema.Rpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(NodeWorkerRunner.layer)
)

Layer.launch(layer).pipe(
  NodeRuntime.runMain
)
