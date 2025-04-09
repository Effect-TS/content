/**
 * @since 1.0.0
 */
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeWorkerRunner from "@effect/platform-node/NodeWorkerRunner"
import * as RpcServer from "@effect/rpc/RpcServer"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { isParseError, type ParseError } from "effect/ParseResult"
import * as RcMap from "effect/RcMap"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as ConfigBuilder from "./ConfigBuilder.ts"
import { BuildError, ContentlayerError } from "./ContentlayerError.ts"
import * as ContentWorkerSchema from "./ContentWorkerSchema.ts"
import type * as Document from "./Document.ts"
import { DocumentStorage } from "./DocumentStorage.ts"
import * as Source from "./Source.ts"

const Handlers = ContentWorkerSchema.Rpcs.toLayer(Effect.gen(function*() {
  const storage = yield* DocumentStorage

  const configs = yield* RcMap.make({
    lookup: (path: ContentWorkerSchema.ConfigPath) =>
      ConfigBuilder.fromPath(path.path, path.entrypoint, "").pipe(
        Effect.flatten,
        Effect.orDie
      ),
    idleTimeToLive: "1 minute"
  })

  return {
    ProcessDocument: Effect.fnUntraced(
      function*({ configPath, id, meta, name }) {
        const config = yield* RcMap.get(configs, configPath)
        const document = config.config.documents.find((doc) => doc.name === name)!
        const stream = Stream.succeed<Source.WorkerEvent>({
          id,
          meta
        })
        const event = yield* document.source.events.pipe(
          Stream.runHead,
          Effect.flatten,
          Effect.orDie,
          Effect.provideService(Source.WorkerEventStream, stream)
        )
        if (event._tag !== "Added") {
          return yield* new ContentlayerError({
            module: "ContentWorker",
            method: "ProcessDocument",
            description: `Expected an "Added" event but got ${event._tag}`
          })
        }
        const { output } = event
        const decoded = yield* (Schema.decode(document.fields)(output.fields) as Effect.Effect<
          Record<string, unknown>,
          ParseError
        >)
        const fields = yield* resolveComputedFields({ document, output, fields: decoded })
        yield* storage.write({ document, fields, output })
      },
      (effect, { id, name }) =>
        Effect.catchIf(
          effect,
          isParseError,
          (parseError) => BuildError.fromParseError({ parseError, documentType: name, documentId: id })
        ),
      Effect.scoped
    )
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

const Main = RpcServer.layer(ContentWorkerSchema.Rpcs).pipe(
  Layer.provide(Handlers),
  Layer.provide(RpcServer.layerProtocolWorkerRunner),
  Layer.provide(NodeWorkerRunner.layer)
)

NodeWorkerRunner.launch(Main).pipe(
  NodeRuntime.runMain
)
