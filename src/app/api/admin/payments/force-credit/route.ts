// This endpoint is obsolete and has been removed to simplify the build process.
// All logic is now handled by secure Cloud Functions.
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json(
    { error: "This endpoint is deprecated and no longer functional." },
    { status: 410 } // 410 Gone
  );
}
