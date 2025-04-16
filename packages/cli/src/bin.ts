#!/usr/bin/env node
import * as DevTools from "@effect/experimental/DevTools"
import * as NodeContext from "@effect/platform-node/NodeContext"
import * as ParcelWatcher from "@effect/platform-node/NodeFileSystem/ParcelWatcher"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Cli from "./Cli.ts"

const MainLive = Layer.mergeAll(
  DevTools.layer(),
  NodeContext.layer.pipe(
    Layer.provide(ParcelWatcher.layer)
  )
)

Cli.run(process.argv).pipe(
  Effect.provide(MainLive),
  NodeRuntime.runMain
)
