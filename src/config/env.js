import { z } from 'zod'

/** Build-time configuration, validated once so a typo fails fast instead of silently defaulting. */
const schema = z
  .object({
    VITE_API_BASE_URL: z.string().trim().default(''),
    VITE_USE_MOCK_API: z.enum(['true', 'false']).default('true'),
    VITE_MOCK_LATENCY_MIN: z.coerce.number().int().min(0).default(120),
    VITE_MOCK_LATENCY_MAX: z.coerce.number().int().min(0).default(420),
  })
  .refine((e) => e.VITE_MOCK_LATENCY_MAX >= e.VITE_MOCK_LATENCY_MIN, {
    path: ['VITE_MOCK_LATENCY_MAX'],
    message: 'must be greater than or equal to VITE_MOCK_LATENCY_MIN',
  })

function parse(raw) {
  // Vite leaves unset variables undefined and empty ones as ''. Treat '' as unset so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v === '' && k !== 'VITE_API_BASE_URL' ? undefined : v]))
  const result = schema.safeParse(cleaned)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`Invalid environment configuration: ${issues}`)
  }
  return result.data
}

export const env = parse(import.meta.env)

export const config = {
  apiBaseUrl: env.VITE_API_BASE_URL.replace(/\/$/, ''),
  useMockApi: env.VITE_USE_MOCK_API !== 'false',
  mockLatency: { min: env.VITE_MOCK_LATENCY_MIN, max: env.VITE_MOCK_LATENCY_MAX },
}
