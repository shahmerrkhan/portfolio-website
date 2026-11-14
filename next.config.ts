import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // the dev badge sits in the bottom-left corner, on top of the chat button
  devIndicators: false,
};

export default nextConfig;
