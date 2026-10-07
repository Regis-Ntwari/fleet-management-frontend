import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EventRepeatIcon from '@mui/icons-material/EventRepeat'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery, useVehicleOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select, Field, Input, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ToneBadge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { formatDate, formatKm, formatNumber } from '@/utils/format'

const TASKS = [
  'Engine oil & filter',
  'Oil filter',
  'Air filter',
  'Fuel filter',
  'Brake inspection',
  'Tyre rotation',
  'Tyres',
  'Transmission fluid',
  'General service',
]

export default function SchedulesPage() {
  const [state, update, reset] = useSearchState({ size: 25 })
  const { can } = useAuth()
  const vehicles = useVehicleOptions()
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const params = useMemo(
    () => ({ q: state.q, state: state.state, vehicleId: state.vehicleId, page: state.page, size: state.size }),
    [state],
  )
  const query = usePagedQuery(['maintenance', 'schedules', 'list'], '/maintenance-schedules', params)
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/maintenance-schedules/${id}`),
    invalidate: [['maintenance', 'schedules'], ['vehicles'], ['dashboard'], ['alerts']],
    success: 'Schedule removed',
    onSuccess: () => setDeleting(null),
  })
  const columns = [
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      render: (s) => <LinkText to={`/vehicles/${s.vehicleId}?tab=maintenance`}>{s.vehiclePlate}</LinkText>,
    },
    {
      key: 'task',
      header: 'Task',
      render: (s) => (
        <Box component="span" sx={{ fontWeight: 500 }}>
          {s.task}
        </Box>
      ),
    },
    {
      key: 'interval',
      header: 'Interval',
      render: (s) =>
        [s.intervalKm && `${formatNumber(s.intervalKm)} km`, s.intervalDays && `${s.intervalDays} d`].filter(Boolean).join(' / '),
      hideBelow: 'md',
    },
    {
      key: 'last',
      header: 'Last service',
      render: (s) => `${formatKm(s.lastServiceKm)} · ${formatDate(s.lastServiceDate)}`,
      hideBelow: 'lg',
    },
    {
      key: 'next',
      header: 'Next due',
      render: (s) =>
        [s.nextServiceKm && formatKm(s.nextServiceKm), s.nextServiceDate && formatDate(s.nextServiceDate)].filter(Boolean).join(' · '),
    },
    { key: 'currentOdometerKm', header: 'Odometer', align: 'right', render: (s) => formatKm(s.currentOdometerKm), hideBelow: 'xl' },
    {
      key: 'remaining',
      header: 'Remaining',
      align: 'right',
      render: (s) => (
        <Box
          component="span"
          sx={
            s.state === 'OVERDUE'
              ? { fontWeight: 500, color: 'soft.danger.fg' }
              : s.state === 'DUE_SOON'
                ? { fontWeight: 500, color: 'soft.warning.fg' }
                : undefined
          }
        >
          {s.kmRemaining != null ? `${formatNumber(s.kmRemaining)} km` : ''}
          {s.kmRemaining != null && s.daysRemaining != null ? ' · ' : ''}
          {s.daysRemaining != null ? `${s.daysRemaining} d` : ''}
        </Box>
      ),
    },
    { key: 'state', header: 'State', render: (s) => <ToneBadge value={s.state} size="sm" /> },
    can('MAINTENANCE_MANAGE') && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (s) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(s)
              setOpen(true)
            }}
          />
          <IconButton label="Delete" icon={DeleteIcon} size="xs" onClick={() => setDeleting(s)} />
        </Box>
      ),
    },
  ]
  return (
    <Box>
      <PageHeader
        title="Service schedules"
        description="Preventive tasks by distance and time. Due and overdue states are computed from the live odometer."
        breadcrumbs={[{ label: 'Maintenance', to: '/maintenance' }, { label: 'Service schedules' }]}
        actions={
          can('MAINTENANCE_MANAGE') ? (
            <Button
              variant="primary"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add schedule
            </Button>
          ) : null
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Plate or task…"
        filters={
          <>
            <SegmentedControl
              label="State"
              value={state.state ?? ''}
              onChange={(v) => update({ state: v })}
              options={[
                { value: '', label: 'All' },
                { value: 'OVERDUE', label: 'Overdue' },
                { value: 'DUE_SOON', label: 'Due soon' },
                { value: 'OK', label: 'OK' },
              ]}
            />
            <Select
              value={state.vehicleId ?? ''}
              onChange={(e) => update({ vehicleId: e.target.value })}
              compact
              placeholder="All vehicles"
              aria-label="Vehicle"
            >
              {vehicles.options.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
          </>
        }
        empty={<EmptyState icon={EventRepeatIcon} title="No schedules match" compact />}
      />
      <ScheduleDialog open={open} onClose={() => setOpen(false)} schedule={editing} vehicleOptions={vehicles.options} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Remove schedule?"
        description={deleting ? `${deleting.task} for ${deleting.vehiclePlate} will no longer generate due alerts.` : ''}
        confirmLabel="Remove"
      />
    </Box>
  )
}

function ScheduleDialog({ open, onClose, schedule, vehicleOptions }) {
  const isEdit = Boolean(schedule)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm({
    values: schedule
      ? {
          vehicleId: schedule.vehicleId,
          task: schedule.task,
          intervalKm: schedule.intervalKm ?? '',
          intervalDays: schedule.intervalDays ?? '',
          lastServiceKm: schedule.lastServiceKm,
          lastServiceDate: schedule.lastServiceDate,
        }
      : { vehicleId: '', task: '', intervalKm: 5000, intervalDays: '', lastServiceKm: '', lastServiceDate: '' },
  })
  const save = useApiMutation({
    mutationFn: (values) =>
      isEdit ? http.put(`/maintenance-schedules/${schedule.id}`, values) : http.post('/maintenance-schedules', values),
    invalidate: [['maintenance', 'schedules'], ['vehicles'], ['dashboard'], ['alerts']],
    success: isEdit ? 'Schedule updated' : 'Schedule added',
    onSuccess: () => {
      reset()
      onClose()
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await save.mutateAsync(values)
    } catch (e) {
      setError(e)
    }
  })
  if (!open) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? 'Edit schedule' : 'Add service schedule'}
      description="Set a distance interval, a time interval, or both."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <Stack component="form" onSubmit={onSubmit} noValidate spacing={2}>
        {error ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        {!isEdit ? (
          <Field label="Vehicle" required error={error?.fieldErrorMap?.vehicleId}>
            <Controller
              control={control}
              name="vehicleId"
              rules={{ required: true }}
              render={({ field }) => (
                <Combobox options={vehicleOptions} value={field.value} onChange={field.onChange} placeholder="Search by plate" />
              )}
            />
          </Field>
        ) : null}
        <Field label="Task" required error={errors.task?.message ?? error?.fieldErrorMap?.task}>
          <SuggestInput suggestions={TASKS} {...register('task', { required: 'Task is required' })} autoFocus />
        </Field>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
          <Field label="Every (km)" error={error?.fieldErrorMap?.intervalKm}>
            <Input type="number" inputMode="numeric" {...register('intervalKm')} trailing="km" />
          </Field>
          <Field label="Every (days)" error={error?.fieldErrorMap?.intervalDays}>
            <Input type="number" inputMode="numeric" {...register('intervalDays')} trailing="days" />
          </Field>
          <Field label="Last service odometer" required error={error?.fieldErrorMap?.lastServiceKm}>
            <Input type="number" inputMode="numeric" {...register('lastServiceKm', { required: true })} trailing="km" />
          </Field>
          <Field label="Last service date" required error={error?.fieldErrorMap?.lastServiceDate}>
            <Input type="date" {...register('lastServiceDate', { required: true })} />
          </Field>
        </Box>
      </Stack>
    </Dialog>
  )
}
