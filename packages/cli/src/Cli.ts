import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as Config from "effect/Config"

const configPath = Options.file("config").pipe(
  Options.withAlias("c"),
  Options.withDescription("Path to the Contentlayer config (defaults to \"contentlayer.config.{ts|js}\")"),
  Options.withFallbackConfig(Config.string("configPath")),
  Options.optional
)

const watchMode = Options.boolean("watch", { aliases: ["w"] }).pipe(
  Options.withDescription(
    "Enable watch mode which will watch the file system for changes " +
      "and rebuild when your configuration changes"
  ),
  Options.withFallbackConfig(Config.string("watchMode"))
)

const command = Command.make("contentlayer", { configPath, watchMode })

export const run = Command.run(command, {
  name: "Contenlayer CLI",
  version: "0.0.0"
})
