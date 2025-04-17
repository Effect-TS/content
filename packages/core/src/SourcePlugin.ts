/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { constTrue } from "effect/Function"
import * as Mailbox from "effect/Mailbox"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Remove from "unist-util-remove"
import type { VFile } from "vfile"
import { ContentlayerError } from "./ContentlayerError.ts"
import * as Source from "./Source.ts"

/**
 * @since 1.0.0
 * @category References
 */
export class Enabled extends Context.Reference<Enabled>()("@effect/contentlayer/SourcePlugin/Enabled", {
  defaultValue: constTrue
}) {}

/**
 * @since 1.0.0
 * @category Plugins
 */
export const make = <E2, Meta, Context, Context2>(
  f: (
    stream: Stream.Stream<Source.Output<Meta, Context>>
  ) => Stream.Stream<Source.Output<Meta, Context2>, E2, Source.Source.Provided>
) =>
<E>(self: Source.Source<Meta, Context, E>): Source.Source<Meta, Context2, E | E2> => {
  const events = Effect.gen(function*() {
    const enabled = yield* Enabled
    if (!enabled) {
      return self.events as Stream.Stream<Source.Event<Meta, Context2>, E | E2>
    }

    const latch = yield* Effect.makeLatch(true)
    const mailbox = yield* Mailbox.make<Source.Output<Meta, Context>>()
    const events = yield* Mailbox.make<Source.Event<Meta, Context2>, E | E2>()
    let initial = true

    yield* self.events.pipe(
      Stream.mapEffect(Effect.fnUntraced(function*(event) {
        yield* latch.await
        if (event._tag === "Removed") {
          return yield* events.offer(event)
        }
        if (initial && !event.initial) {
          initial = false
        }
        yield* mailbox.offer(event.output)
        latch.unsafeClose()
      })),
      Stream.runDrain,
      Effect.onExit((exit) => exit._tag === "Success" ? mailbox.end : events.failCause(exit.cause)),
      Effect.interruptible,
      Effect.forkScoped
    )

    yield* f(Mailbox.toStream(mailbox)).pipe(
      Stream.runForEach((output) =>
        events.offer(Source.EventAdded(output, initial)).pipe(
          Effect.andThen(latch.open)
        )
      ),
      Mailbox.into(events),
      Effect.interruptible,
      Effect.forkScoped
    )

    return Mailbox.toStream(events)
  }).pipe(Stream.unwrapScoped)

  return Source.make({ events, metaSchema: self.metaSchema })
}

/**
 * @since 1.0.0
 * @category unified
 */
export class UnifiedOutput extends Context.Tag("@effect/contentlayer/SourcePlugin/UnifiedOutput")<
  UnifiedOutput,
  VFile
>() {}

/**
 * A plugin for processing content using the unified library.
 *
 * ```ts
 * import { SourcePlugin } from "@effect/contentlayer"
 * import { unified } from "unified"
 *
 * SourcePlugin.unified({
 *   processor: unified()
 *     .use(remarkParse)
 *     .use(remarkStringify)
 *     .use(remarkFrontmatter)
 *     .use(remarkParseFrontmatter)
 *     .use(unifiedRemoveYaml)
 *     .use(remarkRehype)
 *     .use(rehypeFormat)
 *     .use(rehypeStringify),
 * })
 * ```
 *
 * @since 1.0.0
 * @category unified
 */
export const unified = <
  EX = never
>(options: {
  readonly processor:
    | UnifiedProcessor
    | Effect.Effect<UnifiedProcessor, EX, Source.Source.Provided | Scope.Scope>
  readonly extractFields?: ((vfile: VFile) => Record<string, any>) | undefined
}): <Meta, In, E>(
  source: Source.Source<Meta, In, E>
) => Source.Source<Meta, In | UnifiedOutput, E | EX | ContentlayerError> =>
  make(Effect.fnUntraced(function*(stream) {
    const processor = Effect.isEffect(options.processor) ? yield* options.processor : options.processor
    return Stream.mapEffect(stream, (output) =>
      output.content.pipe(
        Effect.tryMapPromise({
          try: (content) => processor.process(content),
          catch: (cause) =>
            new ContentlayerError({
              module: "SourcePlugin",
              method: "unified",
              description: "Error processing content",
              cause
            })
        }),
        Effect.map((vfile) =>
          output
            .addContext(UnifiedOutput, vfile)
            .addFields((options.extractFields ?? unifiedDefaultFields)(vfile))
        )
      ))
  }, Stream.unwrapScoped))

/**
 * @since 1.0.0
 * @category unified
 */
export interface UnifiedProcessor {
  process(...args: ReadonlyArray<any>): Promise<any>
}

/**
 * @since 1.0.0
 * @category unified
 */
export const unifiedRemoveYaml = () => (tree: any) => {
  Remove.remove(tree, "yaml")
}

/**
 * @since 1.0.0
 * @category unified
 */
export const unifiedDefaultFields = (vfile: VFile): Record<string, any> => ({
  ...vfile.data,
  ...vfile.data?.frontmatter as any,
  body: vfile.value
})
