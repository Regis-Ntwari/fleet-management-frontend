import Box from '@mui/material/Box'
import { keyframes } from '@mui/material/styles'
import { useStatusMeta } from '@/app/ReferenceProvider'
import { formatRelative } from '@/utils/format'

const DOT = {
  success: 'success.main',
  danger: 'error.main',
  warning: 'warning.main',
  neutral: 'text.faint',
  info: 'info.main',
  accent: 'primary.main',
}

const pulse = keyframes`
  50% { opacity: 0.4; }
`

export function GpsDot({ telematics }) {
  const meta = useStatusMeta('gps', telematics?.status)
  if (!telematics)
    return (
      <Box component="span" sx={{ color: 'text.faint' }}>
        —
      </Box>
    )
  const label = meta?.label ?? telematics.status
  const moving = telematics.status === 'ONLINE' && telematics.moving
  return (
    <Box
      component="span"
      title={telematics.lastCommunicationAt ? `Last report ${formatRelative(telematics.lastCommunicationAt)}` : undefined}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 12.5 }}
    >
      <Box
        component="span"
        aria-hidden
        sx={[
          { width: 8, height: 8, borderRadius: '50%', bgcolor: DOT[meta?.tone ?? 'neutral'] },
          moving && { animation: `${pulse} 2s ease-in-out infinite` },
        ]}
      />
      <Box component="span" sx={{ color: 'text.secondary' }}>
        {label}
      </Box>
      {telematics.fuelSensorOk === false ? (
        <Box
          component="span"
          sx={{ borderRadius: '4px', bgcolor: 'soft.warning.bg', px: 0.5, fontSize: 10.5, fontWeight: 500, color: 'soft.warning.fg' }}
        >
          fuel sensor
        </Box>
      ) : null}
    </Box>
  )
}
