import { Link as RouterLink } from 'react-router'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import MuiSkeleton from '@mui/material/Skeleton'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import MuiLink from '@mui/material/Link'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutlined'
import InboxIcon from '@mui/icons-material/Inbox'
import LockIcon from '@mui/icons-material/Lock'
import RefreshIcon from '@mui/icons-material/Refresh'
import SearchOffIcon from '@mui/icons-material/SearchOff'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import { Button } from './Button'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

export function Spinner({ sx, size = 'md', label = 'Loading' }) {
  const px = { sm: 16, md: 20, lg: 28 }[size] ?? 20
  return <CircularProgress size={px} role="status" aria-label={label} sx={[{ color: 'text.muted' }, ...toArray(sx)]} />
}

export function Skeleton({ sx, style, height, width, variant = 'rounded', className }) {
  return <MuiSkeleton variant={variant} height={height} width={width} style={style} className={className} sx={sx} aria-hidden />
}

export function EmptyState({ icon: Icon = InboxIcon, title, description, action, sx, compact = false }) {
  return (
    <Box
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: compact ? 2 : 3,
          py: compact ? 4 : 7,
        },
        ...toArray(sx),
      ]}
    >
      <Box
        sx={{
          mb: 1.5,
          display: 'flex',
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: 'background.muted',
          color: 'text.muted',
        }}
      >
        <Icon sx={{ fontSize: 20 }} aria-hidden />
      </Box>
      <Typography component="h3" variant="h3">
        {title}
      </Typography>
      {description ? (
        <Typography sx={{ mt: 0.5, maxWidth: 384, fontSize: 13, color: 'text.muted', textWrap: 'balance' }}>{description}</Typography>
      ) : null}
      {action ? <Box sx={{ mt: 2 }}>{action}</Box> : null}
    </Box>
  )
}

/** Renders the right message for the error shape produced by the API client. */
export function ErrorState({ error, onRetry, sx, compact = false, title }) {
  const e = error ?? {}
  let Icon = ErrorOutlineIcon
  let heading = title ?? e.title ?? 'Something went wrong'
  let body = e.message ?? 'An unexpected error occurred.'
  if (e.isNetwork) {
    Icon = WifiOffIcon
    heading = 'Connection problem'
  } else if (e.isForbidden) {
    Icon = LockIcon
    heading = 'You do not have access'
    body = e.message || 'Your role does not include permission to view this.'
  } else if (e.isNotFound) {
    Icon = SearchOffIcon
    heading = 'Not found'
  }
  return (
    <Box
      role="alert"
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          px: compact ? 2 : 3,
          py: compact ? 4 : 7,
        },
        ...toArray(sx),
      ]}
    >
      <Box
        sx={{
          mb: 1.5,
          display: 'flex',
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: e.isForbidden ? 'soft.warning.bg' : 'soft.danger.bg',
          color: e.isForbidden ? 'soft.warning.fg' : 'soft.danger.fg',
        }}
      >
        <Icon sx={{ fontSize: 20 }} aria-hidden />
      </Box>
      <Typography component="h3" variant="h3">
        {heading}
      </Typography>
      <Typography sx={{ mt: 0.5, maxWidth: 448, fontSize: 13, color: 'text.muted', textWrap: 'balance' }}>{body}</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
        {onRetry && !e.isForbidden ? (
          <Button size="sm" icon={RefreshIcon} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
        {e.isForbidden || e.isNotFound ? (
          <Button size="sm" variant="ghost" to="/">
            Go to dashboard
          </Button>
        ) : null}
      </Stack>
    </Box>
  )
}

const SEVERITY = { info: 'info', success: 'success', warning: 'warning', danger: 'error' }

export function InlineAlert({ tone = 'info', title, children, onDismiss, sx, action }) {
  return (
    <Alert severity={SEVERITY[tone] ?? 'info'} role={tone === 'danger' ? 'alert' : 'status'} onClose={onDismiss} sx={sx}>
      {title ? <AlertTitle>{title}</AlertTitle> : null}
      {children ? <Box sx={{ '& p + p': { mt: 1 } }}>{children}</Box> : null}
      {action ? <Box sx={{ mt: 1.5 }}>{action}</Box> : null}
    </Alert>
  )
}

export function NotFoundInline({ what = 'record', backTo = '/', backLabel = 'Back to list' }) {
  return (
    <EmptyState
      icon={SearchOffIcon}
      title={`This ${what} does not exist`}
      description="It may have been removed, or the link you followed is out of date."
      action={
        <Button size="sm" to={backTo}>
          {backLabel}
        </Button>
      }
    />
  )
}

/** Router link styled as the app's standard text link. */
export function LinkText({ to, children, sx, ...props }) {
  return (
    <MuiLink component={RouterLink} to={to} sx={sx} {...props}>
      {children}
    </MuiLink>
  )
}

/** Centred spinner for whole-page loading states. */
export function PageSpinner() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
      <Spinner size="lg" />
    </Box>
  )
}
