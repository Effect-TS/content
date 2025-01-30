/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
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
      Source.Source.Provided
    >
  readonly extractFields: (vfile: VFile) => Record<string, any>
}) =>
<Meta, In, E>(
  source: Source.Source<Meta, In, E>
): Source.Source<Meta, In | UnifiedOutput, E | EX | ContentlayerError> => {
  const processor = (Effect.isEffect(options.processor) ? options.processor : Effect.succeed(options.processor)).pipe(
    Effect.cached,
    Effect.runSync
  )
  return Source.mapEffect(
    source,
    (output) =>
      processor.pipe(
        Effect.flatMap((processor) =>
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
          )
        )
      )
  )
}

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
