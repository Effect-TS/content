import * as Schema from "@effect/schema/Schema"
import type { Option } from "effect"
import { Effect } from "effect"
import type { Pipeable } from "effect/Pipeable"
import type { Invariant } from "effect/Types"

/*
---
title: Welcome to Effect!
...
---
*/

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

    // readonly addComputedField: <
    //   Name extends string,
    //   ResolverSchema extends Schema.Schema.Any
    // >(
    //   field: ComputedField<
    //     Name,
    //     Fields,
    //     ResolverSchema,
    //     Source extends DocumentSource<infer Meta> ? Meta : never
    //   >
    // ) => Document<
    //   Schema.Simplify<
    //     & Fields
    //     & {
    //       readonly [K in Name]: Schema.Schema.Type<ResolverSchema>
    //     }
    //   >,
    //   Source
    // >

    readonly addComputedFields: <Computed extends Record<string, AnyComputedField>>(
      fields: ExcludeDuplicateFields<Computed, Fields>
    ) => Document<Fields & Computed, Source>
  }

  export interface VarianceStruct<in out Fields> {
    readonly _Fields: Invariant<Fields>
  }

  export type ExcludeDuplicateFields<Computed, Existing> = HasDuplicateKeys<Computed, Existing> extends true
    ? [`ERROR: Field name already exists`]
    : {}

  export type HasDuplicateKeys<T, U> = keyof T extends infer K ? K extends keyof U ? true
    : false
    : false

  export type AnyComputedField = ComputedField<any, any, any, any>

  export interface ComputedField<
    Name extends string,
    ExistingFields,
    ResolverSchema extends Schema.Schema.Any,
    SourceMeta
  > {
    readonly name: ComputedFieldName<Name, ExistingFields>
    readonly description?: string
    readonly schema: ResolverSchema
    readonly resolve: (
      fields: ExistingFields,
      meta: SourceMeta
    ) => Effect.Effect<
      Schema.Schema.Type<ResolverSchema>
    >
  }

  export type ComputedFieldName<Name extends string, Fields> = Name extends keyof Fields ?
    [`Error: Field name "${Name}" already exists`]
    : Name
}

const SourceTypeId: unique symbol = Symbol.for("@effect/content/DocumentSource")

type SourceTypeId = typeof SourceTypeId

export interface DocumentSource<in out Meta> {
  readonly [SourceTypeId]: {
    readonly _Meta: Invariant<Meta>
  }
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
    name: "slug",
    description: "The title slug",
    schema: Schema.NonEmpty,
    resolve: (fields, sourceMeta) => Effect.succeed(fields.title.slice(0, 5))
  }
  // foo: {
  //   description: "The foo slug",
  //   schema: Schema.NonEmpty,
  //   resolve: (fields, sourceMeta) => Effect.succeed("FOO!")
  // }
})
// .addComputedFields({
// slug: {
//   description: "The better title slug",
//   schema: Schema.NonEmpty,
//   resolve: (fields, sourceMeta) => Effect.succeed(fields.slug.slice(0, 2))
// },
// foo: {
//   description: "The better title slug",
//   schema: Schema.NonEmpty,
//   resolve: (fields, sourceMeta) => Effect.succeed(fields.slug.slice(0, 2))
// }
// })

// .addComputedField({
//   name: "slug",
//   description: "The title slug",
//   schema: Schema.NonEmpty,
//   resolve: (fields, meta) => Effect.succeed(fields.title.slice(0, 5))
// })

// computedFields: {
//   slug: {
//     description: "The title slug",
//     schema: Schema.NonEmpty,
//     resolve: (fields, sourceMeta) => Effect.succeed(fields.title.slice(0, 5))
//   }
// }
