'use client'

import { useActionState } from 'react'
import { login, type LoginState } from '@/app/actions/auth'

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    undefined
  )

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="font-display text-3xl font-bold text-t1">Momentum</h1>
        <p className="mt-2 text-t2 text-sm">Sign in to continue</p>
      </div>

      <form action={action} className="space-y-4">
        {state?.error && (
          <div className="rounded-lg bg-rose/10 border border-rose/20 px-4 py-3 text-sm text-rose">
            {state.error}
          </div>
        )}

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-t2 mb-1">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-t3/30 bg-card px-4 py-3 text-t1
                       placeholder:text-t3 focus:outline-none focus:ring-2
                       focus:ring-amber/50 focus:border-amber/50 transition-colors"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-t2 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-t3/30 bg-card px-4 py-3 text-t1
                       placeholder:text-t3 focus:outline-none focus:ring-2
                       focus:ring-amber/50 focus:border-amber/50 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-amber py-3 text-sm font-semibold text-bg
                     hover:bg-amber/90 focus:outline-none focus:ring-2
                     focus:ring-amber/50 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
