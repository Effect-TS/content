/**
 * @since 1.0.0
 */
import * as Schema from "@effect/schema/Schema"

/**
 * @since 1.0.0
 * @category type ids
 */
export const TypeId: unique symbol = Symbol.for("@effect/contentlayer-core/ContentlayerError")

/**
 * @since 1.0.0
 * @category type ids
 */
export type TypeId = typeof TypeId

/**
 * @since 1.0.0
 * @category models
 */
export class ContentlayerError
  extends Schema.TaggedError<ContentlayerError>("@effect/contentlayer-core/ContentlayerError")("ContentlayerError", {
    module: Schema.String,
    method: Schema.String,
    description: Schema.String,
    cause: Schema.optional(Schema.Defect)
  })
{
  /**
   * @since 1.0.0
   */
  readonly [TypeId]: TypeId = TypeId
  /**
   * @since 1.0.0
   */
  get message() {
    return `${this.module}.${this.method}: ${this.description}`
  }
}
