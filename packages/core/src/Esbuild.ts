/**
 * @since 1.0.0
 */
import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Mailbox from "effect/Mailbox"
import * as esbuild from "esbuild"

export interface EsbuildSuccess extends esbuild.BuildResult {}

export class EsbuildError extends Data.TaggedError("EsbuildError")<{
  readonly errors: ReadonlyArray<esbuild.Message>
}> {
  get message() {
    return this.errors.map((error) => error.text).join("\n")
  }
}

export type EsbuildResult = Exit.Exit<EsbuildSuccess, EsbuildError>

export const make = Effect.gen(function*() {
  const options = yield* BuildOptions
  const results = yield* Mailbox.make<EsbuildResult>()

  const plugin: esbuild.Plugin = {
    name: "effect-content-watch",
    setup(build) {
      build.onEnd((result) => {
        if (Array.isNonEmptyArray(result.errors)) {
          const error = new EsbuildError({ errors: result.errors })
          results.unsafeOffer(Exit.fail(error))
        } else {
          results.unsafeOffer(Exit.succeed(result))
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
    results: results as Mailbox.ReadonlyMailbox<EsbuildResult>
  } as const
})

export class BuildOptions extends Context.Tag("@effect/content/core/BuildOptions")<
  BuildOptions,
  esbuild.BuildOptions
>() {
  static Live = (options: esbuild.BuildOptions) => Layer.succeed(this, options)
}

export class Esbuild extends Context.Tag("@effect/content/core/Esbuild")<
  Esbuild,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make)
}
