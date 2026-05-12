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
  }
};

export default nextConfig;
