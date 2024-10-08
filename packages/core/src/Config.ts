import * as Predicate from "effect/Predicate"
import type { Document } from "./Document.js"

export const TypeId = Symbol.for("@effect/contentlayer/Config")

export type TypeId = typeof TypeId

export interface Config extends Config.Proto {
  readonly documents: ReadonlyArray<Document.Any>
}

export declare namespace Config {
  export interface Proto {
    readonly [TypeId]: TypeId
  }

  export type Raw = Omit<Config, TypeId>
}

export const isConfig = (u: unknown): u is Config => Predicate.hasProperty(u, TypeId)

export const make = (options: Config.Raw): Config => ({
  [TypeId]: TypeId,
  ...options
})
