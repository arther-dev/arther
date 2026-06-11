import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@arther/authz', '@arther/config', '@arther/db', '@arther/types', '@arther/ui'],
};

export default nextConfig;
