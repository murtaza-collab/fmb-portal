import { NextResponse } from 'next/server'
import { requireAdminAuth } from '@/lib/api-auth'

export async function GET() {
  const auth = await requireAdminAuth()
  if (!auth.ok) return auth.response

  const wahaBase = process.env.WAHA_BASE_URL
  const wahaKey  = process.env.WAHA_API_KEY

  if (!wahaBase || !wahaKey) {
    return NextResponse.json({ error: 'WAHA not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`${wahaBase}/api/default/auth/qr`, {
      headers: { 'X-Api-Key': wahaKey },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `WAHA error ${res.status}` }, { status: 502 })
    }

    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not reach WAHA' },
      { status: 500 }
    )
  }
}
