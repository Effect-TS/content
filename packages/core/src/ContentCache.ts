/**
 * @since 1.0.0
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"

/**
 * @since 1.0.0
 * @category Models
 */
export interface Cache {
  exists(outputId: string, version: number): boolean
  add(outputId: string, version: number): Effect.Effect<void>
}

interface CacheOutput {
  readonly configHash: string
  readonly outputIds: Record<string, number>
}

/**
 * @since 1.0.0
 * @category Services
 */
export class ContentCache extends Effect.Service<ContentCache>()("@effect/contentlayer/ContentCache", {
  dependencies: [NodeFileSystem.layer, NodePath.layer],
  scoped: Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path_ = yield* Path.Path
    const outputPath = path_.join(".contentlayer", "cache.json")
    const writeSignal = yield* Effect.makeLatch(false)

    let cache = yield* fs.readFileString(outputPath).pipe(
      Effect.tryMap({
        try: (json) => JSON.parse(json) as CacheOutput,
        catch: () => new Error("Failed to parse cache file")
      }),
      Effect.orElseSucceed(() => ({
        configHash: "",
        outputIds: {}
      } as CacheOutput))
    )

    const writeCache = Effect.suspend(() =>
      fs.writeFileString(
        outputPath,
        JSON.stringify(cache, null, 2)
      )
    ).pipe(Effect.orDie)

    yield* Effect.addFinalizer(() => writeCache)

    yield* writeSignal.await.pipe(
      Effect.andThen(Effect.sleep(1000)),
      Effect.andThen(writeSignal.close),
      Effect.andThen(writeCache),
      Effect.forever,
      Effect.forkScoped
    )

    const regenerate = (configHash: string) =>
      Effect.sync(() => {
        const service = identity<Cache>({
          exists: (outputId: string, version: number) => cache.outputIds[outputId] === version,
          add: Effect.fnUntraced(function*(outputId: string, version: number) {
            cache.outputIds[outputId] = version
            yield* writeSignal.open
          })
        })

        if (cache.configHash === configHash) {
          return service
        }

        cache = {
          configHash,
          outputIds: {}
        }

        return service
      })

    return { regenerate } as const
  })
}) {}
