
// src/app/manifest.ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VamO',
    short_name: 'VamO',
    description: 'Movete fácil, movete con VamO',
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#1A237E',
    orientation: 'portrait',
    icons: [],
  };
}
