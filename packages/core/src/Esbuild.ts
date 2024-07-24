import { Array, Data, Effect, Either, Layer, Queue } from "effect"
import * as esbuild from "esbuild"

export class EsbuildError extends Data.TaggedError("EsbuildError")<{
  readonly errors: ReadonlyArray<esbuild.Message>
}> {}

export type EsbuildResult = Either.Either<esbuild.BuildResult, EsbuildError>

export const make = Effect.gen(function*() {
  const options = yield* BuildOptions
  const results = yield* Queue.unbounded<EsbuildResult>()

  const plugin: esbuild.Plugin = {
    name: "effect-content-watch",
    setup(build) {
      build.onEnd((result) => {
        if (Array.isNonEmptyArray(result.errors)) {
          const error = new EsbuildError({ errors: result.errors })
          Queue.unsafeOffer(results, Either.left(error))
        } else {
          Queue.unsafeOffer(results, Either.right(result))
        }
      })
    }
  }

  const plugins = [plugin, ...(options.plugins ?? [])]

  const context = yield* Effect.acquireRelease(
    Effect.promise(() => esbuild.context({ ...options, plugins })),
    (context) => Effect.promise(() => context.dispose())
  )

  yield* Effect.promise(() => context.watch())

  return {
    results
  } as const
})

export class BuildOptions extends Effect.Tag("@effect/content/core/BuildOptions")<
  BuildOptions,
  esbuild.BuildOptions
>() {}

export class Esbuild extends Effect.Tag("@effect/content/core/Esbuild")<
  Esbuild,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make)
}
