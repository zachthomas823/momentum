import { NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth/dal'
import { getUserProfile, getUserMilestones } from '@/lib/db/queries'

export async function GET() {
  try {
    const { userId } = await verifySession()
    const [profile, userMilestones] = await Promise.all([
      getUserProfile(userId),
      getUserMilestones(userId),
    ])

    return NextResponse.json({ profile, milestones: userMilestones })
  } catch (err) {
    // verifySession redirects on auth failure; this catches DB errors
    console.error('[settings/profile] GET failed:', err)
    return NextResponse.json(
      { error: 'Failed to load profile' },
      { status: 500 }
    )
  }
}
