/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Mailbox from "effect/Mailbox"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import rehypeFormat from "rehype-format"
import rehypeStringify from "rehype-stringify"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import remarkParseFrontmatter from "remark-parse-frontmatter"
import remarkRehype from "remark-rehype"
import remarkStringify from "remark-stringify"
import * as Unified from "unified"
import type * as Unist from "unist"
import * as Remove from "unist-util-remove"
import type { VFile } from "vfile"
import { ContentlayerError } from "./ContentlayerError.js"
import * as Source from "./Source.js"

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
export class UnifiedOutput extends Context.Tag("@effect/contentlayer-core/SourcePlugin/UnifiedOutput")<
  UnifiedOutput,
  VFile
>() {}

/**
 * @since 1.0.0
 * @category unified
 */
export const unified = <
  ParseTree extends Unist.Node,
  HeadTree extends Unist.Node,
  TailTree extends Unist.Node,
  CompileTree extends Unist.Node,
  Out extends Unified.CompileResults,
  EX = never
>(options: {
  readonly processor:
    | Unified.Processor<ParseTree, HeadTree, TailTree, CompileTree, Out>
    | Effect.Effect<
      Unified.Processor<ParseTree, HeadTree, TailTree, CompileTree, Out>,
      EX,
      Source.Source.Provided | Scope.Scope
    >
  readonly extractFields: (vfile: VFile) => Record<string, any>
}): <Meta, In, E>(
  source: Source.Source<Meta, In, E>
) => Source.Source<Meta, In | UnifiedOutput, E | EX | ContentlayerError> =>
  make((stream) =>
    Effect.gen(function*() {
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
              .addFields(options.extractFields(vfile))
          )
        ))
    }).pipe(Stream.unwrapScoped)
  )

const removeYaml: Unified.Plugin = () => (tree) => {
  Remove.remove(tree, "yaml")
}

/**
 * @since 1.0.0
 * @category unified
 */
export const unifiedRemark = unified({
  processor: Unified.unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
    .use(removeYaml),
  extractFields: (vfile) => ({
    ...vfile.data,
    ...vfile.data?.frontmatter as any,
    body: vfile.value
  })
})

/**
 * @since 1.0.0
 * @category unified
 */
export const unifiedRemarkRehype = unified({
  processor: Unified.unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
    .use(removeYaml)
    .use(remarkRehype)
    .use(rehypeFormat)
    .use(rehypeStringify),
  extractFields: (vfile) => ({
    ...vfile.data,
    ...vfile.data?.frontmatter as any,
    body: vfile.value
  })
})
