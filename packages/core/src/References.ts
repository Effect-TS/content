/**
 * @since 1.0.0
 */
import * as Context from "effect/Context"

/**
 * @since 1.0.0
 * @category references
 */
export class WatchMode extends Context.Reference<WatchMode>()("@effect/contentlayer/References/WatchMode", {
  defaultValue: () => false
}) {}
