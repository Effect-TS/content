import * as path from "node:path"
import type { UserConfig } from "vitest/config"

const alias = (pkg: string) => {
  const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"
  return ({
    [`${pkg}/test`]: path.join(__dirname, "packages", pkg, "test"),
    [`${pkg}`]: path.join(__dirname, "packages", pkg, target)
  })
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: UserConfig = {
  esbuild: {
    target: "es2020"
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"]
  },
  test: {
    setupFiles: [path.join(__dirname, "setupTests.ts")],
    fakeTimers: {
      toFake: undefined
    },
    sequence: {
      concurrent: true
    },
    include: ["test/**/*.test.ts"],
    alias: {
      ...alias("@contentlayer/core")
    }
  }
}

export default config
