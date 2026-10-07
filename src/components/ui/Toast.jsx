import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Box from '@mui/material/Box'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Button from '@mui/material/Button'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import InfoIcon from '@mui/icons-material/Info'

const ToastContext = createContext(null)

const ICONS = {
  success: <CheckCircleIcon sx={{ color: 'success.main' }} />,
  error: <ErrorIcon sx={{ color: 'error.main' }} />,
  warning: <WarningAmberIcon sx={{ color: 'warning.main' }} />,
  info: <InfoIcon sx={{ color: 'info.main' }} />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
  }, [])

  const push = useCallback(
    ({ title, description, tone = 'info', duration = 4500, action }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((t) => [...t.slice(-4), { id, title, description, tone, action }])
      if (duration > 0)
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        )
      return id
    },
    [dismiss],
  )

  const api = useMemo(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ title, description, tone: 'success' }),
      error: (title, description) => push({ title, description, tone: 'error', duration: 7000 }),
      warning: (title, description) => push({ title, description, tone: 'warning', duration: 6000 }),
      info: (title, description) => push({ title, description, tone: 'info' }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <Box
          aria-live="polite"
          aria-atomic="false"
          sx={{
            pointerEvents: 'none',
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: (t) => t.zIndex.snackbar,
            display: 'flex',
            flexDirection: 'column',
            alignItems: { xs: 'center', sm: 'flex-end' },
            gap: 1,
            p: 2,
          }}
        >
          {toasts.map((t) => (
            <Alert
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              severity={t.tone}
              icon={ICONS[t.tone]}
              onClose={() => dismiss(t.id)}
              variant="outlined"
              sx={{
                pointerEvents: 'auto',
                width: '100%',
                maxWidth: 384,
                bgcolor: 'background.elevated',
                color: 'text.primary',
                borderColor: 'edge.main',
                boxShadow: (th) => th.vars.palette.shadow.lg,
                '& .MuiAlert-icon': { color: 'inherit' },
              }}
            >
              <AlertTitle sx={{ fontSize: 13.5, fontWeight: 500 }}>{t.title}</AlertTitle>
              {t.description ? <Box sx={{ fontSize: 12.5, color: 'text.muted' }}>{t.description}</Box> : null}
              {t.action ? (
                <Button
                  size="small"
                  variant="text"
                  sx={{ mt: 0.5, ml: -1, px: 1, height: 28, fontSize: 12.5, color: 'soft.accent.fg' }}
                  onClick={() => {
                    t.action.onClick()
                    dismiss(t.id)
                  }}
                >
                  {t.action.label}
                </Button>
              ) : null}
            </Alert>
          ))}
        </Box>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
