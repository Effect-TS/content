/**
 * @since 1.0.0
 */
import type * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { dual } from "effect/Function"
import type { Pipeable } from "effect/Pipeable"
import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Glob from "glob"
import { ContentlayerError } from "./ContentlayerError.js"

/**
 * @since 1.0.0
 * @category symbols
 */
export const TypeId: unique symbol = Symbol.for("@effect/contentlayer-core/Source")

/**
 * @since 1.0.0
 * @category symbols
 */
export type TypeId = typeof TypeId

/**
 * @since 1.0.0
 * @category models
 */
export interface Source<in out Meta, in Context = never, out E = never> extends Pipeable {
  readonly [TypeId]: TypeId
  readonly additions: Stream.Stream<Output<Meta, Context>, E, Source.Provided>
  readonly removals: Stream.Stream<string, never, Source.Provided>
  readonly metaSchema: Schema.Schema<Meta, any>
}

const SourceProto: Omit<Source<any, any, any>, "additions" | "metaSchema" | "removals"> = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const make = <Meta, Context, EA>(options: {
  readonly additions: Stream.Stream<Output<Meta, Context>, EA, Source.Provided>
  readonly removals?: Stream.Stream<string, never, Source.Provided>
  readonly metaSchema: Schema.Schema<Meta, any>
}): Source<Meta, Context, EA> => ({
  ...SourceProto,
  ...options,
  removals: options.removals ?? Stream.empty
})

/**
 * @since 1.0.0
 * @category combinators
 */
export const transform: {
  <Meta, Context, E, E2, Context2>(
    f: (
      stream: Stream.Stream<Output<Meta, Context>, E, Source.Provided>
    ) => Stream.Stream<Output<Meta, Context2>, E2, Source.Provided>
  ): (source: Source<Meta, Context, E>) => Source<Meta, Context2, E2>
  <Meta, Context, E, E2, Context2>(
    self: Source<Meta, Context, E>,
    f: (
      stream: Stream.Stream<Output<Meta, Context>, E, Source.Provided>
    ) => Stream.Stream<Output<Meta, Context2>, E2, Source.Provided>
  ): Source<Meta, Context2, E2>
} = dual(2, <Meta, Context, E, E2, Context2>(
  self: Source<Meta, Context, E>,
  f: (
    stream: Stream.Stream<Output<Meta, Context>, E, Source.Provided>
  ) => Stream.Stream<Output<Meta, Context2>, E2, Source.Provided>
): Source<Meta, Context2, E2> =>
  make({
    additions: f(self.additions),
    removals: self.removals,
    metaSchema: self.metaSchema
  }))

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
}

/**
 * @since 1.0.0
 * @category file system
 */
export const FileSystemMeta: Schema.Schema<FileSystemMeta> = Schema.Struct({
  root: Schema.String,
  dir: Schema.String,
  base: Schema.String,
  ext: Schema.String,
  path: Schema.String,
  name: Schema.String
})

/**
 * @since 1.0.0
 * @category file system
 */
export const fileSystem = (options: {
  readonly paths: ReadonlyArray<string>
}): Source<FileSystemMeta, never, ContentlayerError> => {
  const stream = Effect.gen(function*() {
    // const watchMode = yield* WatchMode
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
          path
        }),
        context: Context.empty(),
        fields: {}
      })

    return Stream.fromIterable(paths).pipe(
      Stream.map(loadMeta)
    )
  }).pipe(Stream.unwrap)

  return make({
    additions: stream,
    // TODO: setup watchers
    removals: Stream.empty,
    metaSchema: FileSystemMeta
  })
}
