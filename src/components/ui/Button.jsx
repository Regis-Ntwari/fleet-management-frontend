import { forwardRef } from 'react'
import { Link } from 'react-router'
import MuiButton from '@mui/material/Button'
import MuiIconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'

const VARIANTS = {
  primary: { variant: 'contained', color: 'primary' },
  secondary: { variant: 'outlined', color: 'inherit' },
  ghost: { variant: 'text', color: 'inherit' },
  danger: { variant: 'contained', color: 'error' },
  'danger-soft': { variant: 'text', color: 'error' },
  link: { variant: 'text', color: 'primary' },
}

const VARIANT_SX = {
  'danger-soft': {
    bgcolor: 'soft.danger.bg',
    color: 'soft.danger.fg',
    '&:hover': { bgcolor: 'soft.danger.bg', filter: 'brightness(0.96)' },
  },
  link: {
    p: 0,
    height: 'auto',
    minWidth: 0,
    color: 'soft.accent.fg',
    '&:hover': { bgcolor: 'transparent', textDecoration: 'underline', textUnderlineOffset: 2 },
  },
}

const SIZES = {
  xs: {
    height: 28,
    px: 1,
    fontSize: 12,
    borderRadius: '4px',
    '& .MuiButton-startIcon > *:nth-of-type(1), & .MuiButton-endIcon > *:nth-of-type(1)': { fontSize: 16 },
  },
  sm: { height: 32, px: 1.25, fontSize: 13 },
  md: { height: 36, px: 1.75, fontSize: 13.5 },
  lg: { height: 40, px: 2, fontSize: 14 },
}

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

/**
 * variant: primary | secondary | ghost | danger | danger-soft | link
 * size: xs | sm | md | lg. `icon` / `iconRight` take an icon component; `to` renders a router link.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', loading = false, disabled, icon: Icon, iconRight: IconRight, sx, children, to, type, ...props },
  ref,
) {
  const map = VARIANTS[variant] ?? VARIANTS.secondary
  const linkProps = to ? { component: Link, to } : {}
  return (
    <MuiButton
      ref={ref}
      variant={map.variant}
      color={map.color}
      disabled={disabled}
      loading={loading}
      loadingPosition={Icon ? 'start' : IconRight ? 'end' : 'center'}
      startIcon={Icon ? <Icon /> : undefined}
      endIcon={IconRight ? <IconRight /> : undefined}
      type={to ? undefined : (type ?? 'button')}
      sx={[SIZES[size] ?? SIZES.md, VARIANT_SX[variant] ?? {}, ...toArray(sx)]}
      {...linkProps}
      {...props}
    >
      {children}
    </MuiButton>
  )
})

const ICON_VARIANT_SX = {
  ghost: {},
  secondary: {
    border: 1,
    borderColor: 'edge.main',
    bgcolor: 'background.paper',
    '&:hover': { bgcolor: 'background.subtle', borderColor: 'edge.strong' },
  },
  primary: {
    bgcolor: 'primary.main',
    color: 'primary.contrastText',
    '&:hover': { bgcolor: 'primary.dark', color: 'primary.contrastText' },
  },
  danger: { color: 'error.main', '&:hover': { bgcolor: 'soft.danger.bg', color: 'soft.danger.fg' } },
}

export const IconButton = forwardRef(function IconButton(
  { label, icon: Icon, size = 'md', variant = 'ghost', sx, children, to, disabled, ...props },
  ref,
) {
  const dims = { xs: 28, sm: 32, md: 36, lg: 40 }[size] ?? 36
  const iconSize = size === 'xs' ? 16 : 18
  const linkProps = to ? { component: Link, to } : {}
  const button = (
    <MuiIconButton
      ref={ref}
      aria-label={label}
      disabled={disabled}
      sx={[{ width: dims, height: dims, p: 0, flexShrink: 0 }, ICON_VARIANT_SX[variant] ?? {}, ...toArray(sx)]}
      {...linkProps}
      {...props}
    >
      {Icon ? <Icon sx={{ fontSize: iconSize }} /> : children}
    </MuiIconButton>
  )
  if (!label) return button
  return <Tooltip title={label}>{disabled ? <span style={{ display: 'inline-flex' }}>{button}</span> : button}</Tooltip>
})
