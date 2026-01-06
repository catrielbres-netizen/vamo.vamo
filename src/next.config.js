/** @type {import('next').NextConfig} */
// Forcing a cache invalidation to fix module resolution error
const nextConfig = {
  transpilePackages: [
    '@vis.gl/react-google-maps',
    'use-places-autocomplete'
  ],
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https,
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
