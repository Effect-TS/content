import * as OtlpTracer from "@effect/opentelemetry/OtlpTracer"
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as Layer from "effect/Layer"

export const TracerLayer = OtlpTracer.layer({
  url: "http://localhost:4318/v1/traces",
  resource: {
    serviceName: "@effect/contentlayer"
  }
}).pipe(Layer.provide(NodeHttpClient.layerUndici))
