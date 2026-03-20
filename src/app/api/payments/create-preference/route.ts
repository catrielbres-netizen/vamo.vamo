// This endpoint is obsolete and has been removed to simplify the build process.
// All logic is now handled by secure Cloud Functions.
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json(
    { error: "This endpoint is deprecated. The client should call the 'createPaymentPreferenceV4' Cloud Function directly." },
    { status: 410 } // 410 Gone
  );
}
