import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@arther/config', '@arther/types'],
};

export default nextConfig;
