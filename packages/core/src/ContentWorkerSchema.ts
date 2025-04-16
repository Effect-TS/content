import * as Rpc from "@effect/rpc/Rpc"
import * as RpcGroup from "@effect/rpc/RpcGroup"
import * as Schema from "effect/Schema"
import { BuildError, ContentlayerError } from "./ContentlayerError.ts"

export class ConfigPath extends Schema.Class<ConfigPath>("@effect/contentlayer-core/ContentWorkerSchema/ConfigPath")({
  path: Schema.String,
  entrypoint: Schema.String
}) {}

export class Rpcs extends RpcGroup.make(
  Rpc.make("ProcessDocument", {
    payload: {
      configPath: ConfigPath,
      name: Schema.String,
      id: Schema.String,
      meta: Schema.Unknown
    },
    error: Schema.Union(ContentlayerError, BuildError)
  })
) {}
