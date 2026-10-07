import { Link as RouterLink } from 'react-router'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MuiBreadcrumbs from '@mui/material/Breadcrumbs'
import MuiLink from '@mui/material/Link'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

export function Breadcrumbs({ items }) {
  if (!items?.length) return null
  return (
    <MuiBreadcrumbs aria-label="Breadcrumb" separator={<ChevronRightIcon sx={{ fontSize: 14 }} />} sx={{ mb: 0.75 }}>
      {items.map((item, i) =>
        item.to ? (
          <MuiLink
            key={`${item.label}-${i}`}
            component={RouterLink}
            to={item.to}
            sx={{ color: 'text.muted', fontWeight: 400, '&:hover': { color: 'text.primary' } }}
          >
            {item.label}
          </MuiLink>
        ) : (
          <Typography key={`${item.label}-${i}`} component="span" sx={{ fontSize: 'inherit', color: 'text.secondary' }}>
            {item.label}
          </Typography>
        ),
      )}
    </MuiBreadcrumbs>
  )
}

export function PageHeader({ title, description, actions, breadcrumbs, meta, sx, documentTitle, children }) {
  useDocumentTitle(documentTitle ?? (typeof title === 'string' ? title : undefined))
  return (
    <Box sx={[{ mb: 2.5, display: 'flex', flexDirection: 'column', gap: 1.5 }, ...toArray(sx)]}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
        <Box sx={{ minWidth: 0 }}>
          <Breadcrumbs items={breadcrumbs} />
          <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <Typography component="h1" variant="h1" sx={{ fontSize: { xs: 20, sm: 22 } }}>
              {title}
            </Typography>
            {meta}
          </Stack>
          {description ? <Typography sx={{ mt: 0.5, maxWidth: 672, fontSize: 13.5, color: 'text.muted' }}>{description}</Typography> : null}
        </Box>
        {actions ? (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            {actions}
          </Stack>
        ) : null}
      </Box>
      {children}
    </Box>
  )
}
