/**
 * @since 1.0.0
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"
import * as Module from "node:module"
import * as VM from "node:vm"
import * as Config from "./Config.ts"
import { ContentlayerError } from "./ContentlayerError.ts"
import type { EsbuildSuccess } from "./Esbuild.ts"
import { Esbuild } from "./Esbuild.ts"

/**
 * @since 1.0.0
 * @category constructors
 */
export const make = Effect.gen(function*() {
  const esbuild = yield* Esbuild
  const config = yield* SubscriptionRef.make(Option.none<BuiltConfig>())

  yield* esbuild.results.take.pipe(
    Effect.flatten,
    Effect.flatMap(build),
    Effect.flatMap((latest) => SubscriptionRef.set(config, latest)),
    Effect.catchAllCause(Effect.logError),
    Effect.forever,
    Effect.forkScoped
  )

  return {
    config: config.changes.pipe(
      Stream.filterMap(identity),
      Stream.debounce("200 millis")
    )
  } as const
})

/**
 * @since 1.0.0
 * @category models
 */
export interface BuiltConfig {
  readonly hash: string
  readonly config: Config.Config
  readonly path: string
  readonly entrypoint: string
}

export class ConfigBuilder extends Effect.Tag("@effect/contentlayer/ConfigBuilder")<
  ConfigBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make).pipe(
    Layer.provide(Esbuild.Live),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer)
  )
}

const ESBUILD_HASH_REGEX = /compiled-contentlayer-config-(.+)$/
const configAsOption = Option.liftPredicate(Config.isConfig)

const build = (
  result: EsbuildSuccess
): Effect.Effect<
  Option.Option<BuiltConfig>,
  ContentlayerError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const path = yield* Path.Path

    const [outfilePath, output] = yield* Option.fromNullable(result.metafile).pipe(
      Option.flatMapNullable((metafile) => Object.entries(metafile.outputs)[0]),
      Effect.orDie
    )

    const esbuildHash = yield* Option.fromNullable(outfilePath.match(ESBUILD_HASH_REGEX)).pipe(
      Option.flatMap(Arr.get(1)),
      Effect.orDie
    )
    return yield* fromPath(outfilePath, path.resolve(output.entryPoint!), esbuildHash)
  })

/**
 * @since 1.0.0
 * @category constructors
 */
export const fromPath = Effect.fnUntraced(function*(
  outPath: string,
  entrypoint: string,
  hash: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  const content = yield* Effect.orDie(fs.readFileString(outPath))

  const context = VM.createContext({
    ...globalThis,
    process,
    __filename: outPath,
    __dirname: path.dirname(outPath)
  })
  context.require = Module.createRequire(entrypoint)
  context.module = { exports: {} }
  context.exports = context.module.exports

  yield* Effect.try({
    try: () => VM.runInContext(content, context),
    catch: (cause) =>
      new ContentlayerError({
        module: "ConfigBuilder",
        method: "fromPath",
        description: "Error evaluating config",
        cause
      })
  })

  return configAsOption(context.module.exports.default).pipe(
    Option.map((config): BuiltConfig => ({
      hash,
      config,
      path: outPath,
      entrypoint
    }))
  )
})
