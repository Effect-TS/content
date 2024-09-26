/**
 * @since 1.0.0
 */
import { Effect, Stream } from "effect"
import type * as Types from "effect/Types"
import remarkFrontmatter from "remark-frontmatter"
import remarkParse from "remark-parse"
import remarkParseFrontmatter from "remark-parse-frontmatter"
import remarkStringify from "remark-stringify"
import * as Unified from "unified"
import type * as Unist from "unist"
import { ContentlayerError } from "./ContentlayerError.js"
import type { Source } from "./Source.js"

/**
 * @since 1.0.0
 * @category constructors
 */
export const make = <In, InErr, Out, OutErr>(f: (source: Source<In, InErr>) => Source<Out, OutErr>) => f

/**
 * @since 1.0.0
 * @category unified
 */
export interface UnifiedOutput<Out, Data> {
  readonly value: Out
  readonly data: Data
}

/**
 * @since 1.0.0
 * @category unified
 */
export const unified = <Data = {}>() =>
<
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
<In extends Source.ContentMeta, InErr>(source: Source<In, InErr>): Source<
  Types.Simplify<
    In & {
      readonly output: UnifiedOutput<Out, Data>
    }
  >,
  EX | InErr | ContentlayerError
> =>
  (Effect.isEffect(processor) ? processor : Effect.succeed(processor)).pipe(
    Effect.map((processor) =>
      source.pipe(
        Stream.mapEffect((meta) =>
          meta.content.pipe(
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
            Effect.map((output) => ({ ...meta, output } as any))
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
export const unifiedRemark = unified<{
  readonly frontmatter: Record<string, string>
}>()(
  Unified.unified()
    .use(remarkParse)
    .use(remarkStringify)
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
)
