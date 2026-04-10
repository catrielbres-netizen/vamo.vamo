"use client";
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  console.error('Global error:', error);
  return (
    <html>
      <body>
        <h1>Unexpected error</h1>
        <p>{error.message}</p>
        <button onClick={reset}>Retry</button>
      </body>
    </html>
  );
}
