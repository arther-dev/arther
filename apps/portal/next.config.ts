import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@arther/block-renderer',
    '@arther/config',
    '@arther/db',
    '@arther/types',
    '@arther/ui',
  ],
};

export default nextConfig;
