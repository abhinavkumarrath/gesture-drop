// app/api/discovery/route.ts
import { NextResponse } from 'next/server';

// Global variable to hold the laptop's PeerJS ID in memory
let hostPeerId = "";

export async function GET() {
  return NextResponse.json({ hostId: hostPeerId });
}

export async function POST(request: Request) {
  const { id } = await request.json();
  hostPeerId = id;
  return NextResponse.json({ success: true });
}
