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
        destination: '/driver/register',
        permanent: true,
      },
      {
        source: '/registro/conductor',
        destination: '/driver/register',
        permanent: true,
      },
      {
        source: '/registro/pasajero',
        destination: '/pasajero/register',
        permanent: true,
      },
      {
        source: '/register',
        destination: '/pasajero/register',
        permanent: true,
      },
      {
        source: '/registro',
        destination: '/pasajero/register',
        permanent: true,
      },
      {
        source: '/pasajero',
        destination: '/pasajero/register',
        permanent: true,
      },
      {
        source: '/loginconductor',
        destination: '/login',
        permanent: true,
      },
      {
        source: '/driver/login',
        destination: '/login',
        permanent: true,
      }
    ]
  }
};

export default nextConfig;
