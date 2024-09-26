/**
 * @since 1.0.0
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import * as SubscriptionRef from "effect/SubscriptionRef"
import * as Module from "node:module"
import * as VM from "node:vm"
import * as Config from "./Config.js"
import { ContentlayerError } from "./ContentlayerError.js"
import type { EsbuildSuccess } from "./Esbuild.js"
import { Esbuild } from "./Esbuild.js"

// contentlayer.config.ts
//
// const Author = Schema.Struct({
//   name: Schema.NonEmptyString,
//   twitter: Schema.optional(Schema.String)
// })
//
// const Post = make({
//   name: "Post",
//   description: "The posts",
//   source: Source.fileSystem({ path: "content/posts/**/*.mdx?" }),
//   fields: {
//     title: Schema.NonEmptyString,
//     author: Author
//   }
// }).addComputedFields({
//   slug: {
//     description: "The title slug",
//     schema: Schema.NonEmptyString,
//     resolve: (fields) => Effect.succeed(fields.title.slice(0, 5))
//   },
//   slug2: {
//     description: "The title slug",
//     schema: Schema.NonEmptyString,
//     resolve: (fields) => Effect.succeed(fields.title.slice(0, 5))
//   }
// }).addComputedFields({
//   slug3: {
//     description: "The title slug",
//     schema: Schema.Number,
//     resolve: () => Effect.succeed(1)
//   }
// })
//
// export default Config.make({
//   documents: [Post]
// })
//
//
// compiled-contentlayer-config-[HASH].mjs

export const make = Effect.gen(function*() {
  const esbuild = yield* Esbuild
  const config = yield* SubscriptionRef.make(Option.none<Config.Config>())

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
      Stream.filterMap(identity)
    )
  } as const
})

export class ConfigBuilder extends Effect.Tag("@effect/contentlayer-core/ConfigBuilder")<
  ConfigBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make).pipe(
    Layer.provide(Esbuild.Live),
    Layer.provide(NodeFileSystem.layer),
    Layer.provide(NodePath.layer)
  )
}

// const ESBUILD_HASH_REGEX = /compiled-contentlayer-config-(.+)$/
const configAsOption = Option.liftPredicate(Config.isConfig)

const build = (
  result: EsbuildSuccess
): Effect.Effect<
  Option.Option<Config.Config>,
  ContentlayerError,
  FileSystem.FileSystem | Path.Path
> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    const [outfilePath, output] = yield* Option.fromNullable(result.metafile).pipe(
      Option.flatMapNullable((metafile) => Object.entries(metafile.outputs)[0]),
      Effect.orDie
    )

    // const esbuildHash = yield* Option.fromNullable(outfilePath.match(ESBUILD_HASH_REGEX)).pipe(
    //   Option.flatMap(Array.get(1)),
    //   Effect.orDie
    // )

    const content = yield* Effect.orDie(fs.readFileString(outfilePath))

    const context = VM.createContext({
      ...globalThis
    })
    context.require = Module.createRequire(path.resolve(output.entryPoint!))
    context.module = { exports: {} }
    context.exports = context.module.exports

    yield* Effect.try({
      try: () => VM.runInContext(content, context),
      catch: (cause) =>
        new ContentlayerError({
          module: "ConfigBuilder",
          method: "build",
          description: "Error evaluating config",
          cause
        })
    })

    return configAsOption(context.module.exports.default)
  })
