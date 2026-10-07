import { useEffect } from 'react'
import { ThemeProvider as MuiThemeProvider, useColorScheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme, THEME_STORAGE_KEY } from './theme'

/**
 * MUI theme with two colour schemes. The active scheme is a `.light` / `.dark`
 * class on <html>, applied before first paint by the inline script in index.html
 * and kept in sync by MUI afterwards. The choice persists under `limoz.theme`.
 */
export function ThemeProvider({ children }) {
  return (
    <MuiThemeProvider theme={theme} defaultMode="system" modeStorageKey={THEME_STORAGE_KEY} disableTransitionOnChange noSsr>
      <CssBaseline enableColorScheme />
      <ThemeColorMeta />
      {children}
    </MuiThemeProvider>
  )
}

function ThemeColorMeta() {
  const { resolved } = useTheme()
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]:not([media])')?.setAttribute('content', resolved === 'dark' ? '#000000' : '#ffffff')
  }, [resolved])
  return null
}

/** { theme: 'light' | 'dark' | 'system', resolved: 'light' | 'dark', setTheme, toggle } */
export function useTheme() {
  const { mode, systemMode, setMode } = useColorScheme()
  const current = mode ?? 'system'
  const resolved = current === 'system' ? (systemMode ?? 'light') : current
  return { theme: current, resolved, setTheme: setMode, toggle: () => setMode(resolved === 'dark' ? 'light' : 'dark') }
}
