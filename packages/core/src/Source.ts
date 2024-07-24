import type { Invariant } from "effect/Types"

export const TypeId: unique symbol = Symbol.for("@effect/content/Source")

export type TypeId = typeof TypeId

export interface Source<in out Meta> extends Source.Proto<Meta> {}

export declare namespace Source {
  export interface Proto<in out Meta> {
    readonly [TypeId]: VarianceStruct<Meta>
  }

  export interface VarianceStruct<in out Meta> {
    readonly _Meta: Invariant<Meta>
  }

  export type Any = Source<any>

  export type Meta<S> = S extends Source<infer Meta> ? Meta : never
}

export interface FileSystemSource extends
  Source<{
    readonly path: string
  }>
{}

export const fileSystem = (_: any): FileSystemSource => ({}) as any
