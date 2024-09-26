/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import remarkParseFrontmatter from "remark-parse-frontmatter"
import remarkStringify from "remark-stringify"
import * as Unified from "unified"
import type * as Unist from "unist"
import { ContentlayerError } from "./ContentlayerError.js"
import type { Source } from "./Source.js"
import { ContentMeta } from "./Source.js"

/**
 * @since 1.0.0
 * @category unified
 */
export class UnifiedOutput extends Context.Tag("@effect/contentlayer-core/SourcePlugin/UnifiedOutput")<UnifiedOutput, {
  readonly value: unknown
  readonly data: Record<string, unknown>
}>() {}

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
>(
  processor:
    | Unified.Processor<ParseTree, HeadTree, TailTree, CompileTree, Out>
    | Effect.Effect<Unified.Processor<ParseTree, HeadTree, TailTree, CompileTree, Out>, EX, Source.Provided>
) =>
<In extends ContentMeta, InErr>(source: Source<In, InErr>): Source<
  In | UnifiedOutput,
  EX | InErr | ContentlayerError
> =>
  (Effect.isEffect(processor) ? processor : Effect.succeed(processor)).pipe(
    Effect.map((processor) =>
      source.pipe(
        Stream.mapEffect((meta) =>
          Context.unsafeGet(meta, ContentMeta).content.pipe(
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
            Effect.map((output) => Context.add(meta, UnifiedOutput, output))
          )
        )
      )
    ),
    Stream.unwrap
  )

/**
 * @since 1.0.0
 * @category unified
 */
export const unifiedRemark = unified(
  Unified.unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
)
