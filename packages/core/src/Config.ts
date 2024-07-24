import { Effect, Layer, Queue, Reloadable } from "effect"
import type { EsbuildResult } from "./Esbuild.js"
import { Esbuild } from "./Esbuild.js"

export const make = Effect.gen(function*() {
  const results = yield* Esbuild.results
  const queue = yield* Queue.unbounded<any>()

  yield* Queue.take(results).pipe(
    Effect.flatMap(buildConfiguration),
    Effect.flatMap((config) => Queue.offer(queue, config)),
    Effect.forever,
    Effect.forkScoped
  )

  return {
    queue
  } as const
})

export class Config extends Effect.Tag("@effect/content/core/Config")<
  Config,
  Effect.Effect.Success<typeof make>
>() {
  static Live = Layer.scoped(this, make).pipe(
    Layer.provide(Esbuild.Live)
  )

  static ReloadableLive = Reloadable.manual(this, { layer: this.Live })
  static get = Reloadable.get(this)
  static reload = Effect.orDie(Reloadable.reload(this)).pipe(
    Effect.zipRight(this.get)
  )
}

declare function buildConfiguration(result: EsbuildResult): Effect.Effect<any>
