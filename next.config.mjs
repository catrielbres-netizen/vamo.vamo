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
        permanent: false,
      },
      {
        source: '/registro/conductor',
        destination: '/driver/register',
        permanent: false,
      },
      {
        source: '/registro/pasajero',
        destination: '/pasajero/register',
        permanent: false,
      },
      {
        source: '/register',
        destination: '/pasajero/register',
        permanent: false,
      },
      {
        source: '/registro',
        destination: '/pasajero/register',
        permanent: false,
      },
      {
        source: '/pasajero',
        destination: '/pasajero/register',
        permanent: false,
      },
      {
        source: '/loginconductor',
        destination: '/login?role=driver',
        permanent: false,
      },
      {
        source: '/driver/login',
        destination: '/login?role=driver',
        permanent: false,
      }
    ]
  }
};

export default nextConfig;
