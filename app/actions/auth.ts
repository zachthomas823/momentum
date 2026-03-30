'use server'

import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { getDb } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { createSession, deleteSession } from '@/lib/auth/session'

export type LoginState = {
  error?: string
} | undefined

export async function login(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = formData.get('email')
  const password = formData.get('password')

  // Validate form fields
  if (!email || typeof email !== 'string') {
    return { error: 'Email is required.' }
  }
  if (!password || typeof password !== 'string') {
    return { error: 'Password is required.' }
  }

  // Query user by email
  const db = getDb()
  const result = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  const user = result[0]

  if (!user) {
    return { error: 'Invalid email or password.' }
  }

  // Verify password
  const passwordMatch = await bcrypt.compare(password, user.passwordHash)

  if (!passwordMatch) {
    return { error: 'Invalid email or password.' }
  }

  // Create session and redirect
  await createSession(user.id)
  redirect('/')
}

export async function logout() {
  await deleteSession()
  redirect('/login')
}
