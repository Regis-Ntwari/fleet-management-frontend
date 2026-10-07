import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import BlockIcon from '@mui/icons-material/Block'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery, useVehicleOptions, useDriverOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select, Textarea, Field } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { DateRangePicker } from '@/components/ui/DateRange'
import { EmptyState, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { formatDateTime, formatKm } from '@/utils/format'
import { AssignDriverDialog, EndAssignmentDialog } from './AssignDriverDialog'

export default function AssignmentsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const { can } = useAuth()
  const statuses = useOptions('assignment')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [assignOpen, setAssignOpen] = useState(false)
  const [ending, setEnding] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      vehicleId: state.vehicleId,
      driverId: state.driverId,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['assignments', 'list'], '/assignments', params)

  const columns = [
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      sortKey: 'vehiclePlate',
      render: (a) => <LinkText to={`/vehicles/${a.vehicleId}`}>{a.vehiclePlate}</LinkText>,
    },
    {
      key: 'driverName',
      header: 'Driver',
      sortKey: 'driverName',
      render: (a) => <LinkText to={`/drivers/${a.driverId}`}>{a.driverName}</LinkText>,
    },
    { key: 'startAt', header: 'From', sortKey: 'startAt', render: (a) => formatDateTime(a.startAt) },
    {
      key: 'endAt',
      header: 'To',
      render: (a) =>
        a.endAt ? (
          formatDateTime(a.endAt)
        ) : (
          <Box component="span" sx={{ color: 'text.muted' }}>
            ongoing
          </Box>
        ),
      hideBelow: 'md',
    },
    { key: 'purpose', header: 'Purpose', hideBelow: 'lg' },
    {
      key: 'km',
      header: 'Km driven',
      align: 'right',
      render: (a) => (a.odometerAtEnd != null ? formatKm(a.odometerAtEnd - a.odometerAtStart) : '—'),
      hideBelow: 'sm',
    },
    { key: 'assignedByName', header: 'Assigned by', hideBelow: 'xl' },
    { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="assignment" value={a.status} size="sm" /> },
    can('ASSIGNMENT_MANAGE') && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (a) =>
        a.status === 'ACTIVE' ? (
          <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
            <Button size="xs" variant="ghost" icon={PersonRemoveIcon} onClick={() => setEnding(a)}>
              End
            </Button>
            <Button size="xs" variant="ghost" icon={BlockIcon} onClick={() => setCancelling(a)}>
              Cancel
            </Button>
          </Box>
        ) : null,
    },
  ]

  return (
    <Box>
      <PageHeader
        title="Vehicle assignments"
        description="Which driver holds which vehicle, with full history. Ending an assignment never deletes it."
        actions={
          can('ASSIGNMENT_MANAGE') ? (
            <Button variant="primary" icon={AddIcon} onClick={() => setAssignOpen(true)}>
              Assign driver
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
        searchPlaceholder="Plate, driver, purpose…"
        defaultSort="startAt,desc"
        filters={
          <>
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
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
            <Select
              value={state.driverId ?? ''}
              onChange={(e) => update({ driverId: e.target.value })}
              compact
              placeholder="All drivers"
              aria-label="Driver"
            >
              {drivers.options.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState title="No assignments" description="Assign a driver to a vehicle to get started." compact />}
      />
      <AssignDriverDialog open={assignOpen} onClose={() => setAssignOpen(false)} />
      <EndAssignmentDialog open={Boolean(ending)} onClose={() => setEnding(null)} assignment={ending} />
      <CancelDialog assignment={cancelling} onClose={() => setCancelling(null)} />
    </Box>
  )
}

function CancelDialog({ assignment, onClose }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const cancel = useApiMutation({
    mutationFn: () => http.patch(`/assignments/${assignment.id}/cancel`, { reason }),
    invalidate: [['assignments'], ['vehicles'], ['drivers'], ['dashboard']],
    success: 'Assignment cancelled',
    onSuccess: onClose,
  })
  if (!assignment) return null
  const submit = async () => {
    setError(null)
    try {
      await cancel.mutateAsync()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Cancel assignment"
      description="Use this for assignments created in error. To return a vehicle normally, end the assignment instead."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep
          </Button>
          <Button variant="danger" onClick={submit} loading={cancel.isPending} disabled={!reason.trim()}>
            Cancel assignment
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Reason" required>
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Stack>
    </Dialog>
  )
}
