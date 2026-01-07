
import { MetadataRoute } from 'next'
 
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VamO - Tu Viaje, a Tu Manera',
    short_name: 'VamO',
    description: 'Una app de viajes compartidos.',
    start_url: '/',
    display: 'standalone',
    background_color: '#E8EAF6',
    theme_color: '#1A237E',
    icons: [], // Empty array to prevent 404 errors for now
  }
}
