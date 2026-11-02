import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/api/generate": ["./content/**/*"] },
};

export default nextConfig;
