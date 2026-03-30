'use server'

import { eq, and } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getDb } from '@/lib/db'
import { userProfile, milestones } from '@/lib/db/schema'
import { verifySession } from '@/lib/auth/dal'

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActionResult = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string>
}

// ─── Validation helpers ──────────────────────────────────────────────────────

const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active'] as const
const MILESTONE_TYPES = ['weight', 'event', 'bf'] as const
const AI_PERSONAS = ['coach', 'buddy', 'analyst'] as const

function parseNumber(val: FormDataEntryValue | null, field: string): { value?: number; error?: string } {
  if (val === null || val === '') return {}
  const n = Number(val)
  if (isNaN(n)) return { error: `${field} must be a number` }
  return { value: n }
}

function requireNumber(val: FormDataEntryValue | null, field: string): { value?: number; error?: string } {
  if (val === null || val === '') return { error: `${field} is required` }
  const n = Number(val)
  if (isNaN(n)) return { error: `${field} must be a number` }
  return { value: n }
}

function requireString(val: FormDataEntryValue | null, field: string): { value?: string; error?: string } {
  if (val === null || typeof val !== 'string' || val.trim() === '') {
    return { error: `${field} is required` }
  }
  return { value: val.trim() }
}

function bustCaches() {
  revalidatePath('/settings')
  revalidatePath('/')
}

// ─── updateProfile ───────────────────────────────────────────────────────────

export async function updateProfile(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await verifySession()
  const fieldErrors: Record<string, string> = {}

  // Parse & validate
  const name = formData.get('name')
  const nameVal = typeof name === 'string' ? name.trim() : ''

  const ageResult = parseNumber(formData.get('age'), 'Age')
  if (ageResult.error) fieldErrors.age = ageResult.error
  if (ageResult.value !== undefined && (ageResult.value < 1 || ageResult.value > 120)) {
    fieldErrors.age = 'Age must be between 1 and 120'
  }

  const heightResult = parseNumber(formData.get('heightInches'), 'Height')
  if (heightResult.error) fieldErrors.heightInches = heightResult.error
  if (heightResult.value !== undefined && (heightResult.value < 24 || heightResult.value > 108)) {
    fieldErrors.heightInches = 'Height must be between 24 and 108 inches'
  }

  const activityLevel = formData.get('activityLevel') as string | null
  if (activityLevel && !ACTIVITY_LEVELS.includes(activityLevel as typeof ACTIVITY_LEVELS[number])) {
    fieldErrors.activityLevel = 'Invalid activity level'
  }

  const timezone = formData.get('timezone') as string | null
  const timezoneVal = typeof timezone === 'string' ? timezone.trim() : undefined

  const paceResult = parseNumber(formData.get('weeklyPaceLbs'), 'Weekly pace')
  if (paceResult.error) fieldErrors.weeklyPaceLbs = paceResult.error
  if (paceResult.value !== undefined && (paceResult.value < 0 || paceResult.value > 5)) {
    fieldErrors.weeklyPaceLbs = 'Weekly pace must be between 0 and 5 lbs'
  }

  const aiPersona = formData.get('aiPersona') as string | null
  if (aiPersona && !AI_PERSONAS.includes(aiPersona as typeof AI_PERSONAS[number])) {
    fieldErrors.aiPersona = 'Invalid persona selection'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Validation failed', fieldErrors }
  }

  try {
    const db = getDb()
    await db
      .update(userProfile)
      .set({
        name: nameVal || undefined,
        age: ageResult.value,
        heightInches: heightResult.value,
        activityLevel: activityLevel || undefined,
        timezone: timezoneVal || undefined,
        weeklyPaceLbs: paceResult.value,
        aiPersona: aiPersona || undefined,
        updatedAt: new Date(),
      })
      .where(eq(userProfile.userId, userId))

    bustCaches()
    return { ok: true }
  } catch (err) {
    console.error('[settings] updateProfile failed:', err)
    return { ok: false, error: 'Failed to update profile. Please try again.' }
  }
}

// ─── createMilestone ─────────────────────────────────────────────────────────

export async function createMilestone(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await verifySession()
  const fieldErrors: Record<string, string> = {}

  const labelResult = requireString(formData.get('label'), 'Label')
  if (labelResult.error) fieldErrors.label = labelResult.error

  const type = formData.get('type') as string | null
  if (!type || !MILESTONE_TYPES.includes(type as typeof MILESTONE_TYPES[number])) {
    fieldErrors.type = 'Type must be weight, event, or bf'
  }

  const targetDate = formData.get('targetDate') as string | null
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    fieldErrors.targetDate = 'Valid date is required (YYYY-MM-DD)'
  }

  const weightResult = parseNumber(formData.get('targetWeight'), 'Target weight')
  if (weightResult.error) fieldErrors.targetWeight = weightResult.error

  const bfResult = parseNumber(formData.get('targetBodyFat'), 'Target body fat')
  if (bfResult.error) fieldErrors.targetBodyFat = bfResult.error

  const isPrimary = formData.get('isPrimary') === 'on' || formData.get('isPrimary') === 'true'

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Validation failed', fieldErrors }
  }

  try {
    const db = getDb()

    // If setting as primary, unset others first
    if (isPrimary) {
      await db
        .update(milestones)
        .set({ isPrimary: false })
        .where(eq(milestones.userId, userId))
    }

    await db.insert(milestones).values({
      userId,
      label: labelResult.value!,
      type: type!,
      targetDate: targetDate!,
      targetWeight: weightResult.value ?? null,
      targetBodyFat: bfResult.value ?? null,
      isPrimary,
      sortOrder: 0,
    })

    bustCaches()
    return { ok: true }
  } catch (err) {
    console.error('[settings] createMilestone failed:', err)
    return { ok: false, error: 'Failed to create milestone. Please try again.' }
  }
}

// ─── updateMilestone ─────────────────────────────────────────────────────────

export async function updateMilestone(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await verifySession()
  const fieldErrors: Record<string, string> = {}

  const idResult = requireNumber(formData.get('id'), 'Milestone ID')
  if (idResult.error) return { ok: false, error: idResult.error }

  const labelResult = requireString(formData.get('label'), 'Label')
  if (labelResult.error) fieldErrors.label = labelResult.error

  const type = formData.get('type') as string | null
  if (!type || !MILESTONE_TYPES.includes(type as typeof MILESTONE_TYPES[number])) {
    fieldErrors.type = 'Type must be weight, event, or bf'
  }

  const targetDate = formData.get('targetDate') as string | null
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    fieldErrors.targetDate = 'Valid date is required (YYYY-MM-DD)'
  }

  const weightResult = parseNumber(formData.get('targetWeight'), 'Target weight')
  if (weightResult.error) fieldErrors.targetWeight = weightResult.error

  const bfResult = parseNumber(formData.get('targetBodyFat'), 'Target body fat')
  if (bfResult.error) fieldErrors.targetBodyFat = bfResult.error

  const isPrimary = formData.get('isPrimary') === 'on' || formData.get('isPrimary') === 'true'

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: 'Validation failed', fieldErrors }
  }

  try {
    const db = getDb()

    // Verify ownership
    const existing = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.id, idResult.value!), eq(milestones.userId, userId)))
      .limit(1)

    if (existing.length === 0) {
      return { ok: false, error: 'Milestone not found or access denied' }
    }

    // If setting as primary, unset others first
    if (isPrimary) {
      await db
        .update(milestones)
        .set({ isPrimary: false })
        .where(eq(milestones.userId, userId))
    }

    await db
      .update(milestones)
      .set({
        label: labelResult.value!,
        type: type!,
        targetDate: targetDate!,
        targetWeight: weightResult.value ?? null,
        targetBodyFat: bfResult.value ?? null,
        isPrimary,
      })
      .where(eq(milestones.id, idResult.value!))

    bustCaches()
    return { ok: true }
  } catch (err) {
    console.error('[settings] updateMilestone failed:', err)
    return { ok: false, error: 'Failed to update milestone. Please try again.' }
  }
}

// ─── deleteMilestone ─────────────────────────────────────────────────────────

export async function deleteMilestone(
  _prevState: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await verifySession()

  const idResult = requireNumber(formData.get('id'), 'Milestone ID')
  if (idResult.error) return { ok: false, error: idResult.error }

  try {
    const db = getDb()

    // Verify ownership before deleting
    const existing = await db
      .select({ id: milestones.id })
      .from(milestones)
      .where(and(eq(milestones.id, idResult.value!), eq(milestones.userId, userId)))
      .limit(1)

    if (existing.length === 0) {
      return { ok: false, error: 'Milestone not found or access denied' }
    }

    await db.delete(milestones).where(eq(milestones.id, idResult.value!))

    bustCaches()
    return { ok: true }
  } catch (err) {
    console.error('[settings] deleteMilestone failed:', err)
    return { ok: false, error: 'Failed to delete milestone. Please try again.' }
  }
}
