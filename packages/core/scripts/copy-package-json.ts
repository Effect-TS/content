import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem"
import { FileSystem } from "@effect/platform/FileSystem"
import { Effect, pipe } from "effect"
import * as path from "node:path"

const read = Effect.gen(function*() {
  const fs = yield* FileSystem

  const entrypoints = (yield* fs.readDirectory("src")).filter((path) => !["index.ts", "bin.ts"].includes(path))
  const exports: Record<string, any> = {
    ".": {
      types: "./dts/index.d.ts",
      import: "./index.mjs",
      default: "./index.js"
    }
  }
  for (const entrypoint of entrypoints) {
    const name = entrypoint.replace(/\.ts$/, "")
    exports[`./${name}`] = {
      types: `./dts/${name}.d.ts`,
      import: `./${name}.mjs`,
      default: `./${name}.js`
    }
  }

  const json = JSON.parse(yield* fs.readFileString("package.json"))

  return {
    name: json.name,
    version: json.version,
    description: json.description,
    bin: {
      contentlayer: "./bin.js"
    },
    main: "./index.js",
    exports,
    engines: json.engines,
    repository: json.repository,
    author: json.author,
    license: json.license,
    bugs: json.bugs,
    homepage: json.homepage,
    tags: json.tags,
    keywords: json.keywords
  }
})

const pathTo = path.join("dist", "package.json")

const write = (pkg: object) =>
  pipe(
    FileSystem,
    Effect.flatMap((fileSystem) => fileSystem.writeFileString(pathTo, JSON.stringify(pkg, null, 2)))
  )

const program = pipe(
  Effect.sync(() => console.log(`copying package.json to ${pathTo}...`)),
  Effect.flatMap(() => read),
  Effect.flatMap(write),
  Effect.provide(NodeFileSystem.layer)
)

Effect.runPromise(program)
