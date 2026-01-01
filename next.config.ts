import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // La configuración de 'env' en Next.js se usa para exponer variables de entorno
  // del lado del servidor al cliente. Sin embargo, para variables con el prefijo
  // NEXT_PUBLIC_, Next.js las expone automáticamente.
  // No es necesario duplicar la configuración aquí si ya usas el prefijo.
};

export default nextConfig;
