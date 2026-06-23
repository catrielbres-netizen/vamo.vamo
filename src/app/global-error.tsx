"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Global error boundary caught an error:', error);
    
    // Automatically reload if it's a chunk loading error (happens after deployments)
    if (
      error.name === 'ChunkLoadError' ||
      error.message.includes('Loading chunk') ||
      error.message.includes('Failed to fetch dynamically imported module') ||
      error.message.includes('Importing a module script failed')
    ) {
      console.log('Chunk load error detected globally, reloading page automatically...');
      window.location.reload();
    }
  }, [error]);

  return (
    <html>
      <body className="bg-zinc-950 text-white min-h-screen flex items-center justify-center p-4">
        <div className="text-center bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-sm">
          <h1 className="text-xl font-black mb-2">¡Error Global!</h1>
          <p className="text-sm text-zinc-400 mb-6 break-words">{error.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-primary text-primary-foreground font-bold px-6 py-3 rounded-full w-full hover:opacity-90 transition-opacity"
          >
            Recargar
          </button>
        </div>
      </body>
    </html>
  );
}
