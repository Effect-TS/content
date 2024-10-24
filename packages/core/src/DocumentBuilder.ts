/**
 * @since 1.0.0
 */
import * as Console from "effect/Console"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { ConfigBuilder } from "./ConfigBuilder.js"

const make = Effect.gen(function*() {
  const config = yield* ConfigBuilder

  const documents = config.config.pipe(
    Stream.flatMap((config) => Stream.fromIterable(config.documents)),
    Stream.bindTo("document"),
    Stream.bind("source", ({ document }) =>
      document.source.pipe(
        Stream.catchAllCause((cause) => Stream.drain(Effect.logError(cause)))
      ) as Stream.Stream<Context.Context<never>>),
    Stream.runForEach((_) => Console.dir(_.source, { depth: null })),
    Effect.forkScoped
  )

  yield* documents
}).pipe(
  Effect.annotateLogs({
    module: "DocumentBuilder"
  })
)

export class DocumentBuilder extends Context.Tag("@effect/contentlayer-core/DocumentBuilder")<
  DocumentBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static readonly layer = Layer.scoped(DocumentBuilder, make)

  static readonly Live = this.layer.pipe(
    Layer.provide(ConfigBuilder.Live)
  )
}
