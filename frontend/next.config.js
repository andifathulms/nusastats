/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // "Wilayah" became "Jelajahi": keep every old /regions link working.
  async redirects() {
    return [
      { source: "/regions", destination: "/jelajahi", permanent: true },
      { source: "/regions/:code", destination: "/jelajahi/:code", permanent: true },
    ];
  },
};

module.exports = nextConfig;
