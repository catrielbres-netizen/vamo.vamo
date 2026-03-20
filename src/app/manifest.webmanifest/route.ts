
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    "name": "VamO",
    "short_name": "VamO",
    "description": "Movete fácil, movete con VamO",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#1E293B",
    "theme_color": "#3B82F6",
    "icons": [
      {
        "src": "/vamo-logo.svg",
        "sizes": "192x192",
        "type": "image/svg+xml",
        "purpose": "any"
      },
      {
        "src": "/vamo-logo.svg",
        "sizes": "512x512",
        "type": "image/svg+xml",
        "purpose": "any"
      },
      {
        "src": "/vamo-logo.svg",
        "sizes": "512x512",
        "type": "image/svg+xml",
        "purpose": "maskable"
      }
    ]
  });
}
