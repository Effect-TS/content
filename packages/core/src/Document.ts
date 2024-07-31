import * as Schema from "@effect/schema/Schema"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Pipeable } from "effect/Pipeable"
import type { Invariant } from "effect/Types"
import * as Source from "./Source.js"

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
    ReadonlyArray<
      Document.AnyComputedField & { readonly name: string }
    >
  >
}

export declare namespace Document {
  export interface Proto<
    in out Fields,
    in out Source extends Source.Source.Any
  > extends Pipeable {
    readonly [TypeId]: VarianceStruct<Fields>

    readonly addComputedFields: <ComputedFieldSchemas extends Record<string, Schema.Schema.Any>>(
      fields: ExcludeDuplicates<ComputedFieldSchemas, Fields, Source.Source.Meta<Source>>
    ) => Document<Schema.Simplify<MergeComputedFields<Fields, ComputedFieldSchemas>>, Source>
  }

  export interface VarianceStruct<in out Fields> {
    readonly _Fields: Invariant<Fields>
  }

  export type ExcludeDuplicates<ComputedFieldSchemas extends Record<string, Schema.Schema.Any>, Fields, SourceMeta> = {
    [Name in keyof ComputedFieldSchemas]: Name extends (keyof Fields & string) ? "ERROR: I hate my mouse" :
      ComputedField<
        Fields,
        ComputedFieldSchemas[Name],
        SourceMeta
      >
  }

  export type MergeComputedFields<Fields, ComputedFieldSchemas> =
    & Fields
    & {
      readonly [Name in keyof ComputedFieldSchemas]: Schema.Schema.Type<ComputedFieldSchemas[Name]>
    }

  export type AnyComputedField = ComputedField<any, any, any>

  export interface ComputedField<
    Fields,
    ResolverSchema extends Schema.Schema.Any,
    SourceMeta
  > {
    readonly description?: string
    readonly schema: ResolverSchema
    readonly resolve: (
      fields: Fields,
      meta: SourceMeta
    ) => Effect.Effect<Schema.Schema.Type<ResolverSchema>>
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
  readonly computedFields: ReadonlyArray<ReadonlyArray<Document.AnyComputedField & { readonly name: string }>>
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

const Author = Schema.Struct({
  name: Schema.NonEmptyString,
  twitter: Schema.optional(Schema.String)
})

export const Post = make({
  name: "Post",
  description: "The posts",
  source: Source.fileSystem({ path: "content/posts/**/*.mdx?" }),
  fields: {
    title: Schema.NonEmptyString,
    author: Author
  }
}).addComputedFields({
  slug: {
    description: "The title slug",
    schema: Schema.NonEmptyString,
    resolve: (fields) => Effect.succeed(fields.title.slice(0, 5))
  },
  slug2: {
    description: "The title slug",
    schema: Schema.NonEmptyString,
    resolve: (fields) => Effect.succeed(fields.title.slice(0, 5))
  }
}).addComputedFields({
  slug3: {
    description: "The title slug",
    schema: Schema.Number,
    resolve: () => Effect.succeed(1)
  }
})
