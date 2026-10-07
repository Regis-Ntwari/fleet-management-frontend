import { createTheme } from '@mui/material/styles'

export const THEME_STORAGE_KEY = 'limoz.theme'
export const SIDEBAR_WIDTH = 248
export const SIDEBAR_WIDTH_COLLAPSED = 64
export const TOPBAR_HEIGHT = 56

export const fontFamily = "'Inter Variable', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
export const fontFamilyMono = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

/**
 * Light = pure white surfaces, dark = pure black surfaces, green accent.
 * Every colour is exposed as a CSS variable (--limoz-palette-*) so plain CSS
 * (charts, scrollbars, focus rings) follows the active scheme too.
 */
const light = {
  mode: 'light',
  primary: { main: '#0f7a38', dark: '#0c6a30', light: '#1a9d4b', contrastText: '#ffffff' },
  success: { main: '#0f7a38', dark: '#0b5e2b', light: '#1a9d4b', contrastText: '#ffffff' },
  warning: { main: '#b45309', dark: '#8a4206', light: '#d97706', contrastText: '#ffffff' },
  error: { main: '#c62828', dark: '#a11d1d', light: '#e53935', contrastText: '#ffffff' },
  info: { main: '#1d5fb3', dark: '#164a8c', light: '#2a78d6', contrastText: '#ffffff' },
  background: {
    default: '#ffffff',
    paper: '#ffffff',
    subtle: '#f6f8f7',
    muted: '#eef2f0',
    elevated: '#ffffff',
    overlay: 'rgba(10, 15, 12, 0.45)',
  },
  text: { primary: '#0b0f0d', secondary: '#4a5550', muted: '#7b8782', faint: '#a6b0ab', disabled: '#a6b0ab', inverse: '#ffffff' },
  divider: '#e3e8e5',
  edge: { main: '#e3e8e5', strong: '#cdd5d1' },
  soft: {
    success: { bg: '#e6f4ea', fg: '#0b5e2b' },
    warning: { bg: '#fdf1e0', fg: '#8a4206' },
    danger: { bg: '#fdeaea', fg: '#a11d1d' },
    info: { bg: '#e8f0fb', fg: '#164a8c' },
    accent: { bg: '#e6f4ea', fg: '#0b5e2b', border: '#b6dfc3' },
    neutral: { bg: '#eef1f0', fg: '#4a5550' },
  },
  chart: { s1: '#0f8a3c', s2: '#2a78d6', s3: '#eb6834', s4: '#4a3aa7', s5: '#e87ba4', grid: '#e8ecea', axis: '#c3cac6', muted: '#8a948f' },
  shadow: {
    sm: '0 1px 2px rgba(11, 15, 13, 0.06)',
    md: '0 4px 12px -2px rgba(11, 15, 13, 0.1), 0 2px 4px -2px rgba(11, 15, 13, 0.06)',
    lg: '0 16px 40px -12px rgba(11, 15, 13, 0.22), 0 4px 10px -4px rgba(11, 15, 13, 0.1)',
  },
  action: { hover: 'rgba(11, 15, 13, 0.04)', selected: 'rgba(15, 122, 56, 0.08)', focus: 'rgba(15, 122, 56, 0.12)' },
}

const dark = {
  mode: 'dark',
  primary: { main: '#22b35a', dark: '#1a9d4b', light: '#2cc466', contrastText: '#03140a' },
  success: { main: '#22b35a', dark: '#1a9d4b', light: '#5fdc8a', contrastText: '#03140a' },
  warning: { main: '#f0a33b', dark: '#d98b1f', light: '#f5bd6b', contrastText: '#1a1000' },
  error: { main: '#ef5350', dark: '#d32f2f', light: '#ff8a85', contrastText: '#ffffff' },
  info: { main: '#5a9ef0', dark: '#3987e5', light: '#8bbcf7', contrastText: '#06101f' },
  background: {
    default: '#000000',
    paper: '#000000',
    subtle: '#0a0c0b',
    muted: '#121514',
    elevated: '#0f1211',
    overlay: 'rgba(0, 0, 0, 0.7)',
  },
  text: { primary: '#f2f4f3', secondary: '#b7c0bb', muted: '#7f8a85', faint: '#525c57', disabled: '#525c57', inverse: '#0b0f0d' },
  divider: '#1f2422',
  edge: { main: '#1f2422', strong: '#2f3633' },
  soft: {
    success: { bg: '#0d2416', fg: '#5fdc8a' },
    warning: { bg: '#2a1d08', fg: '#f5bd6b' },
    danger: { bg: '#2c1010', fg: '#ff8a85' },
    info: { bg: '#0e1c30', fg: '#8bbcf7' },
    accent: { bg: '#0d2416', fg: '#5fdc8a', border: '#1c4a2c' },
    neutral: { bg: '#1a1f1d', fg: '#b7c0bb' },
  },
  chart: { s1: '#1f9e4f', s2: '#3987e5', s3: '#d95926', s4: '#9085e9', s5: '#d55181', grid: '#1c211f', axis: '#2f3633', muted: '#7f8a85' },
  shadow: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
    md: '0 4px 12px -2px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04)',
    lg: '0 20px 50px -12px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.06)',
  },
  action: { hover: 'rgba(255, 255, 255, 0.06)', selected: 'rgba(34, 179, 90, 0.14)', focus: 'rgba(34, 179, 90, 0.18)' },
}

const v = (theme, path) => path.split('.').reduce((acc, k) => acc?.[k], theme.vars.palette)

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class', cssVarPrefix: 'limoz' },
  colorSchemes: { light: { palette: light }, dark: { palette: dark } },
  shape: { borderRadius: 6 },
  spacing: 8,
  typography: {
    fontFamily,
    fontFamilyMono,
    fontSize: 14,
    h1: { fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.25 },
    h2: { fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.3 },
    h3: { fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 },
    h4: { fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 },
    h5: { fontSize: 13, fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 },
    subtitle1: { fontSize: 14, fontWeight: 500, lineHeight: 1.4 },
    subtitle2: { fontSize: 13, fontWeight: 500, lineHeight: 1.4 },
    body1: { fontSize: 14, lineHeight: 1.5 },
    body2: { fontSize: 13, lineHeight: 1.5 },
    caption: { fontSize: 12, lineHeight: 1.4 },
    overline: { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.6 },
    button: { fontSize: 13.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0 },
    mono: { fontFamily: fontFamilyMono, fontSize: 12.5, lineHeight: 1.5 },
  },
  components: {
    MuiTypography: { defaultProps: { variantMapping: { mono: 'span' } } },
    MuiButtonBase: { defaultProps: { disableTouchRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: theme.shape.borderRadius,
          minWidth: 0,
          whiteSpace: 'nowrap',
          flexShrink: 0,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
          '&.Mui-disabled': { opacity: 0.55 },
          '&.Mui-focusVisible': { outline: `2px solid ${v(theme, 'primary.main')}`, outlineOffset: 2 },
        }),
        sizeSmall: { height: 32, padding: '0 10px', fontSize: 13 },
        sizeMedium: { height: 36, padding: '0 14px', fontSize: 13.5 },
        sizeLarge: { height: 40, padding: '0 16px', fontSize: 14 },
        startIcon: { marginRight: 6, marginLeft: -2, '& > *:nth-of-type(1)': { fontSize: 18 } },
        endIcon: { marginLeft: 6, marginRight: -2, '& > *:nth-of-type(1)': { fontSize: 18 } },
        containedPrimary: ({ theme }) => ({
          '&:hover': { backgroundColor: v(theme, 'primary.dark') },
          '&.Mui-disabled': { backgroundColor: v(theme, 'primary.main'), color: v(theme, 'primary.contrastText') },
        }),
        containedError: ({ theme }) => ({
          '&.Mui-disabled': { backgroundColor: v(theme, 'error.main'), color: v(theme, 'error.contrastText') },
        }),
        outlinedInherit: ({ theme }) => ({
          borderColor: v(theme, 'edge.main'),
          backgroundColor: v(theme, 'background.paper'),
          color: v(theme, 'text.primary'),
          boxShadow: v(theme, 'shadow.sm'),
          '&:hover': { backgroundColor: v(theme, 'background.subtle'), borderColor: v(theme, 'edge.strong') },
          '&.Mui-disabled': { borderColor: v(theme, 'edge.main'), color: v(theme, 'text.primary') },
        }),
        textInherit: ({ theme }) => ({
          color: v(theme, 'text.secondary'),
          '&:hover': { backgroundColor: v(theme, 'background.muted'), color: v(theme, 'text.primary') },
          '&.Mui-disabled': { color: v(theme, 'text.secondary') },
        }),
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          color: v(theme, 'text.secondary'),
          '&:hover': { backgroundColor: v(theme, 'background.muted'), color: v(theme, 'text.primary') },
          '&.Mui-focusVisible': { outline: `2px solid ${v(theme, 'primary.main')}`, outlineOffset: 2 },
          '&.Mui-disabled': { opacity: 0.45, color: v(theme, 'text.secondary') },
        }),
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: ({ theme }) => ({ borderColor: v(theme, 'edge.main') }),
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { fontSize: 14, lineHeight: '20px' },
        input: ({ theme }) => ({
          '&::placeholder': { color: v(theme, 'text.faint'), opacity: 1 },
          '&:-webkit-autofill': { borderRadius: 'inherit' },
        }),
        inputSizeSmall: { height: 20, padding: '7px 12px', lineHeight: '20px' },
        inputMultiline: { padding: 0 },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          backgroundColor: v(theme, 'background.paper'),
          color: v(theme, 'text.primary'),
          transition: 'border-color 150ms, box-shadow 150ms, background-color 150ms',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: v(theme, 'edge.main'), transition: 'border-color 150ms' },
          '&:hover:not(.Mui-disabled):not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: v(theme, 'edge.strong') },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 1, borderColor: v(theme, 'primary.main') },
          '&.Mui-focused': { boxShadow: `0 0 0 3px rgba(${v(theme, 'primary.mainChannel')} / 0.18)` },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: v(theme, 'error.main') },
          '&.Mui-error.Mui-focused': { boxShadow: `0 0 0 3px rgba(${v(theme, 'error.mainChannel')} / 0.18)` },
          '&.Mui-disabled': { backgroundColor: v(theme, 'background.subtle') },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': { borderColor: v(theme, 'edge.main') },
          '&.Mui-disabled .MuiInputBase-input': { WebkitTextFillColor: v(theme, 'text.muted'), cursor: 'not-allowed' },
        }),
        multiline: { padding: '8px 12px', minHeight: 88, alignItems: 'flex-start' },
        adornedStart: { paddingLeft: 10 },
        adornedEnd: { paddingRight: 10 },
      },
    },
    MuiInputAdornment: {
      styleOverrides: {
        root: ({ theme }) => ({ color: v(theme, 'text.muted'), '& .MuiTypography-root': { color: 'inherit', fontSize: 12 } }),
      },
    },
    MuiFormLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: 13,
          fontWeight: 500,
          color: v(theme, 'text.secondary'),
          '&.Mui-focused': { color: v(theme, 'text.secondary') },
        }),
        asterisk: ({ theme }) => ({ color: v(theme, 'error.main'), marginLeft: 2 }),
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: ({ theme }) => ({ margin: 0, fontSize: 12.5, lineHeight: 1.4, color: v(theme, 'text.muted') }) },
    },
    MuiFormControlLabel: { styleOverrides: { label: { fontSize: 13.5 } } },
    MuiCheckbox: { styleOverrides: { root: { padding: 4 } } },
    MuiSwitch: {
      styleOverrides: {
        root: { padding: 6 },
        track: ({ theme }) => ({ borderRadius: 999, backgroundColor: v(theme, 'edge.strong'), opacity: 1 }),
        switchBase: ({ theme }) => ({
          '&.Mui-checked + .MuiSwitch-track': { backgroundColor: v(theme, 'primary.main'), opacity: 1 },
        }),
        thumb: ({ theme }) => ({ boxShadow: v(theme, 'shadow.sm') }),
      },
    },
    MuiTableContainer: { styleOverrides: { root: { scrollbarWidth: 'thin' } } },
    MuiTableCell: {
      styleOverrides: {
        root: ({ theme }) => ({ padding: '10px 12px', borderBottomColor: v(theme, 'edge.main'), fontSize: 13.5, lineHeight: 1.45 }),
        head: ({ theme }) => ({
          fontSize: 12,
          fontWeight: 500,
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
          color: v(theme, 'text.muted'),
          backgroundColor: v(theme, 'background.subtle'),
          padding: '8px 12px',
        }),
        stickyHeader: ({ theme }) => ({ backgroundColor: v(theme, 'background.subtle') }),
        footer: ({ theme }) => ({
          fontSize: 13,
          fontWeight: 600,
          color: v(theme, 'text.primary'),
          backgroundColor: v(theme, 'background.subtle'),
          borderTop: `1px solid ${v(theme, 'edge.main')}`,
          borderBottom: 0,
        }),
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&:last-child td': { borderBottom: 0 },
          '&.MuiTableRow-hover:hover': { backgroundColor: v(theme, 'background.subtle') },
        }),
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          '&:hover': { color: v(theme, 'text.primary') },
          '&.Mui-active': { color: v(theme, 'text.primary') },
          '&.Mui-active .MuiTableSortLabel-icon': { color: v(theme, 'text.primary') },
        }),
        icon: { fontSize: 14, marginLeft: 2, marginRight: 2 },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: ({ theme }) => ({ minHeight: 40, borderBottom: `1px solid ${v(theme, 'edge.main')}` }),
        indicator: { height: 2 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          minHeight: 40,
          minWidth: 0,
          padding: '0 12px',
          fontSize: 13.5,
          fontWeight: 500,
          color: v(theme, 'text.muted'),
          gap: 8,
          '&:hover': { color: v(theme, 'text.primary') },
          '&.Mui-selected': { color: v(theme, 'text.primary') },
          '& .MuiTab-icon': { fontSize: 16, marginRight: 0, marginBottom: 0 },
        }),
      },
    },
    MuiToggleButtonGroup: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: v(theme, 'background.subtle'),
          border: `1px solid ${v(theme, 'edge.main')}`,
          borderRadius: theme.shape.borderRadius,
          padding: 2,
          gap: 2,
        }),
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          textTransform: 'none',
          border: 0,
          borderRadius: `${theme.shape.borderRadius - 1}px !important`,
          padding: '0 10px',
          height: 28,
          fontSize: 12.5,
          fontWeight: 500,
          color: v(theme, 'text.muted'),
          gap: 6,
          '&:hover': { color: v(theme, 'text.primary'), backgroundColor: 'transparent' },
          '&.Mui-selected': {
            color: v(theme, 'text.primary'),
            backgroundColor: v(theme, 'background.paper'),
            boxShadow: v(theme, 'shadow.sm'),
          },
          '&.Mui-selected:hover': { backgroundColor: v(theme, 'background.paper') },
          '& .MuiSvgIcon-root': { fontSize: 15 },
        }),
        sizeMedium: { height: 32, fontSize: 13 },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 500, borderRadius: 999, maxWidth: '100%' },
        sizeSmall: { height: 20, fontSize: 11 },
        labelSmall: { paddingLeft: 8, paddingRight: 8 },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 10,
          backgroundColor: v(theme, 'background.elevated'),
          backgroundImage: 'none',
          boxShadow: v(theme, 'shadow.lg'),
          border: `1px solid ${v(theme, 'edge.main')}`,
        }),
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: 16, fontWeight: 600, padding: '20px 20px 4px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '12px 20px 16px' } } },
    MuiDialogActions: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: '14px 20px',
          gap: 8,
          borderTop: `1px solid ${v(theme, 'edge.main')}`,
          '& > :not(:first-of-type)': { marginLeft: 0 },
        }),
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: v(theme, 'background.overlay'),
          '&:not(.MuiBackdrop-invisible)': { backdropFilter: 'blur(2px)' },
        }),
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          border: `1px solid ${v(theme, 'edge.main')}`,
          backgroundColor: v(theme, 'background.elevated'),
          boxShadow: v(theme, 'shadow.md'),
          marginTop: 4,
          minWidth: 180,
        }),
        list: { padding: 4 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({ theme }) => ({
          fontSize: 13,
          borderRadius: theme.shape.borderRadius - 2,
          minHeight: 32,
          padding: '6px 8px',
          gap: 10,
          '&:hover, &.Mui-focusVisible': { backgroundColor: v(theme, 'background.muted') },
          '&.Mui-selected': { backgroundColor: v(theme, 'background.muted') },
          '& .MuiListItemIcon-root': { minWidth: 0, color: v(theme, 'text.muted') },
          '& .MuiListItemIcon-root .MuiSvgIcon-root': { fontSize: 18 },
        }),
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          border: `1px solid ${v(theme, 'edge.main')}`,
          backgroundColor: v(theme, 'background.elevated'),
          boxShadow: v(theme, 'shadow.md'),
        }),
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          border: `1px solid ${v(theme, 'edge.main')}`,
          backgroundColor: v(theme, 'background.elevated'),
          boxShadow: v(theme, 'shadow.md'),
          marginTop: 4,
        }),
        listbox: ({ theme }) => ({
          padding: 4,
          '& .MuiAutocomplete-option': {
            fontSize: 13,
            borderRadius: theme.shape.borderRadius - 2,
            padding: '6px 10px',
            minHeight: 32,
            '&.Mui-focused': { backgroundColor: v(theme, 'background.muted') },
            '&[aria-selected="true"]': { backgroundColor: 'transparent' },
            '&[aria-selected="true"].Mui-focused': { backgroundColor: v(theme, 'background.muted') },
          },
        }),
        inputRoot: { paddingTop: 0, paddingBottom: 0, paddingLeft: 12 },
        input: { padding: '7px 0 !important' },
        endAdornment: { right: 8 },
        noOptions: { fontSize: 13, padding: '8px 10px' },
        loading: { fontSize: 13, padding: '8px 10px' },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: false, enterDelay: 400 },
      styleOverrides: {
        tooltip: ({ theme }) => ({
          fontSize: 12,
          fontWeight: 500,
          padding: '5px 8px',
          borderRadius: theme.shape.borderRadius - 2,
          backgroundColor: v(theme, 'text.primary'),
          color: v(theme, 'background.default'),
        }),
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          fontSize: 13,
          padding: '8px 14px',
          alignItems: 'flex-start',
          lineHeight: 1.5,
        }),
        icon: { fontSize: 18, padding: '3px 0', marginRight: 10, opacity: 1 },
        message: { padding: '2px 0', minWidth: 0, flex: 1 },
        action: { paddingTop: 0, marginRight: -6 },
        standardSuccess: ({ theme }) => ({
          backgroundColor: v(theme, 'soft.success.bg'),
          color: v(theme, 'soft.success.fg'),
          '& .MuiAlert-icon': { color: 'inherit' },
        }),
        standardWarning: ({ theme }) => ({
          backgroundColor: v(theme, 'soft.warning.bg'),
          color: v(theme, 'soft.warning.fg'),
          '& .MuiAlert-icon': { color: 'inherit' },
        }),
        standardError: ({ theme }) => ({
          backgroundColor: v(theme, 'soft.danger.bg'),
          color: v(theme, 'soft.danger.fg'),
          '& .MuiAlert-icon': { color: 'inherit' },
        }),
        standardInfo: ({ theme }) => ({
          backgroundColor: v(theme, 'soft.info.bg'),
          color: v(theme, 'soft.info.fg'),
          '& .MuiAlert-icon': { color: 'inherit' },
        }),
      },
    },
    MuiAlertTitle: { styleOverrides: { root: { fontSize: 13, fontWeight: 600, marginBottom: 2, marginTop: 0 } } },
    MuiAppBar: {
      defaultProps: { color: 'transparent', elevation: 0, position: 'sticky' },
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: `rgba(${v(theme, 'background.defaultChannel')} / 0.9)`,
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${v(theme, 'edge.main')}`,
          color: v(theme, 'text.primary'),
          backgroundImage: 'none',
        }),
      },
    },
    MuiToolbar: { styleOverrides: { root: { minHeight: `${56}px !important`, paddingLeft: 12, paddingRight: 12 } } },
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          backgroundColor: v(theme, 'background.default'),
          backgroundImage: 'none',
          borderColor: v(theme, 'edge.main'),
        }),
      },
    },
    MuiList: { styleOverrides: { root: { padding: 0 } } },
    MuiListSubheader: {
      styleOverrides: {
        root: ({ theme }) => ({
          backgroundColor: 'transparent',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          lineHeight: '20px',
          color: v(theme, 'text.faint'),
          padding: '0 10px',
          marginBottom: 4,
        }),
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: theme.shape.borderRadius,
          minHeight: 36,
          padding: '6px 10px',
          gap: 12,
          fontSize: 13.5,
          fontWeight: 500,
          color: v(theme, 'text.secondary'),
          '&:hover': { backgroundColor: v(theme, 'background.muted'), color: v(theme, 'text.primary') },
          '&.Mui-selected': { backgroundColor: v(theme, 'soft.accent.bg'), color: v(theme, 'soft.accent.fg') },
          '&.Mui-selected:hover': { backgroundColor: v(theme, 'soft.accent.bg') },
          '&.Mui-focusVisible': { backgroundColor: v(theme, 'background.muted') },
        }),
      },
    },
    MuiListItemIcon: { styleOverrides: { root: { minWidth: 0, color: 'inherit', '& .MuiSvgIcon-root': { fontSize: 19 } } } },
    MuiListItemText: { styleOverrides: { primary: { fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 1.4 } } },
    MuiSkeleton: {
      defaultProps: { animation: 'pulse' },
      styleOverrides: { root: ({ theme }) => ({ backgroundColor: v(theme, 'background.muted'), borderRadius: theme.shape.borderRadius }) },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: ({ theme }) => ({ height: 6, borderRadius: 999, backgroundColor: v(theme, 'background.muted') }),
        bar: { borderRadius: 999 },
      },
    },
    MuiLink: {
      defaultProps: { underline: 'hover' },
      styleOverrides: { root: ({ theme }) => ({ fontWeight: 500, color: v(theme, 'soft.accent.fg'), textUnderlineOffset: 2 }) },
    },
    MuiBreadcrumbs: {
      styleOverrides: {
        root: ({ theme }) => ({ fontSize: 12.5, color: v(theme, 'text.muted') }),
        separator: ({ theme }) => ({ marginLeft: 4, marginRight: 4, color: v(theme, 'text.faint') }),
      },
    },
    MuiDivider: { styleOverrides: { root: ({ theme }) => ({ borderColor: v(theme, 'edge.main') }) } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 600, fontSize: 12, letterSpacing: 0 } } },
    MuiBadge: { styleOverrides: { badge: { fontSize: 10.5, fontWeight: 600, minWidth: 16, height: 16, padding: '0 4px' } } },
    MuiCircularProgress: { defaultProps: { thickness: 4.5 } },
    MuiCssBaseline: {
      styleOverrides: {
        body: { fontSize: 14, lineHeight: 1.5 },
      },
    },
  },
})
