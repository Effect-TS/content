/**
 * @since 1.0.0
 */
import type * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import type { MergeRight } from "effect/Types"
import * as Glob from "glob"
import { ContentlayerError } from "./ContentlayerError.js"

/**
 * @since 1.0.0
 * @category models
 */
export interface Source<out Meta, in Context = never, out E = never>
  extends Stream.Stream<Output<Meta, Context>, E, Source.Provided>
{}

/**
 * @since 1.0.0
 * @category models
 */
export declare namespace Source {
  /**
   * @since 1.0.0
   * @category models
   */
  export type Any =
    | Source<any, never, never>
    | Source<any, any, never>
    | Source<any, never, any>
    | Source<any, any, any>

  /**
   * @since 1.0.0
   * @category models
   */
  export type Meta<A extends Any> = A extends Source<infer Meta, infer _R, infer _E> ? Meta : never

  /**
   * @since 1.0.0
   * @category models
   */
  export type Success<A extends Any> = A extends Source<infer _Meta, infer _R, infer _E> ? Output<_Meta, _R> : never

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
export class Output<out Meta, in Context = never> extends Data.Class<{
  readonly id: string
  readonly stream: Stream.Stream<Uint8Array>
  readonly content: Effect.Effect<string>
  readonly contentUint8Array: Effect.Effect<Uint8Array>
  readonly fields: Record<string, unknown>
  readonly meta: Meta
  readonly context: Context.Context<Context>
}> {
  /**
   * @since 1.0.0
   */
  readonly [OutputTypeId]: OutputTypeId = OutputTypeId

  /**
   * @since 1.0.0
   */
  addContext<I, S>(tag: Context.Tag<I, S>, value: S): Output<Meta, Context | I> {
    return new Output({
      ...this,
      context: Context.add(this.context, tag, value)
    })
  }

  /**
   * @since 1.0.0
   */
  addMeta<A>(meta: A): Output<MergeRight<Meta, A>, Context> {
    return new Output({
      ...this,
      meta: {
        ...this.meta,
        ...meta
      } as MergeRight<Meta, A>
    })
  }

  /**
   * @since 1.0.0
   */
  addField(key: string, value: unknown): Output<Meta, Context> {
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
  addFields(fields: Record<string, unknown>): Output<Meta, Context> {
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
 * @category output
 */
export declare namespace Output {
  /**
   * @since 1.0.0
   * @category output
   */
  export interface Any {
    readonly [OutputTypeId]: OutputTypeId
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
}): Source<FileSystemMeta, never, ContentlayerError> =>
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
        id: path,
        stream: Stream.orDie(fs.stream(path)),
        content: Effect.orDie(fs.readFileString(path)),
        contentUint8Array: Effect.orDie(fs.readFile(path)),
        meta: ({
          ...path_.parse(path),
          path,
          name: path_.basename(path)
        }),
        context: Context.empty(),
        fields: {}
      })

    return Stream.fromIterable(paths).pipe(
      Stream.map(loadMeta)
    )
  }).pipe(Stream.unwrap)
