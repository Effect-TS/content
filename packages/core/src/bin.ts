#!/usr/bin/env node
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as ParcelWatcher from "@effect/platform-node/NodeFileSystem/ParcelWatcher"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Cli from "./Cli.ts"
import { TracerLayer } from "./internal/Tracing.ts"

const MainLive = Layer.mergeAll(
  TracerLayer,
  NodeContext.layer.pipe(
    Layer.provide(ParcelWatcher.layer)
  )
)

Cli.run(process.argv).pipe(
  Effect.provide(MainLive),
  NodeRuntime.runMain
)
