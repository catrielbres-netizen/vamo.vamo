const nextConfig = {
  trailingSlash: true,
  swcMinify: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{kebabCase}}',
    },
  },
  experimental: {
    workerThreads: false,
    cpus: 1
  },
  async redirects() {
    return [
      {
        source: '/drivers',
        destination: '/registro/conductor',
        permanent: true,
      },
      {
        source: '/driver/register',
        destination: '/registro/conductor',
        permanent: true,
      },
    ]
  }
};

export default nextConfig;
