import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

export function Card({ children, as = 'section', sx, ...props }) {
  return (
    <Paper component={as} variant="outlined" sx={[{ borderRadius: '10px', bgcolor: 'background.paper' }, ...toArray(sx)]} {...props}>
      {children}
    </Paper>
  )
}

export function CardHeader({ title, description, actions, sx, compact = false }) {
  return (
    <Box
      component="header"
      sx={[
        {
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          px: compact ? 2 : 2.5,
          py: compact ? 1.25 : 1.75,
        },
        ...toArray(sx),
      ]}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography component="h2" variant="h3">
          {title}
        </Typography>
        {description ? (
          <Typography variant="body2" sx={{ mt: 0.25, fontSize: 12.5, color: 'text.muted' }}>
            {description}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          {actions}
        </Stack>
      ) : null}
    </Box>
  )
}

export function CardBody({ children, flush = false, sx }) {
  return <Box sx={[{ p: flush ? 0 : 2.5 }, ...toArray(sx)]}>{children}</Box>
}

export function CardFooter({ children, sx }) {
  return (
    <Box
      component="footer"
      sx={[
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          borderTop: 1,
          borderColor: 'divider',
          px: 2.5,
          py: 1.5,
        },
        ...toArray(sx),
      ]}
    >
      {children}
    </Box>
  )
}
