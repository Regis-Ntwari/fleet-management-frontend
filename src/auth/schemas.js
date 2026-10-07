import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 10

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').pipe(z.email('Enter a valid email address.')),
  password: z.string().min(1, 'Enter your password.'),
})

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters.`),
    confirm: z.string().min(1, 'Repeat the new password.'),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: 'Choose a different password.' })
