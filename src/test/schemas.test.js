import { describe, expect, it } from 'vitest'
import { changePasswordSchema, loginSchema } from '@/auth/schemas'

const issues = (result) => Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]))

describe('login schema', () => {
  it('trims the email and accepts valid credentials', () => {
    const r = loginSchema.safeParse({ email: '  fleet@limoz.rw ', password: 'x' })
    expect(r.success).toBe(true)
    expect(r.data.email).toBe('fleet@limoz.rw')
  })

  it('reports a missing email, an invalid email and a missing password separately', () => {
    expect(issues(loginSchema.safeParse({ email: '', password: '' }))).toEqual({
      email: 'Enter your email address.',
      password: 'Enter your password.',
    })
    expect(issues(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }))).toEqual({ email: 'Enter a valid email address.' })
  })
})

describe('change password schema', () => {
  it('requires a long enough new password that matches its confirmation', () => {
    const ok = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'longenough1', confirm: 'longenough1' })
    expect(ok.success).toBe(true)
    expect(issues(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'short', confirm: 'short' }))).toEqual({
      newPassword: 'At least 10 characters.',
    })
    expect(issues(changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'longenough1', confirm: 'longenough2' }))).toEqual({
      confirm: 'Passwords do not match.',
    })
  })

  it('rejects reusing the current password', () => {
    const r = changePasswordSchema.safeParse({ currentPassword: 'longenough1', newPassword: 'longenough1', confirm: 'longenough1' })
    expect(issues(r)).toEqual({ newPassword: 'Choose a different password.' })
  })
})
