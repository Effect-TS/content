/**
 * @since 1.0.0
 */
import type * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as FileSystem from "@effect/platform/FileSystem"
import type * as Path from "@effect/platform/Path"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Glob from "glob"
import { ContentlayerError } from "./ContentlayerError.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface Source<in Meta, out E = never> extends Stream.Stream<Context.Context<Meta>, E, Source.Provided> {}

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
}

/**
 * @since 1.0.0
 * @category models
 */
export class ContentMeta extends Context.Tag("@effect/contentlayer-core/Source/ContentMeta")<
  ContentMeta,
  {
    readonly stream: Stream.Stream<Uint8Array>
    readonly content: Effect.Effect<string>
    readonly contentUint8Array: Effect.Effect<Uint8Array>
  }
>() {}

/**
 * @since 1.0.0
 * @category file system
 */
export interface FileSystemSource extends Source<FileSystemMeta | ContentMeta, ContentlayerError> {}

/**
 * @since 1.0.0
 * @category file system
 */
export class FileSystemMeta extends Context.Tag("@effect/contentlayer-core/Source/FileSystemMeta")<
  FileSystemMeta,
  {
    readonly path: string
    readonly info: FileSystem.File.Info
  }
>() {}

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

    const loadMeta = (path: string): Effect.Effect<
      Context.Context<ContentMeta | FileSystemMeta>,
      ContentlayerError
    > =>
      fs.stat(path).pipe(
        Effect.mapError((cause) =>
          new ContentlayerError({
            module: "Source",
            method: "fileSystem",
            description: "Error while loading metadata",
            cause
          })
        ),
        Effect.map((info) =>
          Context.make(ContentMeta, {
            stream: Stream.orDie(fs.stream(path)),
            content: Effect.orDie(fs.readFileString(path)),
            contentUint8Array: Effect.orDie(fs.readFile(path))
          }).pipe(
            Context.add(FileSystemMeta, { path, info })
          )
        )
      )

    return Stream.fromIterable(paths).pipe(
      Stream.mapEffect(loadMeta, { concurrency: 10 })
    )
  }).pipe(Stream.unwrap)
