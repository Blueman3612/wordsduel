import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  webpack: (config, { isServer }) => {
    // Exclude Supabase Edge Functions from the build
    config.externals = [...(config.externals || []), {
      'supabase/functions': 'supabase/functions'
    }];
    return config;
  },
  typescript: {
    ignoreBuildErrors: true
  }
};

export default nextConfig;
