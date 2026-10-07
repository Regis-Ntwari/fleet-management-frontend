import { useEffect, useState } from 'react'
import OutlinedInput from '@mui/material/OutlinedInput'
import InputAdornment from '@mui/material/InputAdornment'
import MuiIconButton from '@mui/material/IconButton'
import SearchIcon from '@mui/icons-material/Search'
import CloseIcon from '@mui/icons-material/Close'
import { useDebouncedValue } from '@/hooks/useDebounce'

/** Debounced search box that reports changes after the user pauses typing. */
export function SearchInput({ value, onChange, placeholder = 'Search…', sx, delay = 300, autoFocus }) {
  const [local, setLocal] = useState(value ?? '')
  const [prevValue, setPrevValue] = useState(value)
  const debounced = useDebouncedValue(local, delay)

  // Adopt a new controlled value (e.g. filters reset) without an effect round-trip.
  if (value !== prevValue) {
    setPrevValue(value)
    setLocal(value ?? '')
  }

  useEffect(() => {
    if (debounced !== (value ?? '')) onChange(debounced)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced])

  return (
    <OutlinedInput
      type="search"
      size="small"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      inputProps={{ 'aria-label': placeholder }}
      startAdornment={
        <InputAdornment position="start">
          <SearchIcon sx={{ fontSize: 18 }} aria-hidden />
        </InputAdornment>
      }
      endAdornment={
        local ? (
          <InputAdornment position="end">
            <MuiIconButton
              size="small"
              edge="end"
              aria-label="Clear search"
              onClick={() => {
                setLocal('')
                onChange('')
              }}
              sx={{ p: 0.25 }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </MuiIconButton>
          </InputAdornment>
        ) : undefined
      }
      sx={sx}
    />
  )
}
