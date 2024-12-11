/**
 * @since 1.0.0
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { FileSystem } from "@effect/platform/FileSystem"
import { Path } from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { globalValue } from "effect/GlobalValue"
import type { ParseError } from "effect/ParseResult"
import * as Schema from "effect/Schema"
import type { BuiltDocument } from "./DocumentBuilder.js"

/**
 * @since 1.0.0
 * @category schemas
 */
export const PersistedDocument = <A, I, R>(fields: Schema.Schema<A, I, R>) => {
  if (persistedDocumentCache.has(fields)) {
    return persistedDocumentCache.get(fields) as Schema.Schema.Any
  }
  const schema = Schema.parseJson(
    Schema.Struct({
      id: Schema.String,
      fields,
      meta: Schema.Record({ key: Schema.String, value: Schema.Unknown })
    }),
    { space: 2 }
  )
  persistedDocumentCache.set(fields, schema)
  return schema
}

const persistedDocumentCache = globalValue(
  "@effect/contentlayer-core/DocumentStorage/persistedDocumentCache",
  () => new WeakMap<any, Schema.Schema.Any>()
)

/**
 * @since 1.0.0
 * @category services
 */
export class DocumentStorage extends Effect.Service<DocumentStorage>()("@effect/contentlayer-core/DocumentStorage", {
  effect: Effect.gen(function*() {
    const fs = yield* FileSystem
    const path_ = yield* Path

    const write = ({ document, fields, output }: BuiltDocument) =>
      Effect.gen(function*() {
        const persistedDocument = PersistedDocument(document.fields)
        const hashedId = yield* sha256(new TextEncoder().encode(output.id))
        const dir = path_.join(".contentlayer", "generated", document.name)
        const path = path_.join(dir, `${hashedId}.json`)
        yield* fs.makeDirectory(dir, { recursive: true })
        const encodedFieldsJson = yield* (Schema.encode(persistedDocument)({
          id: output.id,
          fields,
          meta: output.meta
        }) as Effect.Effect<string, ParseError>)
        yield* fs.writeFileString(path, encodedFieldsJson)
      })

    return { write } as const
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer]
}) {}

const sha256 = (data: Uint8Array) =>
  Effect.map(
    Effect.promise(() => crypto.subtle.digest("SHA-256", data)),
    (hash) => {
      const hashArray = Array.from(new Uint8Array(hash))
      const hashHex = hashArray
        .map((bytes) => bytes.toString(16).padStart(2, "0"))
        .join("")
      return hashHex
    }
  )
