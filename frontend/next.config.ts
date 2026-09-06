import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: { root: __dirname },
  // Server side, load the WASM SDK from node_modules instead of bundling it:
  // its Node build reads index_bg.wasm from disk relative to its own file.
  serverExternalPackages: ["@solana/zk-sdk"],
  // @solana/zk-sdk ships wasm-bindgen output that imports .wasm as an ES module.
  webpack: (config) => {
    config.experiments = { ...config.experiments, asyncWebAssembly: true, layers: true };
    return config;
  },
};

export default nextConfig;
