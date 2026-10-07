import { useId } from 'react'
import Autocomplete from '@mui/material/Autocomplete'
import OutlinedInput from '@mui/material/OutlinedInput'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { Spinner } from './Feedback'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

/** Compact (filter-bar) sizing: 32px tall, smaller type, fixed width instead of full width. */
export const COMPACT_WIDTH = 164

/**
 * Searchable single-select. `options`: [{ value, label, description, disabled, keywords, meta }]
 * Works for small option sets loaded up-front (vehicles, drivers, categories).
 *
 * Every dropdown in the app (Combobox, Select, SuggestInput) renders through this
 * component so they all share the same field and popup styling.
 */
export function Combobox({
  options = [],
  value,
  onChange,
  placeholder = 'Select…',
  loading,
  disabled,
  invalid,
  clearable = true,
  renderOption,
  sx,
  emptyText = 'No matches',
  id: idProp,
  name,
  autoFocus,
  searchable = true,
  compact = false,
  mono = false,
  fullWidth = true,
  inputRef,
  onBlur,
  onFocus,
  'aria-label': ariaLabel,
  inputProps: extraInputProps,
  freeSolo = false,
  inputValue,
  onInputChange,
  popupMinWidth,
}) {
  const reactId = useId()
  const id = idProp ?? reactId
  const selected = freeSolo ? undefined : (options.find((o) => String(o.value) === String(value)) ?? null)
  const width = compact ? COMPACT_WIDTH : fullWidth ? '100%' : undefined

  return (
    <Autocomplete
      id={id}
      options={options}
      {...(freeSolo
        ? { freeSolo: true, inputValue: inputValue ?? '', onInputChange, value: null, onChange: () => {} }
        : { value: selected, onChange: (_, opt) => onChange(opt ? opt.value : null) })}
      getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.label ?? ''))}
      getOptionDisabled={(o) => Boolean(o.disabled)}
      isOptionEqualToValue={(a, b) => String(a.value) === String(b.value)}
      filterOptions={(opts, { inputValue: q }) => {
        const needle = q.trim().toLowerCase()
        if (!needle || !searchable) return opts
        if (freeSolo && opts.some((o) => String(o.label).toLowerCase() === needle)) return opts
        return opts.filter((o) => `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(needle))
      }}
      loading={loading}
      disabled={disabled}
      disableClearable={!clearable}
      autoHighlight={!freeSolo}
      openOnFocus
      selectOnFocus={searchable && !freeSolo}
      forcePopupIcon
      size="small"
      fullWidth={Boolean(width)}
      noOptionsText={loading ? 'Loading…' : emptyText}
      popupIcon={<KeyboardArrowDownIcon sx={{ fontSize: compact ? 18 : 20 }} />}
      sx={[{ width, flexShrink: compact ? 0 : undefined }, ...toArray(sx)]}
      slotProps={{ paper: { sx: { minWidth: popupMinWidth ?? (compact ? 200 : undefined) } } }}
      renderOption={(props, o, { selected: active }) => {
        const { key, ...rest } = props
        return (
          <li key={key} {...rest}>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              {renderOption ? (
                renderOption(o)
              ) : (
                <>
                  <Typography
                    component="span"
                    sx={{
                      display: 'block',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      color: o.muted ? 'text.muted' : undefined,
                      fontFamily: mono ? (t) => t.typography.fontFamilyMono : undefined,
                    }}
                  >
                    {o.label}
                  </Typography>
                  {o.description ? (
                    <Typography
                      component="span"
                      sx={{
                        display: 'block',
                        fontSize: 12,
                        color: 'text.muted',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.description}
                    </Typography>
                  ) : null}
                </>
              )}
            </Box>
            {active ? <CheckIcon sx={{ fontSize: 16, flexShrink: 0, color: 'primary.main', ml: 1 }} aria-hidden /> : null}
          </li>
        )
      }}
      renderInput={(params) => {
        const { slotProps: paramSlots, InputLabelProps: _label, InputProps: _legacy, inputProps: _legacyInput, ...rest } = params
        const input = paramSlots?.input ?? {}
        const htmlInput = paramSlots?.htmlInput ?? {}
        return (
          <OutlinedInput
            {...rest}
            ref={input.ref}
            className={input.className}
            onMouseDown={input.onMouseDown}
            startAdornment={input.startAdornment}
            inputRef={inputRef}
            inputProps={{
              ...htmlInput,
              name,
              autoFocus,
              'aria-label': ariaLabel,
              readOnly: !searchable || htmlInput.readOnly,
              ...extraInputProps,
            }}
            placeholder={placeholder}
            error={Boolean(invalid)}
            fullWidth
            size="small"
            onBlur={onBlur}
            onFocus={onFocus}
            sx={[
              compact && {
                height: 32,
                fontSize: 12.5,
                '& .MuiAutocomplete-input': { padding: '5px 0 !important' },
              },
              mono && { '& .MuiAutocomplete-input': { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 13 } },
              !searchable && { '& .MuiAutocomplete-input': { cursor: 'pointer', textOverflow: 'ellipsis' } },
            ]}
            endAdornment={
              <>
                {loading ? <Spinner size="sm" /> : null}
                {input.endAdornment}
              </>
            }
          />
        )
      }}
    />
  )
}
