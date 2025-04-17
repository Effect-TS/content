import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/*.ts"],
  format: ["esm", "cjs"],
  tsconfig: "tsconfig.build.json",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".js" : ".mjs"
    }
  },
  shims: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: "smallest"
})
