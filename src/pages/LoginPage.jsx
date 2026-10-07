import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import Collapse from '@mui/material/Collapse'
import MuiIconButton from '@mui/material/IconButton'
import VisibilityIcon from '@mui/icons-material/Visibility'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import LoginIcon from '@mui/icons-material/Login'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { useAuth } from '@/app/AuthProvider'
import { useTheme } from '@/app/ThemeProvider'
import { isMockApi } from '@/api/client'
import { loginSchema } from '@/auth/schemas'
import { DEMO_PASSWORD, DEMO_USERS } from '@/api/mock/seed'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { humanize } from '@/utils/format'

function Mark({ sx }) {
  return (
    <Box
      component="span"
      sx={[
        { display: 'flex', width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 1 },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      <svg
        viewBox="0 0 24 24"
        width="20"
        height="20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 15h2.5a2.5 2.5 0 0 0 5 0h3a2.5 2.5 0 0 0 5 0H21v-3.3l-2.6-.9-1.6-2.8H3z" />
      </svg>
    </Box>
  )
}

export function LoginPage() {
  useDocumentTitle('Sign in')
  const { status, login, expiredNotice, dismissExpiredNotice } = useAuth()
  const { resolved } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [showDemo, setShowDemo] = useState(false)
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })

  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/'} replace />

  const onSubmit = async (values) => {
    setServerError(null)
    try {
      await login(values.email, values.password)
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (e) {
      setServerError(e.message ?? 'Sign in failed.')
    }
  }

  return (
    <Box sx={{ display: 'grid', minHeight: '100dvh', gridTemplateColumns: { lg: '1.1fr 1fr' } }}>
      <Box
        component="aside"
        sx={{ position: 'relative', display: { xs: 'none', lg: 'block' }, overflow: 'hidden', bgcolor: '#06240f', color: '#fff' }}
      >
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            inset: 0,
            opacity: 0.18,
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)',
            backgroundSize: '28px 28px',
          }}
        />
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            left: -96,
            top: '33%',
            width: 520,
            height: 520,
            borderRadius: '50%',
            bgcolor: '#1a9d4b',
            opacity: 0.3,
            filter: 'blur(64px)',
          }}
        />
        <Box sx={{ position: 'relative', display: 'flex', height: '100%', flexDirection: 'column', justifyContent: 'space-between', p: 6 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Mark sx={{ width: 36, height: 36, bgcolor: 'rgba(255,255,255,0.1)', boxShadow: '0 0 0 1px rgba(255,255,255,0.2)' }} />
            <Typography sx={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>LIMOZ Fleet</Typography>
          </Stack>
          <Box sx={{ maxWidth: 448 }}>
            <Typography
              component="h2"
              sx={{ fontSize: 34, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.01em', textWrap: 'balance' }}
            >
              One place for the whole fleet.
            </Typography>
            <Typography sx={{ mt: 2, fontSize: 15, lineHeight: 1.65, color: 'rgba(255,255,255,0.7)' }}>
              Vehicles, drivers, dispatch, fuel, maintenance and compliance for LIMOZ Rwanda, with the daily operational position ready
              before the morning briefing.
            </Typography>
            <Box
              component="dl"
              sx={{
                mt: 5,
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 3,
                borderTop: '1px solid rgba(255,255,255,0.15)',
                pt: 3,
                fontSize: 13,
                m: 0,
              }}
            >
              {[
                ['Timezone', 'Africa/Kigali'],
                ['Currency', 'RWF'],
                ['Access', 'Role-based'],
              ].map(([k, val]) => (
                <Box key={k}>
                  <Box component="dt" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                    {k}
                  </Box>
                  <Box component="dd" sx={{ m: 0, mt: 0.25, fontWeight: 500 }}>
                    {val}
                  </Box>
                </Box>
              ))}
            </Box>
          </Box>
          <Typography sx={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            © {new Date().getFullYear()} LIMOZ Rwanda Ltd. Authorised personnel only.
          </Typography>
        </Box>
      </Box>

      <Box component="section" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', px: 3, py: 6 }}>
        <Box sx={{ width: '100%', maxWidth: 384 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 4, display: { lg: 'none' } }}>
            <Mark sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }} />
            <Typography sx={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>LIMOZ Fleet</Typography>
          </Stack>
          <Typography component="h1" variant="h1">
            Sign in
          </Typography>
          <Typography sx={{ mt: 0.5, fontSize: 13.5, color: 'text.muted' }}>Use your LIMOZ account to continue.</Typography>

          {expiredNotice ? (
            <InlineAlert tone="warning" sx={{ mt: 2.5 }} onDismiss={dismissExpiredNotice}>
              Your session expired. Please sign in again.
            </InlineAlert>
          ) : null}
          {serverError ? (
            <InlineAlert tone="danger" sx={{ mt: 2.5 }}>
              {serverError}
            </InlineAlert>
          ) : null}

          <Stack component="form" onSubmit={handleSubmit(onSubmit)} spacing={2} sx={{ mt: 3 }} noValidate>
            <Field label="Email" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@limoz.rw"
                invalid={!!errors.email}
                autoFocus
                {...register('email')}
              />
            </Field>
            <Field label="Password" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••••"
                invalid={!!errors.password}
                trailing={
                  <MuiIconButton
                    size="small"
                    edge="end"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    sx={{ color: 'text.muted' }}
                  >
                    {showPassword ? <VisibilityOffIcon sx={{ fontSize: 18 }} /> : <VisibilityIcon sx={{ fontSize: 18 }} />}
                  </MuiIconButton>
                }
                {...register('password')}
              />
            </Field>
            <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting} icon={LoginIcon}>
              Sign in
            </Button>
          </Stack>

          {isMockApi ? (
            <Box sx={{ mt: 4, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.subtle' }}>
              <ButtonBase
                onClick={() => setShowDemo((s) => !s)}
                aria-expanded={showDemo}
                sx={{
                  display: 'flex',
                  width: '100%',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  px: 1.75,
                  py: 1.25,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: 'text.secondary',
                  textAlign: 'left',
                }}
              >
                <span>
                  Demo accounts · password{' '}
                  <Box
                    component="code"
                    sx={{
                      borderRadius: '4px',
                      bgcolor: 'background.paper',
                      px: 0.5,
                      py: 0.25,
                      fontFamily: (t) => t.typography.fontFamilyMono,
                      fontSize: 11.5,
                    }}
                  >
                    {DEMO_PASSWORD}
                  </Box>
                </span>
                <KeyboardArrowDownIcon
                  sx={{ fontSize: 18, transition: 'transform 150ms', transform: showDemo ? 'rotate(180deg)' : 'none' }}
                  aria-hidden
                />
              </ButtonBase>
              <Collapse in={showDemo}>
                <Box
                  component="ul"
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 0.5,
                    borderTop: 1,
                    borderColor: 'divider',
                    p: 1,
                    m: 0,
                    listStyle: 'none',
                  }}
                >
                  {DEMO_USERS.map((u) => (
                    <li key={u.email}>
                      <ButtonBase
                        onClick={() => {
                          setValue('email', u.email, { shouldValidate: true })
                          setValue('password', DEMO_PASSWORD, { shouldValidate: true })
                          setServerError(null)
                        }}
                        sx={{
                          display: 'block',
                          width: '100%',
                          borderRadius: '4px',
                          px: 1,
                          py: 0.75,
                          textAlign: 'left',
                          fontSize: 12,
                          '&:hover': { bgcolor: 'background.paper' },
                        }}
                      >
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 500 }}>{humanize(u.role)}</Typography>
                        <Typography noWrap sx={{ fontSize: 'inherit', color: 'text.muted' }}>
                          {u.email}
                        </Typography>
                      </ButtonBase>
                    </li>
                  ))}
                </Box>
              </Collapse>
            </Box>
          ) : null}
          <Typography sx={{ mt: 3, textAlign: 'center', fontSize: 12, color: 'text.faint' }}>
            {resolved === 'dark' ? 'Dark' : 'Light'} theme follows your system preference. Change it after signing in.
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
