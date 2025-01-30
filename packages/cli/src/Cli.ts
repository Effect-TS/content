import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import { DocumentBuilder } from "@effect/contentlayer-core/DocumentBuilder"
import { BuildOptions } from "@effect/contentlayer-core/Esbuild"
import { WatchMode } from "@effect/contentlayer-core/References"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const configPath = Options.file("config").pipe(
  Options.withAlias("c"),
  Options.withDescription("Path to the Contentlayer config (defaults to \"contentlayer.config.ts\")"),
  Options.withFallbackConfig(
    Config.string("configPath").pipe(
      Config.withDefault("contentlayer.config.ts")
    )
  )
)

const watchMode = Options.boolean("watch", { aliases: ["w"] }).pipe(
  Options.withDescription(
    "Enable watch mode which will watch the file system for changes " +
      "and rebuild when your configuration changes"
  ),
  Options.withFallbackConfig(Config.boolean("watchMode"))
)

const command = Command.make("contentlayer", { configPath, watchMode }).pipe(
  Command.withHandler(() =>
    Effect.log("Starting Contentlayer...").pipe(
      Effect.zipRight(Effect.never)
    )
  ),
  Command.provide(({ configPath, watchMode }) =>
    DocumentBuilder.Live.pipe(
      Layer.provide([
        BuildOptions.Live({
          bundle: false,
          entryNames: "[name]-[hash]",
          entryPoints: [configPath],
          format: "cjs",
          logLevel: "silent",
          metafile: true,
          outfile: ".contentlayer/compiled-contentlayer-config",
          platform: "node"
        }),
        Layer.succeed(WatchMode, watchMode)
      ])
    )
  )
)

export const run = Command.run(command, {
  name: "Contenlayer CLI",
  version: "0.0.0"
})
