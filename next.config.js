/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  // The floating dev badge overlays the bottom-left corner, where it lands in every design
  // screenshot and hides whatever is under it. Nothing in this app needs it.
  devIndicators: false,
  // Screenshots and local testing hit 127.0.0.1; without this Next refuses to serve dev chunks
  // cross-origin and the page renders its server HTML forever with no JavaScript.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

module.exports = nextConfig;
