import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Also fixes a workspace-root misdetection warning: this repo sits under a parent dir with its own unrelated package-lock.json, which without this can leave real dependencies out of the traced build output.
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
