import { useId } from 'react'
import MuiDialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CloseIcon from '@mui/icons-material/Close'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Button, IconButton } from './Button'

const WIDTHS = { sm: 448, md: 512, lg: 672, xl: 896 }

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', sx, dismissable = true }) {
  const titleId = useId()
  return (
    <MuiDialog
      open={Boolean(open)}
      onClose={dismissable ? onClose : undefined}
      disableEscapeKeyDown={!dismissable}
      aria-labelledby={titleId}
      fullWidth
      maxWidth={false}
      sx={[{ '& .MuiDialog-container': { alignItems: { xs: 'flex-end', sm: 'center' } } }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
      slotProps={{
        paper: {
          sx: {
            width: '100%',
            maxWidth: WIDTHS[size] ?? WIDTHS.md,
            maxHeight: '92dvh',
            m: { xs: 0, sm: 2 },
            borderRadius: { xs: '10px 10px 0 0', sm: '10px' },
          },
        },
      }}
    >
      <DialogTitle
        component="div"
        sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, p: '20px 20px 0' }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography id={titleId} component="h2" variant="h2">
            {title}
          </Typography>
          {description ? (
            <Typography variant="body2" sx={{ mt: 0.5, color: 'text.muted' }}>
              {description}
            </Typography>
          ) : null}
        </Box>
        {dismissable ? <IconButton label="Close" icon={CloseIcon} size="sm" sx={{ mr: -1, mt: -0.5 }} onClick={onClose} /> : null}
      </DialogTitle>
      <DialogContent className="scrollbar-thin" sx={{ px: 2.5, pt: 2, pb: 2 }}>
        {children}
      </DialogContent>
      {footer ? <DialogActions sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>{footer}</DialogActions> : null}
    </MuiDialog>
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  children,
}) {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      dismissable={!loading}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={loading} autoFocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        {tone === 'danger' ? (
          <Box
            sx={{
              display: 'flex',
              width: 36,
              height: 36,
              flexShrink: 0,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              bgcolor: 'soft.danger.bg',
              color: 'soft.danger.fg',
            }}
          >
            <WarningAmberIcon sx={{ fontSize: 18 }} aria-hidden />
          </Box>
        ) : null}
        <Box sx={{ minWidth: 0, fontSize: 13.5, color: 'text.secondary' }}>
          {description ? <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>{description}</Typography> : null}
          {children}
        </Box>
      </Box>
    </Dialog>
  )
}
