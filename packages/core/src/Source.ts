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
import * as Mailbox from "effect/Mailbox"
import * as Option from "effect/Option"
import type { Pipeable } from "effect/Pipeable"
import { pipeArguments } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as Glob from "glob"
import * as Minimatch from "minimatch"
import { ContentlayerError } from "./ContentlayerError.js"
import { WatchMode } from "./References.js"

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
  readonly events: Stream.Stream<Event<Meta, Context>, E, Source.Provided>
  readonly metaSchema: Schema.Schema<Meta, any>
}

const SourceProto: Omit<Source<any, any, any>, "events" | "metaSchema"> = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * @since 1.0.0
 * @category WorkerEventStream
 */
export class WorkerEventStream extends Context.Tag("@effect/contentlayer-core/Source/WorkerEventStream")<
  WorkerEventStream,
  Stream.Stream<WorkerEvent>
>() {}

/**
 * @since 1.0.0
 * @category WorkerEventStream
 */
export interface WorkerEvent {
  readonly id: string
  readonly meta: unknown
}

/**
 * @since 1.0.0
 * @category constructors
 */
export const make = <Meta, Context, EA>(options: {
  readonly events: Stream.Stream<Event<Meta, Context>, EA, Source.Provided>
  readonly metaSchema: Schema.Schema<Meta, any>
}): Source<Meta, Context, EA> => ({
  ...SourceProto,
  ...options
})

/**
 * @since 1.0.0
 * @category constructors
 */
export const makeWithHydrate = <Meta, Context, EA>(options: {
  readonly events: Stream.Stream<Event<Meta, Context>, EA, Source.Provided>
  readonly metaSchema: Schema.Schema<Meta, any>
  readonly hydrate: (id: string, meta: Meta) => Effect.Effect<Output<Meta, Context>, EA, Source.Provided>
}): Source<Meta, Context, EA> => ({
  ...SourceProto,
  ...options,
  events: Effect.gen(function*() {
    const workerStream = yield* Effect.serviceOption(WorkerEventStream)
    const decodeMeta = Schema.decode(options.metaSchema)
    return Option.match(workerStream, {
      onNone: () => options.events,
      onSome: (workerStream) =>
        workerStream.pipe(
          Stream.mapEffect((event) =>
            decodeMeta(event.meta).pipe(
              Effect.orDie,
              Effect.flatMap((meta) => options.hydrate(event.id, meta))
            )
          ),
          Stream.map((output) => EventAdded(output, true))
        )
    })
  }).pipe(Stream.unwrap)
})

/**
 * @since 1.0.0
 * @category combinators
 */
export const mapEffect: {
  <Meta, Context, E2, Context2>(
    f: (
      output: Output<Meta, Context>
    ) => Effect.Effect<Output<Meta, Context2>, E2, Source.Provided>
  ): <E>(source: Source<Meta, Context, E>) => Source<Meta, Context2, E2>
  <Meta, Context, E, E2, Context2>(
    self: Source<Meta, Context, E>,
    f: (
      output: Output<Meta, Context>
    ) => Effect.Effect<Output<Meta, Context2>, E2, Source.Provided>
  ): Source<Meta, Context2, E2>
} = dual(2, <Meta, Context, E, E2, Context2>(
  self: Source<Meta, Context, E>,
  f: (
    output: Output<Meta, Context>
  ) => Effect.Effect<Output<Meta, Context2>, E2, Source.Provided>
): Source<Meta, Context2, E | E2> =>
  make({
    events: self.events.pipe(
      Stream.mapEffect((event) =>
        event._tag === "Added" ?
          Effect.map(f(event.output), (output): Event<Meta, Context2> => EventAdded(output, event.initial)) :
          Effect.succeed(event)
      )
    ),
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
 * @category events
 */
export type Event<Meta, Context> = Event.Added<Meta, Context> | Event.Removed

/**
 * @since 1.0.0
 * @category events
 */
export const EventAdded = <Meta, Context>(output: Output<Meta, Context>, initial: boolean): Event<Meta, Context> => ({
  _tag: "Added",
  id: output.id,
  initial,
  output
})

/**
 * @since 1.0.0
 * @category events
 */
export const EventRemoved = (id: string): Event<never, never> => ({
  _tag: "Removed",
  id
})

/**
 * @since 1.0.0
 * @category events
 */
export declare namespace Event {
  /**
   * @since 1.0.0
   * @category events
   */
  export interface Added<out Meta, in Context> {
    readonly _tag: "Added"
    readonly initial: boolean
    readonly id: string
    readonly output: Output<Meta, Context>
  }

  /**
   * @since 1.0.0
   * @category events
   */
  export interface Removed {
    readonly _tag: "Removed"
    readonly id: string
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
  const loadMeta = (
    fs: FileSystem.FileSystem,
    path_: Path.Path,
    path: string
  ): Output<FileSystemMeta> =>
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

  const events = Effect.gen(function*() {
    const watchMode = yield* WatchMode
    const fs = yield* FileSystem.FileSystem
    const path_ = yield* Path.Path
    const cwd = path_.resolve()

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

    const pathMatch = (path: string) => {
      for (const p of options.paths) {
        if (Minimatch.minimatch(path, p)) {
          return true
        }
      }
      return false
    }

    const initialEvents = paths.map((path) => EventAdded(loadMeta(fs, path_, path), true))

    if (watchMode) {
      const topLevelDirs = new Set<string>()
      for (const path of paths) {
        const dir = path_.dirname(path)
        const match = Array.from(topLevelDirs).find((tld) => tld.startsWith(dir))
        if (!match) {
          topLevelDirs.add(dir)
          break
        } else if (match.length > dir.length) {
          topLevelDirs.delete(match)
          topLevelDirs.add(dir)
        }
      }
      const mailbox = yield* Mailbox.make<Event<FileSystemMeta, never>>()
      yield* mailbox.offerAll(initialEvents)

      for (const dir of topLevelDirs) {
        yield* fs.watch(dir).pipe(
          Stream.map((event) => ({
            ...event,
            path: path_.relative(cwd, event.path)
          })),
          Stream.filter((event) => pathMatch(event.path)),
          Stream.runForEach((event) =>
            mailbox.offer(
              event._tag === "Remove" ? EventRemoved(event.path) : EventAdded(loadMeta(fs, path_, event.path), false)
            )
          ),
          Effect.forkScoped
        )
      }

      return Mailbox.toStream(mailbox)
    }

    return Stream.fromIterable(initialEvents)
  }).pipe(Stream.unwrapScoped)

  return makeWithHydrate({
    events,
    metaSchema: FileSystemMeta,
    hydrate: Effect.fnUntraced(function*(_id, meta) {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return loadMeta(fs, path, meta.path)
    })
  })
}
