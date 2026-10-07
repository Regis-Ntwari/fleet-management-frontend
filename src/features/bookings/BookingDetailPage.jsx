import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MuiLink from '@mui/material/Link'
import EditIcon from '@mui/icons-material/Edit'
import CheckIcon from '@mui/icons-material/Check'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import BlockIcon from '@mui/icons-material/Block'
import RouteIcon from '@mui/icons-material/Route'
import PhoneIcon from '@mui/icons-material/Phone'
import MailIcon from '@mui/icons-material/Mail'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList } from '@/components/ui/Display'
import { StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ErrorState, NotFoundInline, Skeleton, InlineAlert, EmptyState, LinkText } from '@/components/ui/Feedback'
import { DataTable } from '@/components/ui/DataTable'
import { formatCurrency, formatDateTime, formatKm } from '@/utils/format'

export default function BookingDetailPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const booking = useQuery({ queryKey: ['bookings', 'detail', id], queryFn: () => http.get(`/bookings/${id}`) })
  const trips = useQuery({
    queryKey: ['trips', 'by-booking', id],
    queryFn: () => http.get('/trips', { params: { q: booking.data.bookingNumber, size: 10 } }),
    enabled: Boolean(booking.data),
  })
  const [assignOpen, setAssignOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [now] = useState(() => Date.now())
  const confirm = useApiMutation({
    mutationFn: () => http.patch(`/bookings/${id}/confirm`),
    invalidate: [['bookings'], ['dashboard'], ['alerts']],
    success: 'Booking confirmed',
  })

  if (booking.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (booking.isError)
    return booking.error.isNotFound ? (
      <NotFoundInline what="booking" backTo="/bookings" backLabel="Back to bookings" />
    ) : (
      <ErrorState error={booking.error} onRetry={booking.refetch} />
    )
  const b = booking.data
  const manage = can('BOOKING_MANAGE')
  const linkedTrips = (trips.data?.content ?? []).filter((t) => t.bookingId === b.id)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={b.bookingNumber}
        breadcrumbs={[{ label: 'Bookings', to: '/bookings' }, { label: b.bookingNumber }]}
        meta={<StatusBadge kind="booking" value={b.status} />}
        description={`${b.company ?? b.customerName} · ${b.serviceType} · ${formatDateTime(b.pickupAt)}`}
        actions={
          manage ? (
            <>
              {b.status === 'REQUESTED' ? (
                <Button variant="primary" icon={CheckIcon} onClick={() => confirm.mutate()} loading={confirm.isPending}>
                  Confirm
                </Button>
              ) : null}
              {['REQUESTED', 'CONFIRMED'].includes(b.status) ? (
                <Button
                  variant={b.status === 'CONFIRMED' ? 'primary' : 'secondary'}
                  icon={PersonAddIcon}
                  onClick={() => setAssignOpen(true)}
                >
                  Assign vehicle
                </Button>
              ) : null}
              {b.status === 'ASSIGNED' ? (
                <Button icon={PersonAddIcon} onClick={() => setAssignOpen(true)}>
                  Reassign
                </Button>
              ) : null}
              {['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(b.status) ? (
                <Button icon={EditIcon} to={`/bookings/${b.id}/edit`}>
                  Edit
                </Button>
              ) : null}
              {['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(b.status) ? (
                <Button variant="danger-soft" icon={BlockIcon} onClick={() => setCancelOpen(true)}>
                  Cancel
                </Button>
              ) : null}
            </>
          ) : null
        }
      />
      {['REQUESTED', 'CONFIRMED'].includes(b.status) && new Date(b.pickupAt) - now < 24 * 3600_000 && new Date(b.pickupAt) > now ? (
        <InlineAlert tone="warning" title="Pickup is within 24 hours and no vehicle is assigned">
          Assign a vehicle and driver now to avoid a missed pickup.
        </InlineAlert>
      ) : null}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { xl: 'span 2' } }}>
          <CardHeader title="Booking details" />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Customer', value: b.customerName },
                { label: 'Company', value: b.company },
                {
                  label: 'Contact',
                  value: (
                    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                      <MuiLink href={`tel:${b.contactPhone}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <PhoneIcon sx={{ fontSize: 14 }} aria-hidden />
                        {b.contactPhone}
                      </MuiLink>
                      {b.contactEmail ? (
                        <MuiLink href={`mailto:${b.contactEmail}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <MailIcon sx={{ fontSize: 14 }} aria-hidden />
                          {b.contactEmail}
                        </MuiLink>
                      ) : null}
                    </Box>
                  ),
                },
                { label: 'Service', value: b.serviceType },
                { label: 'Requested category', value: b.requestedCategoryName },
                { label: 'Passengers', value: b.passengers },
                { label: 'Pickup', value: `${formatDateTime(b.pickupAt)} · ${b.pickupLocation}`, span: 2 },
                { label: 'Return', value: `${formatDateTime(b.returnAt)} · ${b.dropoffLocation}` },
                { label: 'Quoted amount', value: formatCurrency(b.quotedAmount) },
                { label: 'Created', value: formatDateTime(b.createdAt) },
                { label: 'Last updated', value: formatDateTime(b.updatedAt) },
                b.notes && { label: 'Notes', value: b.notes, span: 'full' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Assignment" compact />
          <CardBody sx={{ p: 2 }}>
            {b.vehicleId ? (
              <DescriptionList
                columns={1}
                items={[
                  {
                    label: 'Vehicle',
                    value: <LinkText to={`/vehicles/${b.vehicleId}`}>{b.vehiclePlate}</LinkText>,
                  },
                  {
                    label: 'Driver',
                    value: <LinkText to={`/drivers/${b.driverId}`}>{b.driverName}</LinkText>,
                  },
                ]}
              />
            ) : (
              <Typography sx={{ fontSize: 13, color: 'text.muted' }}>No vehicle or driver assigned yet.</Typography>
            )}
          </CardBody>
        </Card>
      </Box>
      <Card>
        <CardHeader
          title="Trips"
          description="Trips carrying this booking"
          actions={
            manage && !linkedTrips.length && ['CONFIRMED', 'ASSIGNED'].includes(b.status) ? (
              <Button size="xs" variant="ghost" icon={RouteIcon} to={`/trips/new?bookingId=${b.id}`}>
                Plan trip manually
              </Button>
            ) : null
          }
        />
        <DataTable
          stickyHeader={false}
          isLoading={trips.isLoading}
          rows={linkedTrips}
          columns={[
            {
              key: 'tripNumber',
              header: 'Trip',
              render: (t) => <LinkText to={`/trips/${t.id}`}>{t.tripNumber}</LinkText>,
            },
            { key: 'scheduledStartAt', header: 'Scheduled', render: (t) => formatDateTime(t.scheduledStartAt) },
            { key: 'vehiclePlate', header: 'Vehicle' },
            { key: 'driverName', header: 'Driver', hideBelow: 'md' },
            { key: 'distanceKm', header: 'Distance', align: 'right', render: (t) => formatKm(t.distanceKm) },
            { key: 'status', header: 'Status', render: (t) => <StatusBadge kind="trip" value={t.status} size="sm" /> },
          ]}
          empty={
            <EmptyState icon={RouteIcon} title="No trip yet" description="Assigning a vehicle creates the trip automatically." compact />
          }
        />
      </Card>
      <AssignDialog booking={b} open={assignOpen} onClose={() => setAssignOpen(false)} />
      <CancelDialog booking={b} open={cancelOpen} onClose={() => setCancelOpen(false)} />
    </Stack>
  )
}

function AssignDialog({ booking, open, onClose }) {
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [vehicleId, setVehicleId] = useState(booking.vehicleId ?? null)
  const [driverId, setDriverId] = useState(booking.driverId ?? null)
  const [error, setError] = useState(null)
  const assign = useApiMutation({
    mutationFn: (body) => http.patch(`/bookings/${booking.id}/assign`, body),
    invalidate: [['bookings'], ['trips'], ['vehicles'], ['dashboard'], ['dispatch'], ['alerts']],
    success: 'Vehicle and driver assigned',
    onSuccess: onClose,
  })
  const suitable = useMemo(
    () =>
      vehicles.options
        .map((o) => ({
          ...o,
          disabled: ['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE'].includes(o.meta.status),
          description: `${o.description}${o.meta.categoryId === booking.requestedCategoryId ? ' · requested category' : ''}`,
        }))
        .sort(
          (a, b) =>
            (a.meta.categoryId === booking.requestedCategoryId ? -1 : 0) - (b.meta.categoryId === booking.requestedCategoryId ? -1 : 0),
        ),
    [vehicles.options, booking.requestedCategoryId],
  )
  // Suggest the vehicle's current driver.
  const suggestDriver = (vId) => {
    setVehicleId(vId)
    const d = drivers.options.find((o) => o.meta.currentVehicleId === vId)
    if (d) setDriverId(d.value)
  }
  const submit = async () => {
    setError(null)
    try {
      await assign.mutateAsync({ vehicleId, driverId })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign vehicle & driver"
      description={`${booking.requestedCategoryName} requested for ${booking.passengers} passenger${booking.passengers === 1 ? '' : 's'}. Overlapping bookings, expired documents and licences are rejected.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={assign.isPending} disabled={!vehicleId || !driverId}>
            Assign
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        <Field label="Vehicle" required>
          <Combobox
            options={suitable}
            value={vehicleId}
            onChange={suggestDriver}
            loading={vehicles.isLoading}
            placeholder="Search by plate or model"
          />
        </Field>
        <Field label="Driver" required>
          <Combobox
            options={drivers.options}
            value={driverId}
            onChange={setDriverId}
            loading={drivers.isLoading}
            placeholder="Search by name"
          />
        </Field>
      </Stack>
    </Dialog>
  )
}

function CancelDialog({ booking, open, onClose }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const cancel = useApiMutation({
    mutationFn: () => http.patch(`/bookings/${booking.id}/cancel`, { reason }),
    invalidate: [['bookings'], ['trips'], ['vehicles'], ['dashboard'], ['dispatch'], ['alerts']],
    success: 'Booking cancelled',
    onSuccess: onClose,
  })
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
      open={open}
      onClose={onClose}
      title={`Cancel ${booking.bookingNumber}?`}
      description="Linked planned trips are cancelled too. The booking stays on record."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep booking
          </Button>
          <Button variant="danger" onClick={submit} loading={cancel.isPending} disabled={!reason.trim()}>
            Cancel booking
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Reason" required>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Stack>
    </Dialog>
  )
}
