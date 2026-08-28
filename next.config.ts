import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lean, self-contained production build (server.js + only the files it
  // actually needs, no full node_modules) — required for a small Docker
  // image. Also fixes the "inferred your workspace root" warning: this
  // repo lives under a parent directory that has its own unrelated
  // package-lock.json, which without this line makes Next guess a wrong
  // root and can leave real dependencies out of the traced build output.
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
