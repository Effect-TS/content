import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/*.ts"],
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".js" : ".mjs",
    }
  },
  shims: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  treeshake: "smallest",
})
