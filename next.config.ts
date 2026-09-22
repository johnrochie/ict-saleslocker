import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // allow larger CSV uploads
    },
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs (Exec Pack export) references node:fs / node:https behind
      // runtime checks. Strip the "node:" scheme so its browser field can stub them.
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, '')
      }))
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, https: false, os: false, path: false }
    }
    return config
  },
}

export default nextConfig
