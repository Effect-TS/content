/**
 * @since 1.0.0
 */
import * as Effect from "effect/Effect"
import type { ParseError } from "effect/ParseResult"
import * as ParseResult from "effect/ParseResult"
import { hasProperty, isTagged } from "effect/Predicate"
import * as Schema from "effect/Schema"

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

/**
 * @since 1.0.0
 * @category models
 */
export class BuildError extends Schema.TaggedError<BuildError>()("BuildError", {
  parseError: Schema.String,
  documentType: Schema.String,
  documentId: Schema.String
}) {
  /**
   * @since 1.0.0
   */
  readonly [TypeId]: TypeId = TypeId

  /**
   * @since 1.0.0
   */
  static fromParseError(options: {
    readonly parseError: ParseError
    readonly documentType: string
    readonly documentId: string
  }) {
    return new BuildError({
      ...options,
      parseError: ParseResult.TreeFormatter.formatErrorSync(options.parseError)
    })
  }

  /**
   * @since 1.0.0
   */
  get message() {
    return this.parseError
  }

  /**
   * @since 1.0.0
   */
  static is(value: unknown): value is BuildError {
    return hasProperty(value, TypeId) && isTagged(value, "BuildError")
  }

  /**
   * @since 1.0.0
   */
  static catchAndLog = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A | void, Exclude<E, BuildError>, R> =>
    Effect.catchIf(
      effect,
      BuildError.is,
      (error) => Effect.annotateLogs(Effect.logError("Error building document", error.message), error.annotations)
    ) as any

  /**
   * @since 1.0.0
   */
  get annotations() {
    return { documentType: this.documentType, documentId: this.documentId }
  }
}
