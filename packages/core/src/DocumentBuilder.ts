/**
 * @since 1.0.0
 */
import { Context } from "effect"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"
import { ConfigBuilder } from "./ConfigBuilder.js"

const make = Effect.gen(function*() {
  const config = yield* ConfigBuilder

  const documents = config.config.pipe(
    Stream.flatMap((config) => Stream.fromIterable(config.documents)),
    Stream.bindTo("document"),
    Stream.bind("source", ({ document }) => document.source as Stream.Stream<unknown>),
    Stream.runForEach(Effect.log),
    Effect.forkScoped
  )

  yield* documents
})

export class DocumentBuilder extends Context.Tag("@effect/contentlayer-core/DocumentBuilder")<
  DocumentBuilder,
  Effect.Effect.Success<typeof make>
>() {
  static readonly layer = Layer.scoped(DocumentBuilder, make)
  static readonly Live = this.layer.pipe(
    Layer.provide(ConfigBuilder.Live)
  )
}
