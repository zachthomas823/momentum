import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { decrypt } from '@/lib/auth/crypto'

export async function proxy(request: NextRequest) {
  const cookie = request.cookies.get('session')?.value
  const session = await decrypt(cookie)

  if (!session?.userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!login|_next/static|_next/image|favicon\\.ico|api/fitbit/callback).*)',
  ],
}
