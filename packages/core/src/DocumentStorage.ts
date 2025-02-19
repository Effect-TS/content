/**
 * @since 1.0.0
 */
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import * as NodePath from "@effect/platform-node/NodePath"
import { FileSystem } from "@effect/platform/FileSystem"
import { Path } from "@effect/platform/Path"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import { globalValue } from "effect/GlobalValue"
import type { ParseError } from "effect/ParseResult"
import * as Schema from "effect/Schema"
import type { Document } from "./Document.js"
import type { BuiltDocument } from "./DocumentBuilder.js"
import * as TypeBuilder from "./TypeBuilder.js"

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
    const outputDir = path_.join(".contentlayer", "generated")

    const write = Effect.fnUntraced(function*({ document, fields, output }: BuiltDocument) {
      const persistedDocument = PersistedDocument(document.fields)
      const hashedId = yield* sha256String(output.id)
      const dir = path_.join(outputDir, document.name)
      const path = path_.join(dir, `${hashedId}.json`)
      yield* fs.makeDirectory(dir, { recursive: true })
      const encodedFieldsJson = yield* (Schema.encode(persistedDocument)({
        id: output.id,
        fields,
        meta: output.meta
      }) as Effect.Effect<string, ParseError>)
      yield* fs.writeFileString(path, encodedFieldsJson)
    })

    const writeIndex = Effect.fnUntraced(function*(documents: ReadonlyArray<Document.Any>) {
      const tld = path_.join(".contentlayer")
      const dir = path_.join(tld, "generated")
      yield* fs.makeDirectory(dir, { recursive: true })

      // package.json
      const packageJson = {
        "name": "@effect/contentlayer-generated",
        "type": "module",
        "typesVersions": {
          "*": {
            "generated": ["./generated"]
          }
        },
        "exports": {
          ".": "./generated.js"
        }
      }
      yield* fs.writeFileString(path_.join(tld, "package.json"), JSON.stringify(packageJson, null, 2))

      // types.d.ts
      const types = documents.map((doc) => TypeBuilder.renderDocument(doc))
      yield* fs.writeFileString(path_.join(dir, "types.d.ts"), types.join("\n\n"))

      // generated.d.ts
      const collectionExports = documents.map((doc) => `export const all${doc.name}s: ReadonlyArray<${doc.name}>`)

      yield* fs.writeFileString(
        path_.join(tld, "generated.d.ts"),
        `import { ${documents.map((doc) => doc.name).join(", ")} } from "./generated/types.d.js"

export * from "./generated/types.d.js"

${collectionExports.join("\n\n")}
`
      )

      // generated.js
      const imports: Array<string> = []
      const exports: Array<string> = []

      for (const document of documents) {
        imports.push(`import all${document.name}s from "./generated/${document.name}/index.js"`)
        exports.push(`all${document.name}s`)
      }

      yield* fs.writeFileString(
        path_.join(tld, "generated.js"),
        `${imports.join("\n")}

export { ${exports.join(", ")} }`
      )
    })

    const currentIdHashes = new Map<string, Array<string>>()

    const writeIds = Effect.fnUntraced(function*(documentName: string, newIds: Iterable<string>) {
      let idHashes = currentIdHashes.get(documentName)
      if (!idHashes) {
        const files = yield* Effect.orDie(fs.readDirectory(path_.join(outputDir, documentName)))
        idHashes = files
          .filter((file) => file.endsWith(".json"))
          .map((file) => path_.basename(file, ".json"))
        currentIdHashes.set(documentName, idHashes)
      }

      // generate index
      const newIdsArr = Arr.empty<string>()
      const imports = Arr.empty<string>()
      const exports = Arr.empty<string>()
      const toRemove = new Set<string>(idHashes)
      let i = 1
      for (const id of newIds) {
        const index = i++
        const idHash = yield* sha256String(id)
        newIdsArr.push(idHash)
        imports.push(`import document${index} from "./${idHash}.json" assert { type: "json" }`)
        exports.push(`document${index}`)
        toRemove.delete(idHash)
      }

      // update currentIds
      currentIdHashes.set(documentName, newIdsArr)

      const output = `${imports.join("\n")}

export default [${exports.join(", ")}]
`
      yield* fs.writeFileString(path_.join(outputDir, documentName, "index.js"), output)

      // remove missing ids
      yield* Effect.ignore(
        Effect.forEach(toRemove, (id) => fs.remove(path_.join(outputDir, documentName, `${id}.json`)), {
          concurrency: 15
        })
      )
    })

    return { write, writeIds, writeIndex } as const
  }),
  dependencies: [NodeFileSystem.layer, NodePath.layer]
}) {}

const hashCache = new Map<string, string>()
const sha256String = (data: string) => {
  if (hashCache.has(data)) {
    return Effect.succeed(hashCache.get(data)!)
  }
  return Effect.tap(sha256(new TextEncoder().encode(data)), (hash) => {
    hashCache.set(data, hash)
  })
}

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
