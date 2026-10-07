import { Component } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import RefreshIcon from '@mui/icons-material/Refresh'
import HomeIcon from '@mui/icons-material/Home'
import { Button } from '@/components/ui/Button'

function Shell({ code, title, description, error, children }) {
  return (
    <Box
      sx={{
        display: 'flex',
        minHeight: '60vh',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        px: 2,
        textAlign: 'center',
      }}
    >
      <Typography
        variant="mono"
        component="p"
        sx={{ fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.muted' }}
      >
        {code}
      </Typography>
      <Typography component="h1" variant="h1" sx={{ mt: 1, fontSize: 24 }}>
        {title}
      </Typography>
      <Typography sx={{ mt: 1, maxWidth: 448, color: 'text.muted', textWrap: 'balance' }}>{description}</Typography>
      {import.meta.env.DEV && error ? (
        <Box
          component="pre"
          sx={{
            mt: 2,
            maxWidth: 672,
            overflow: 'auto',
            borderRadius: 1,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.subtle',
            p: 1.5,
            textAlign: 'left',
            fontFamily: (t) => t.typography.fontFamilyMono,
            fontSize: 11.5,
            color: 'text.secondary',
          }}
        >
          {String(error?.stack ?? error?.message ?? error)}
        </Box>
      ) : null}
      <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
        {children}
      </Stack>
    </Box>
  )
}

/** Route-level error element (used by the router for loader/render failures). */
export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <Shell code="404" title="Page not found" description="The page you are looking for does not exist or has moved.">
        <Button variant="primary" icon={HomeIcon} to="/">
          Back to dashboard
        </Button>
      </Shell>
    )
  }
  return (
    <Shell
      code="Error"
      title="Something went wrong"
      description="The page hit an unexpected error. Reloading usually fixes it; if it keeps happening, let the IT team know."
      error={error}
    >
      <Button variant="primary" icon={RefreshIcon} onClick={() => window.location.reload()}>
        Reload
      </Button>
      <Button icon={HomeIcon} to="/">
        Dashboard
      </Button>
    </Shell>
  )
}

/** Boundary around page content so one broken screen never takes the shell down. */
export class RouteErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) console.error('[page error]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Shell
        code="Error"
        title="This page crashed"
        description="The rest of the application is still working. Try again, or go back to the dashboard."
        error={this.state.error}
      >
        <Button variant="primary" icon={RefreshIcon} onClick={() => this.setState({ error: null })}>
          Try again
        </Button>
        <Button icon={HomeIcon} to="/">
          Dashboard
        </Button>
      </Shell>
    )
  }
}

export function NotFoundPage() {
  return (
    <Shell
      code="404"
      title="Page not found"
      description="We could not find that page. Check the address, or use search to find what you need."
    >
      <Button variant="primary" icon={HomeIcon} to="/">
        Back to dashboard
      </Button>
    </Shell>
  )
}

export function ForbiddenPage() {
  return (
    <Shell
      code="403"
      title="You do not have access"
      description="Your role does not include permission for this area. If you believe you should have access, contact your IT administrator."
    >
      <Button variant="primary" icon={HomeIcon} to="/">
        Back to dashboard
      </Button>
    </Shell>
  )
}
