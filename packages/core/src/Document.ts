/**
 * @since 1.0.0
 */
import type * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Pipeable } from "effect/Pipeable"
import * as Schema from "effect/Schema"
import type { Invariant } from "effect/Types"
import type * as Source from "./Source.js"

export const TypeId: unique symbol = Symbol.for("@effect/content/Document")

export type TypeId = typeof TypeId

export interface Document<
  in out Fields extends Schema.Struct.Fields,
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
  readonly fields: Schema.Struct<Fields>
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
    ReadonlyArray<
      Document.AnyComputedField & { readonly name: string }
    >
  >
}

export declare namespace Document {
  export interface Proto<
    in out Fields extends Schema.Struct.Fields,
    in out Source extends Source.Source.Any
  > extends Pipeable {
    readonly [TypeId]: VarianceStruct<Fields>

    readonly addComputedFields: <ComputedFieldSchemas extends Record<string, Schema.Schema.Any>>(
      fields: ExcludeDuplicates<ComputedFieldSchemas, Fields, Source.Source.Success<Source>>
    ) => Document<Schema.Simplify<MergeComputedFields<Fields, ComputedFieldSchemas>>, Source>
  }

  export interface VarianceStruct<in out Fields> {
    readonly _Fields: Invariant<Fields>
  }

  export interface Any {
    readonly [TypeId]: any
    readonly name: string
  }

  export interface AnyWithProps {
    readonly [TypeId]: any
    readonly name: string
    readonly fields: Schema.Schema.Any
    readonly source: Source.Source.Any
    readonly computedFields: ReadonlyArray<ReadonlyArray<AnyComputedField & { readonly name: string }>>
  }

  export type Source<Doc extends Any> = Doc extends Document<infer _Fields, infer _Source> ? _Source : never

  export type Fields<Doc extends Any> = Doc extends Document<infer _Fields, infer _Source> ? _Fields : never

  export type ExcludeDuplicates<
    ComputedFieldSchemas extends Record<string, Schema.Schema.Any>,
    Fields extends Schema.Struct.Fields,
    Output extends Source.Output.Any
  > = {
    [Name in keyof ComputedFieldSchemas]: Name extends (keyof Fields & string) ? `Duplicate field: ${Name}` :
      ComputedField<
        Fields,
        ComputedFieldSchemas[Name],
        Output
      >
  }

  export type MergeComputedFields<Fields, ComputedFieldSchemas> =
    & Fields
    & {
      readonly [Name in keyof ComputedFieldSchemas]: Schema.Schema.Type<ComputedFieldSchemas[Name]>
    }

  export type AnyComputedField = ComputedField<any, any, any>

  export interface ComputedField<
    Fields extends Schema.Struct.Fields,
    ResolverSchema extends Schema.Schema.Any,
    Output extends Source.Output.Any
  > {
    readonly description?: string
    readonly schema: ResolverSchema
    readonly resolve: (
      fields: Schema.Simplify<Schema.Struct.Type<Fields>>,
      output: Output
    ) => Effect.Effect<Schema.Schema.Type<ResolverSchema>>
  }

  export interface Output<Document extends Any> {
    readonly meta: Source.Source.Meta<Document.Source<Document>>
    readonly fields: Schema.Schema.Type<Document.Fields<Document>>
  }
}

const variance = {
  _Fields: (_: any) => _
}

const Proto = {
  [TypeId]: variance,
  addComputedFields(this: Document<any, any>, fields: Record<string, Document.AnyComputedField>) {
    const computedFields = Object.entries(fields).map(([name, field]) => ({ name, ...field }))
    return makeInternal({
      name: this.name,
      description: this.description,
      source: this.source,
      fields: this.fields as any,
      computedFields: [...this.computedFields, computedFields]
    })
  }
}

const makeInternal = (options: {
  readonly name: string
  readonly description: Option.Option<string>
  readonly source: Source.Source.Any
  readonly fields: Schema.Struct<any>
  readonly computedFields: ReadonlyArray<ReadonlyArray<Document.AnyComputedField & { readonly name: string }>>
}) =>
  Object.assign(Object.create(Proto), {
    name: options.name,
    description: options.description,
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
}): Document<Fields, Source> =>
  makeInternal({
    name: validateDocumentName(options.name),
    description: Option.fromNullable(options.description),
    source: options.source,
    fields: Schema.Struct(options.fields),
    computedFields: []
  })

const validateDocumentName = (name: string) => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Document name "${name}" is not a valid variable name`)
  }
  return name
}
