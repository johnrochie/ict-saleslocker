import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb', // allow larger CSV uploads
    },
  },
}

export default nextConfig
