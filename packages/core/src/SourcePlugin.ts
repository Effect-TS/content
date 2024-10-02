/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import remarkParseFrontmatter from "remark-parse-frontmatter"
import remarkStringify from "remark-stringify"
import * as Unified from "unified"
import type * as Unist from "unist"
import { ContentlayerError } from "./ContentlayerError.js"
import type * as Source from "./Source.js"

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
    | Effect.Effect<Unified.Processor<ParseTree, HeadTree, TailTree, CompileTree, Out>, EX, Source.Source.Provided>
  readonly metadata: (_: Record<string, any>) => Record<string, any>
}) =>
<In, InErr>(source: Source.Source<In, InErr>): Source.Source<
  In,
  EX | InErr | ContentlayerError
> =>
  (Effect.isEffect(options.processor) ? options.processor : Effect.succeed(options.processor)).pipe(
    Effect.map((processor) =>
      source.pipe(
        Stream.mapEffect((output) =>
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
              output.addFields({
                body: vfile.value,
                ...options.metadata(vfile.data)
              })
            )
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
export const unifiedRemark = unified({
  processor: Unified.unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter),
  metadata: (data) => data.frontmatter ?? {}
})
