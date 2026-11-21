import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // the dev badge sits in the bottom-left corner, on top of the chat button
  devIndicators: false,
  // The chat's model and runtime (public/models, public/chat) never change under the same
  // name, so browsers can keep them: a second visit opens the chat without the download.
  async headers() {
    const forever = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];
    return [
      { source: "/models/:path*", headers: forever },
      { source: "/chat/ort/:path*", headers: forever },
      { source: "/chat/transformers.js", headers: forever },
    ];
  },
};

export default nextConfig;
