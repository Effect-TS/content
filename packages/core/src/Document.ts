import type * as Schema from "@effect/schema/Schema"
import type * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Pipeable } from "effect/Pipeable"
import type { Invariant } from "effect/Types"
import type * as Source from "./Source.js"

export const TypeId: unique symbol = Symbol.for("@effect/content/Document")

export type TypeId = typeof TypeId

export interface Document<
  in out Fields,
  in out Source extends Source.Source.Any
> extends Document.Proto<Fields, Source> {
  /**
   * The name of the document.
   */
  readonly name: string
  /**
   * An optional description for the document.
   */
  readonly description: Option.Option<string>
  /**
   * The document source.
   */
  readonly source: Source
  /**
   * The fields schema for the document.
   */
  readonly fields: Schema.Struct.Fields
  /**
   * The computed fields for the document.
   *
   *   - Groups of computed fields are resolved sequentially
   *   - Fields within each group will be resolved concurrently
   *   - The first argument to a group's field resolver will be the prior
   *     group's computed fields joined with the document's fields
   *   - The second argument to a group's field resolvers will be the metadata
   *     provided by the document source
   */
  readonly computedFields: ReadonlyArray<
    ReadonlyArray<Document.AnySchemaWithResolver & { readonly name: string }>
  >
}

export declare namespace Document {
  export interface Proto<
    in out Fields,
    in out Source extends Source.Source.Any
  > extends Pipeable {
    readonly [TypeId]: VarianceStruct<Fields>

    readonly addFields: <FieldSchemas extends Record<string, Schema.Schema.Any>>(
      fields: (fields: Fields, source: Source.Source.Meta<Source>) => ExcludeDuplicates<FieldSchemas, Fields>
    ) => Document<Schema.Simplify<MergeFields<Fields, FieldSchemas>>, Source>
  }

  export interface VarianceStruct<in out Fields> {
    readonly _Fields: Invariant<Fields>
  }

  export type Any = Document<any, any>

  export type ExcludeDuplicates<FieldSchemas extends Record<string, Schema.Schema.Any>, Fields> = {
    [Name in keyof FieldSchemas]: Name extends (keyof Fields & string) ? `ERROR: Duplicate property key: ${Name}` :
      SchemaWithResolver<FieldSchemas[Name]>
  }

  export type MergeFields<Fields, FieldSchemas> =
    & Fields
    & { readonly [Name in keyof FieldSchemas]: Schema.Schema.Type<FieldSchemas[Name]> }

  export type AnySchemaWithResolver = SchemaWithResolver<any>

  export type SchemaWithResolver<S extends Schema.Schema.Any> = {
    schema: S
    resolve: Effect.Effect<Schema.Schema.Type<S>>
  }
}

const variance = {
  _Fields: (_: any) => _
}

const Proto = {
  [TypeId]: variance,
  addFields(this: Document<any, any>, fields: Record<string, Document.AnySchemaWithResolver>) {
    const computedFields = Object.entries(fields).map(([name, field]) => ({ name, ...field }))
    return makeInternal({
      name: this.name,
      description: this.description,
      source: this.source,
      fields: this.fields,
      computedFields: [...this.computedFields, computedFields]
    })
  }
}

const makeInternal = (options: {
  readonly name: string
  readonly description: Option.Option<string>
  readonly source: Source.Source.Any
  readonly fields: Schema.Struct.Fields
  readonly computedFields: ReadonlyArray<ReadonlyArray<Document.AnySchemaWithResolver & { readonly name: string }>>
}) =>
  Object.assign(Object.create(Proto), {
    name: options.name,
    description: Option.fromNullable(options.description),
    source: options.source,
    fields: options.fields,
    computedFields: options.computedFields
  })

export const make = <
  Fields extends Schema.Struct.Fields,
  Source extends Source.Source.Any
>(options: {
  readonly name: string
  readonly description?: string
  readonly source: Source
  readonly fields: Fields
}): Document<Schema.Simplify<Schema.Struct.Type<Fields>>, Source> =>
  makeInternal({
    name: options.name,
    description: Option.fromNullable(options.description),
    source: options.source,
    fields: options.fields,
    computedFields: []
  })
