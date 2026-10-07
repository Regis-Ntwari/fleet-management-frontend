import { Children, forwardRef, isValidElement, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import FormLabel from '@mui/material/FormLabel'
import FormHelperText from '@mui/material/FormHelperText'
import OutlinedInput from '@mui/material/OutlinedInput'
import InputAdornment from '@mui/material/InputAdornment'
import MuiSwitch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { Combobox } from './Combobox'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

/** Attributes that belong on the native <input>/<select>, not on MUI's wrapper. */
const INPUT_ATTRS = new Set([
  'maxLength',
  'minLength',
  'min',
  'max',
  'step',
  'pattern',
  'list',
  'inputMode',
  'autoCapitalize',
  'autoCorrect',
  'spellCheck',
  'accept',
  'multiple',
  'aria-label',
  'aria-describedby',
  'aria-labelledby',
  'data-testid',
])

function splitProps(props) {
  const inputProps = {}
  const rest = {}
  for (const [k, val] of Object.entries(props)) {
    if (INPUT_ATTRS.has(k)) inputProps[k] = val
    else rest[k] = val
  }
  return { inputProps, rest }
}

/**
 * Form field wrapper: label, control, hint and error. Works with react-hook-form
 * by passing the registered props straight through to the control.
 * `span` stretches the field across a two-column FormSection.
 */
export function Field({ label, hint, error, required, sx, children, htmlFor, inline = false, span = false }) {
  return (
    <Box
      sx={[
        { display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0 },
        inline && { display: { sm: 'grid' }, gridTemplateColumns: { sm: '180px 1fr' }, alignItems: { sm: 'start' }, columnGap: { sm: 2 } },
        span && { gridColumn: { sm: '1 / -1' } },
        ...toArray(sx),
      ]}
    >
      {label ? (
        <FormLabel htmlFor={htmlFor} required={required} sx={inline ? { pt: { sm: 1 } } : undefined}>
          {label}
        </FormLabel>
      ) : null}
      <Box sx={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 0.75 }}>
        {children}
        {error ? (
          <FormHelperText error role="alert">
            {error}
          </FormHelperText>
        ) : hint ? (
          <FormHelperText>{hint}</FormHelperText>
        ) : null}
      </Box>
    </Box>
  )
}

/**
 * Text input. `leading` takes an icon component, `trailing` a unit string or node.
 * `mono` / `uppercase` style the typed value.
 */
export const Input = forwardRef(function Input(
  { invalid, leading: Leading, trailing, mono = false, uppercase = false, sx, type = 'text', fullWidth = true, ...props },
  ref,
) {
  const { inputProps, rest } = splitProps(props)
  return (
    <OutlinedInput
      inputRef={ref}
      type={type}
      size="small"
      fullWidth={fullWidth}
      error={Boolean(invalid)}
      startAdornment={
        Leading ? (
          <InputAdornment position="start">
            <Leading sx={{ fontSize: 18 }} aria-hidden />
          </InputAdornment>
        ) : undefined
      }
      endAdornment={
        trailing ? (
          <InputAdornment position="end">
            {typeof trailing === 'string' ? <Typography component="span">{trailing}</Typography> : trailing}
          </InputAdornment>
        ) : undefined
      }
      inputProps={inputProps}
      sx={[
        mono && { '& .MuiInputBase-input': { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 13 } },
        uppercase && { '& .MuiInputBase-input': { textTransform: 'uppercase' } },
        ...toArray(sx),
      ]}
      {...rest}
    />
  )
})

/**
 * Lets a dropdown that keeps its value in React state still work with react-hook-form's
 * `register` (which expects a DOM-like ref it can read `.value` from and assign `.value` to).
 */
function useFormFieldHandle({ ref, name, current, setInner, focus }) {
  const currentRef = useRef(current)
  useLayoutEffect(() => {
    currentRef.current = current
  })
  const handle = useMemo(
    () => ({
      type: 'select-one',
      get name() {
        return name
      },
      get value() {
        return currentRef.current
      },
      set value(v) {
        setInner(v == null ? '' : v)
      },
      focus,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  useImperativeHandle(ref, () => handle, [handle])
  return handle
}

function optionsFromChildren(children) {
  const out = []
  const walk = (nodes) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return
      if (child.type === 'option') {
        const label = typeof child.props.children === 'string' ? child.props.children : String(child.props.children ?? '')
        out.push({ value: child.props.value ?? label, label, disabled: Boolean(child.props.disabled) })
      } else if (child.props?.children) {
        walk(child.props.children)
      }
    })
  }
  walk(children)
  return out
}

/**
 * Single-select rendered with the same searchable popup as `Combobox`, so every dropdown in
 * the app looks alike. Children are `<option>` elements, exactly like a native select, and the
 * component works both controlled (`value`/`onChange(e)`) and with react-hook-form's `register`.
 * `compact` makes the filter-bar variant (fixed width, 32px tall). `searchable` defaults to on
 * when there are more than eight options.
 */
export const Select = forwardRef(function Select(
  {
    invalid,
    children,
    placeholder,
    sx,
    compact = false,
    fullWidth,
    mono = false,
    searchable,
    popupMinWidth,
    'aria-label': ariaLabel,
    value: valueProp,
    defaultValue,
    onChange,
    onBlur,
    name,
    id,
    disabled,
    autoFocus,
    ...props
  },
  ref,
) {
  const { inputProps } = splitProps(props)
  const options = optionsFromChildren(children)
  const isControlled = valueProp !== undefined
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = isControlled ? valueProp : inner
  const inputEl = useRef(null)
  useFormFieldHandle({ ref, name, current, setInner, focus: () => inputEl.current?.focus() })

  const hasPlaceholder = placeholder !== undefined
  const emit = (next, type) => {
    if (!isControlled) setInner(next)
    onChange?.({ type, target: { name, value: next } })
  }

  return (
    <Combobox
      id={id}
      name={name}
      options={hasPlaceholder ? [{ value: '', label: placeholder, muted: true }, ...options] : options}
      value={current === '' && hasPlaceholder ? null : current}
      onChange={(v) => emit(v == null ? '' : v, 'change')}
      onBlur={() => onBlur?.({ type: 'blur', target: { name, value: current } })}
      placeholder={placeholder ?? 'Select…'}
      clearable={hasPlaceholder}
      searchable={searchable ?? options.length > 8}
      compact={compact}
      popupMinWidth={popupMinWidth}
      fullWidth={fullWidth ?? !compact}
      mono={mono}
      invalid={invalid}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      inputRef={inputEl}
      inputProps={inputProps}
      emptyText="No matches"
      sx={sx}
    />
  )
})

/**
 * Free-text input with a list of suggestions (replaces `<input list>` + `<datalist>`), rendered
 * with the same popup as every other dropdown. Works controlled or with `register`.
 */
export const SuggestInput = forwardRef(function SuggestInput(
  { suggestions = [], invalid, sx, value: valueProp, defaultValue, onChange, onBlur, name, id, disabled, autoFocus, placeholder, ...props },
  ref,
) {
  const { inputProps } = splitProps(props)
  const isControlled = valueProp !== undefined
  const [inner, setInner] = useState(defaultValue ?? '')
  const current = isControlled ? (valueProp ?? '') : inner
  const inputEl = useRef(null)
  useFormFieldHandle({ ref, name, current, setInner, focus: () => inputEl.current?.focus() })
  const options = useMemo(() => suggestions.filter(Boolean).map((s) => ({ value: s, label: s })), [suggestions])

  const emit = (next) => {
    if (next === current) return
    if (!isControlled) setInner(next)
    onChange?.({ type: 'change', target: { name, value: next } })
  }

  return (
    <Combobox
      freeSolo
      id={id}
      name={name}
      options={options}
      inputValue={String(current ?? '')}
      onInputChange={(_, v) => emit(v ?? '')}
      onBlur={() => onBlur?.({ type: 'blur', target: { name, value: current } })}
      placeholder={placeholder ?? ''}
      clearable={false}
      invalid={invalid}
      disabled={disabled}
      autoFocus={autoFocus}
      inputRef={inputEl}
      inputProps={inputProps}
      sx={sx}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ invalid, rows = 3, sx, ...props }, ref) {
  const { inputProps, rest } = splitProps(props)
  return (
    <OutlinedInput
      inputRef={ref}
      multiline
      minRows={rows}
      size="small"
      fullWidth
      error={Boolean(invalid)}
      inputProps={inputProps}
      sx={[{ '& textarea': { resize: 'vertical' } }, ...toArray(sx)]}
      {...rest}
    />
  )
})

export function Switch({ checked, onChange, label, disabled, size = 'md' }) {
  return (
    <MuiSwitch
      checked={Boolean(checked)}
      onChange={(e) => onChange(e.target.checked)}
      disabled={disabled}
      size={size === 'sm' ? 'small' : 'medium'}
      slotProps={{ input: { 'aria-label': label, role: 'switch' } }}
    />
  )
}

/** Titled group of fields laid out in two columns on wide screens. */
export function FormSection({ title, description, children, sx }) {
  const id = useId()
  return (
    <Box
      component="section"
      aria-labelledby={id}
      sx={[{ display: 'grid', gap: 2.5, gridTemplateColumns: { lg: '260px minmax(0, 1fr)' } }, ...toArray(sx)]}
    >
      <Box>
        <Typography id={id} component="h3" variant="h3">
          {title}
        </Typography>
        {description ? <Typography sx={{ mt: 0.5, fontSize: 13, color: 'text.muted' }}>{description}</Typography> : null}
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' } }}>{children}</Box>
    </Box>
  )
}
