import { SignJWT, jwtVerify } from 'jose'

const secretKey = process.env.AUTH_SECRET
const encodedKey = new TextEncoder().encode(secretKey)

export type SessionPayload = {
  userId: number
  expiresAt: Date
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({ ...payload, expiresAt: payload.expiresAt.toISOString() })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(encodedKey)
}

export async function decrypt(
  session: string | undefined = ''
): Promise<SessionPayload | undefined> {
  try {
    const { payload } = await jwtVerify(session!, encodedKey, {
      algorithms: ['HS256'],
    })
    return payload as unknown as SessionPayload
  } catch {
    console.log('Failed to verify session')
    return undefined
  }
}
