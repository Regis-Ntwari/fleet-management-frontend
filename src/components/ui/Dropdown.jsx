import { cloneElement, useId, useState } from 'react'
import { Link } from 'react-router'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

/**
 * Trigger + menu. items: [{ label, icon, onSelect, to, tone: 'danger', disabled, hint } | { separator: true } | { heading }]
 */
export function Dropdown({ trigger, items, align = 'end', width = 208 }) {
  const [anchor, setAnchor] = useState(null)
  const id = useId()
  const open = Boolean(anchor)
  const close = () => setAnchor(null)
  const horizontal = align === 'end' ? 'right' : 'left'

  return (
    <>
      {cloneElement(trigger, {
        onClick: (e) => {
          e.stopPropagation()
          trigger.props.onClick?.(e)
          setAnchor(e.currentTarget)
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? id : undefined,
      })}
      <Menu
        id={id}
        anchorEl={anchor}
        open={open}
        onClose={close}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal }}
        transformOrigin={{ vertical: 'top', horizontal }}
        slotProps={{ paper: { sx: { minWidth: width } }, list: { dense: true } }}
      >
        {items.filter(Boolean).map((item, i) => {
          if (item.separator) return <Divider key={`sep-${i}`} sx={{ my: 0.5 }} />
          if (item.heading)
            return (
              <ListSubheader
                key={`h-${i}`}
                disableSticky
                sx={{ lineHeight: '24px', pt: 0.5, px: 1, textTransform: 'none', letterSpacing: 0, fontSize: 11.5, fontWeight: 500 }}
              >
                {item.heading}
              </ListSubheader>
            )
          const Icon = item.icon
          const linkProps = item.to ? { component: Link, to: item.to } : {}
          return (
            <MenuItem
              key={item.label}
              disabled={item.disabled}
              onClick={() => {
                close()
                item.onSelect?.()
              }}
              sx={
                item.tone === 'danger'
                  ? {
                      color: 'soft.danger.fg',
                      '&:hover, &.Mui-focusVisible': { bgcolor: 'soft.danger.bg' },
                      '& .MuiListItemIcon-root': { color: 'inherit' },
                    }
                  : undefined
              }
              {...linkProps}
            >
              {Icon ? (
                <ListItemIcon>
                  <Icon />
                </ListItemIcon>
              ) : null}
              <ListItemText slotProps={{ primary: { noWrap: true, fontSize: 13 } }}>{item.label}</ListItemText>
              {item.hint ? (
                <Typography component="span" sx={{ ml: 2, fontSize: 11, color: 'text.muted' }}>
                  {item.hint}
                </Typography>
              ) : null}
            </MenuItem>
          )
        })}
      </Menu>
    </>
  )
}
