/**
 * @since 1.0.0
 */
import type * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as FileSystem from "@effect/platform/FileSystem"
import type * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Glob from "glob"
import { ContentlayerError } from "./ContentlayerError.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface Source<in out Meta, out E = never> extends Stream.Stream<Meta, E, Source.Provided> {}

/**
 * @since 1.0.0
 * @category models
 */
export declare namespace Source {
  /**
   * @since 1.0.0
   * @category models
   */
  export type Any = Source<any, any> | Source<any>

  /**
   * @since 1.0.0
   * @category models
   */
  export type Meta<Source extends Any> = Stream.Stream.Success<Source>

  /**
   * @since 1.0.0
   * @category models
   */
  export type Provided = FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor

  /**
   * @since 1.0.0
   * @category models
   */
  export interface ContentMeta {
    readonly stream: Stream.Stream<Uint8Array>
    readonly content: Effect.Effect<string>
    readonly contentUint8Array: Effect.Effect<Uint8Array>
  }
}

/**
 * @since 1.0.0
 * @category file system
 */
export interface FileSystemSource extends Source<FileSystemSource.Meta, ContentlayerError> {}

/**
 * @since 1.0.0
 * @category file system
 */
export declare namespace FileSystemSource {
  export interface Meta extends Source.ContentMeta {
    readonly path: string
    readonly stat: FileSystem.File.Info
  }
}

/**
 * @since 1.0.0
 * @category file system
 */
export const fileSystem = (options: {
  readonly paths: ReadonlyArray<string>
}): FileSystemSource =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const paths = yield* Effect.tryPromise({
      try: () => Glob.glob(options.paths as Array<string>),
      catch: (cause) =>
        new ContentlayerError({
          module: "Source",
          method: "fileSystem",
          description: "Error while loading paths",
          cause
        })
    })

    const loadMeta = (path: string): Effect.Effect<FileSystemSource.Meta, ContentlayerError> =>
      fs.stat(path).pipe(
        Effect.mapError((cause) =>
          new ContentlayerError({
            module: "Source",
            method: "fileSystem",
            description: "Error while loading metadata",
            cause
          })
        ),
        Effect.map((stat): FileSystemSource.Meta => ({
          path,
          stat,
          stream: Stream.orDie(fs.stream(path)),
          content: Effect.orDie(fs.readFileString(path)),
          contentUint8Array: Effect.orDie(fs.readFile(path))
        }))
      )

    return Stream.fromIterable(paths).pipe(
      Stream.mapEffect(loadMeta, { concurrency: 10 })
    )
  }).pipe(Stream.unwrap)
