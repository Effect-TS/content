import { Console, Effect, identity, Layer, Option, Queue, Stream, SubscriptionRef } from "effect"
import * as Config from "./Config.js"
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
  const results = yield* Esbuild.results
  const config = yield* SubscriptionRef.make(Option.none<Config.Config>())

  yield* Queue.take(results).pipe(
    Effect.flatten,
    Effect.flatMap(build),
    Effect.flatMap((latest) => SubscriptionRef.set(config, latest)),
    // TODO: log nice messages for the user
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

export class ConfigBuilder extends Effect.Tag("@effect/content/core/ConfigBuilder")<
  ConfigBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make).pipe(
    Layer.provide(Esbuild.Live)
  )
}

const build = (result: EsbuildSuccess): Effect.Effect<Option.Option<Config.Config>> =>
  Effect.gen(function*() {
    yield* Console.dir(result, { depth: null, colors: true })
    // yield* Console.log(Config.isConfig(config))
    return Option.some(Config.make({ documents: [] }))
  })
