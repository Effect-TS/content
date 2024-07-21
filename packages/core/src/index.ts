import * as Schema from "@effect/schema/Schema"
import type { Option } from "effect"
import { Effect } from "effect"
import type { Pipeable } from "effect/Pipeable"
import type { Invariant } from "effect/Types"

export const TypeId: unique symbol = Symbol.for("@effect/content/Document")

export type TypeId = typeof TypeId

export interface Document<
  in out Fields,
  in out Source extends DocumentSource<any>
> extends Document.Proto<Fields, Source> {
  readonly name: string
  readonly description: Option.Option<string>
  readonly source: Source
  readonly fields: Schema.Struct.Fields
}

export declare namespace Document {
  export interface Proto<
    in out Fields,
    in out Source extends DocumentSource<any>
  > extends Pipeable {
    readonly [TypeId]: VarianceStruct<Fields>

    readonly addComputedFields: <FieldSchemas extends Record<string, Schema.Schema.Any>>(
      fields: HasDuplicateKeys<FieldSchemas, Fields> extends true ? ["Error: Field name already exists"] : {
        [Name in keyof FieldSchemas]: ComputedField<Fields, FieldSchemas[Name], DocumentSource.Meta<Source>>
      }
    ) => Document<Schema.Simplify<MergeComputedFields<Fields, FieldSchemas>>, Source>
  }

  export interface VarianceStruct<in out Fields> {
    readonly _Fields: Invariant<Fields>
  }

  export type HasDuplicateKeys<T, U> = keyof T extends infer K ? K extends keyof U ? true
    : false
    : false

  export type MergeComputedFields<Fields, ComputedFieldSchemas> =
    & Fields
    & {
      readonly [Name in keyof ComputedFieldSchemas]: Schema.Schema.Type<ComputedFieldSchemas[Name]>
    }

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
    ) => Effect.Effect<
      Schema.Schema.Type<ResolverSchema>
    >
  }
}

const SourceTypeId: unique symbol = Symbol.for("@effect/content/DocumentSource")

type SourceTypeId = typeof SourceTypeId

export interface DocumentSource<in out Meta> extends DocumentSource.Proto<Meta> {}

export declare namespace DocumentSource {
  export interface Proto<in out Meta> {
    readonly [SourceTypeId]: VarianceStruct<Meta>
  }

  export interface VarianceStruct<in out Meta> {
    readonly _Meta: Invariant<Meta>
  }

  export type Meta<Source> = Source extends DocumentSource<infer Meta> ? Meta : never
}

export interface FileSystemSource extends
  DocumentSource<{
    readonly path: string
  }>
{}

declare function make<
  Fields extends Schema.Struct.Fields,
  Source extends DocumentSource<any>
>(options: {
  readonly name: string
  readonly description?: string
  readonly source: Source
  readonly fields: Fields
}): Document<Schema.Simplify<Schema.Struct.Type<Fields>>, Source>

declare function fileSystem(options: any): FileSystemSource

const Author = Schema.Struct({
  name: Schema.NonEmpty,
  twitter: Schema.optional(Schema.String)
})

export const Post = make({
  name: "Post",
  description: "The posts",
  source: fileSystem({ path: "content/posts/**/*.mdx?" }),
  fields: {
    title: Schema.NonEmpty,
    author: Author
  }
}).addComputedFields({
  slug: {
    description: "The title slug",
    schema: Schema.NonEmpty,
    resolve: (fields, sourceMeta) => Effect.succeed(fields.title.slice(0, 5))
  }
})
