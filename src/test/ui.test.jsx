import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ThemeProvider, useTheme } from '@/app/ThemeProvider'
import { Button, IconButton } from '@/components/ui/Button'
import { useForm } from 'react-hook-form'
import { Field, Input, Select, SuggestInput, Switch } from '@/components/ui/Field'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import AddIcon from '@mui/icons-material/Add'

const wrap = (ui) => render(<ThemeProvider>{ui}</ThemeProvider>, { wrapper: MemoryRouter })

describe('MUI design system primitives', () => {
  it('renders buttons as real buttons or router links', () => {
    wrap(
      <>
        <Button variant="primary" icon={AddIcon}>
          Add vehicle
        </Button>
        <Button to="/vehicles">Go to vehicles</Button>
        <IconButton label="Edit" icon={AddIcon} />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Add vehicle' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('link', { name: 'Go to vehicles' })).toHaveAttribute('href', '/vehicles')
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it('disables a loading button', () => {
    wrap(<Button loading>Saving</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('associates labels, hints and errors with the control', async () => {
    wrap(
      <>
        <Field label="Plate number" htmlFor="plate" required hint="e.g. RAD 123 A">
          <Input id="plate" trailing="km" />
        </Field>
        <Field label="Status" htmlFor="status" error="Choose a status">
          <Select id="status" placeholder="Any" invalid>
            <option value="A">A</option>
          </Select>
        </Field>
      </>,
    )
    expect(screen.getByLabelText(/plate number/i)).toBeInTheDocument()
    expect(screen.getByText('e.g. RAD 123 A')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a status')
    const status = screen.getByLabelText(/status/i)
    expect(status).toHaveAttribute('aria-invalid', 'true')
    expect(status).toHaveAttribute('role', 'combobox')
    await userEvent.setup().click(status)
    expect(screen.getByRole('option', { name: 'Any' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'A' })).toBeInTheDocument()
  })

  it('switch reports a boolean', async () => {
    const onChange = vi.fn()
    wrap(<Switch checked={false} onChange={onChange} label="Active" />)
    await userEvent.setup().click(screen.getByRole('switch', { name: 'Active' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('confirm dialog calls back and badges render their text', async () => {
    const onConfirm = vi.fn()
    wrap(
      <>
        <Badge tone="success" dot>
          Available
        </Badge>
        <ConfirmDialog open onClose={() => {}} onConfirm={onConfirm} title="Delete this?" confirmLabel="Delete" />
      </>,
    )
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete this?' })).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('theme can be switched and is persisted under limoz.theme', async () => {
    function Probe() {
      const { theme, setTheme, resolved } = useTheme()
      return (
        <button type="button" onClick={() => setTheme('dark')}>
          {theme}/{resolved}
        </button>
      )
    }
    localStorage.clear()
    wrap(<Probe />)
    await userEvent.setup().click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('dark/dark')
    expect(localStorage.getItem('limoz.theme')).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('Select and SuggestInput work with react-hook-form register, reset and submit', async () => {
    const onSubmit = vi.fn()
    function Form() {
      const { register, handleSubmit, reset } = useForm({ defaultValues: { status: 'B', station: 'Kigali' } })
      return (
        <form onSubmit={handleSubmit((v) => onSubmit(v))}>
          <Field label="Status" htmlFor="status">
            <Select id="status" {...register('status')}>
              <option value="A">Alpha</option>
              <option value="B">Bravo</option>
              <option value="C">Charlie</option>
            </Select>
          </Field>
          <Field label="Station" htmlFor="station">
            <SuggestInput id="station" suggestions={['Kigali', 'Musanze']} {...register('station')} />
          </Field>
          <button type="button" onClick={() => reset({ status: 'C', station: 'Huye' })}>
            reset
          </button>
          <button type="submit">save</button>
        </form>
      )
    }
    const user = userEvent.setup()
    wrap(<Form />)
    const status = screen.getByLabelText('Status')
    const station = screen.getByLabelText('Station')
    expect(status).toHaveValue('Bravo')
    expect(station).toHaveValue('Kigali')

    await user.click(screen.getByRole('button', { name: 'reset' }))
    expect(status).toHaveValue('Charlie')
    expect(station).toHaveValue('Huye')

    await user.click(status)
    await user.click(screen.getByRole('option', { name: 'Alpha' }))
    expect(status).toHaveValue('Alpha')
    await user.clear(station)
    await user.type(station, 'Mus')
    await user.click(screen.getByRole('option', { name: 'Musanze' }))
    expect(station).toHaveValue('Musanze')

    await user.click(screen.getByRole('button', { name: 'save' }))
    expect(onSubmit).toHaveBeenCalledWith({ status: 'A', station: 'Musanze' })
  })

  it('controlled Select emits an event-like onChange and clears back to the placeholder', async () => {
    const onChange = vi.fn()
    wrap(
      <Select value="" onChange={onChange} compact placeholder="Any status" aria-label="Status filter">
        <option value="OPEN">Open</option>
        <option value="CLOSED">Closed</option>
      </Select>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Status filter'))
    await user.click(screen.getByRole('option', { name: 'Closed' }))
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: 'CLOSED' }) }))
    await user.click(screen.getByLabelText('Status filter'))
    await user.click(screen.getByRole('option', { name: 'Any status' }))
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ target: expect.objectContaining({ value: '' }) }))
  })
})
