import { NextResponse } from 'next/server';

const PROVER_SERVICE_URL = 'https://prover.epochone.io/v1';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Forward the request to the prover service
    const response = await fetch(PROVER_SERVICE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PROVER_API_KEY && {
          'X-API-Key': process.env.PROVER_API_KEY
        })
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: `Prover service error: ${response.status}` },
        { status: response.status }
      );
    }

    const proofData = await response.json();
    return NextResponse.json(proofData);
  } catch (error) {
    console.error('Error in zkp route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
