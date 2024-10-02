/**
 * @since 1.0.0
 */
import type * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Glob from "glob"
import { ContentlayerError } from "./ContentlayerError.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface Source<out Meta, out E = never> extends Stream.Stream<Output<Meta>, E, Source.Provided> {}

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
  export type Meta<A extends Any> = A extends Source<infer Meta, infer _E> ? Meta : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Provided = FileSystem.FileSystem | Path.Path | CommandExecutor.CommandExecutor
}

/**
 * @since 1.0.0
 * @category output
 */
export const OutputTypeId: unique symbol = Symbol.for("@effect/contentlayer-core/Source/Output")

/**
 * @since 1.0.0
 * @category output
 */
export type OutputTypeId = typeof OutputTypeId

/**
 * @since 1.0.0
 * @category output
 */
export class Output<out Meta> extends Data.Class<{
  readonly stream: Stream.Stream<Uint8Array>
  readonly content: Effect.Effect<string>
  readonly contentUint8Array: Effect.Effect<Uint8Array>
  readonly fields: Record<string, unknown>
  readonly meta: Meta
}> {
  /**
   * @since 1.0.0
   */
  readonly [OutputTypeId]: OutputTypeId = OutputTypeId

  /**
   * @since 1.0.0
   */
  addField(key: string, value: unknown): Output<Meta> {
    return new Output({
      ...this,
      fields: {
        ...this.fields,
        [key]: value
      }
    })
  }

  /**
   * @since 1.0.0
   */
  addFields(fields: Record<string, unknown>): Output<Meta> {
    return new Output({
      ...this,
      fields: {
        ...this.fields,
        ...fields
      }
    })
  }
}

/**
 * @since 1.0.0
 * @category file system
 */
export interface FileSystemMeta extends Path.Path.Parsed {
  readonly path: string
  readonly name: string
}

/**
 * @since 1.0.0
 * @category file system
 */
export const fileSystem = (options: {
  readonly paths: ReadonlyArray<string>
}): Source<FileSystemMeta, ContentlayerError> =>
  Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path_ = yield* Path.Path

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

    const loadMeta = (path: string): Output<FileSystemMeta> =>
      new Output({
        stream: Stream.orDie(fs.stream(path)),
        content: Effect.orDie(fs.readFileString(path)),
        contentUint8Array: Effect.orDie(fs.readFile(path)),
        meta: {
          ...path_.parse(path),
          path,
          name: path_.basename(path)
        },
        fields: {}
      })

    return Stream.fromIterable(paths).pipe(
      Stream.map(loadMeta)
    )
  }).pipe(Stream.unwrap)
