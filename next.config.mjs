/** @type {import('next').NextConfig} */
//
// Notes on body-size limits in Next 16
// ------------------------------------
// We previously set `middleware.clientMaxBodySize` to lift the 10MB request
// buffer the auth proxy applied to large CSV uploads. That config key was
// removed in Next 16 (the file convention is also renamed to "proxy"). We
// now solve the same problem by excluding the upload route from the proxy
// matcher in src/proxy.js, so large uploads bypass the proxy entirely and
// no body buffering happens for them.
//
// `experimental.serverActions.bodySizeLimit` only applies to Server Actions;
// our CSV upload is a regular route handler that streams FormData, so it
// is not needed and has been removed to silence the experimental warning.

const nextConfig = {
  reactCompiler: true,
  // The floating dev badge sits on top of the sidebar's user card.
  devIndicators: false,
  // A lockfile in a parent folder makes Next guess the wrong workspace root.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
