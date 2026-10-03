import type { NextConfig } from "next";

// Remote development needs both the asset hostname and Server Action host.
// Keep this exact-origin exception out of production configurations.
const devOrigin = process.env.NODE_ENV === "development"
  ? process.env.RALLYROUTE_DEV_ORIGIN
  : undefined;
const origin = devOrigin ? new URL(devOrigin) : undefined;
if (origin && (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash)) {
  throw new Error("RALLYROUTE_DEV_ORIGIN must be an HTTP(S) origin without credentials, a path, or query parameters.");
}

const nextConfig: NextConfig = {
  ...(origin ? {
    allowedDevOrigins: [origin.hostname],
    experimental: { serverActions: { allowedOrigins: [origin.host, "localhost:3000"] } },
  } : {}),
};

export default nextConfig;
