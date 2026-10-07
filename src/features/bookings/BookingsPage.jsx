import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useCategoryOptions, useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { DateRangePicker } from '@/components/ui/DateRange'
import { EmptyState } from '@/components/ui/Feedback'
import { formatCurrency, formatDateTime } from '@/utils/format'

export default function BookingsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('booking')
  const categories = useCategoryOptions()
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      categoryId: state.categoryId,
      upcoming: state.upcoming,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['bookings', 'list'], '/bookings', params)
  const columns = [
    {
      key: 'bookingNumber',
      header: 'Booking',
      sortKey: 'bookingNumber',
      render: (b) => (
        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {b.bookingNumber}
        </Box>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortKey: 'customerName',
      render: (b) => (
        <span>
          <Box component="span" sx={{ display: 'block' }}>
            {b.company ?? b.customerName}
          </Box>
          {b.company ? (
            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
              {b.customerName}
            </Box>
          ) : null}
        </span>
      ),
    },
    {
      key: 'pickupAt',
      header: 'Pickup',
      sortKey: 'pickupAt',
      render: (b) => (
        <span>
          <Box component="span" sx={{ display: 'block' }}>
            {formatDateTime(b.pickupAt)}
          </Box>
          <Box
            component="span"
            sx={{
              display: 'block',
              maxWidth: 220,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: 12,
              color: 'text.muted',
            }}
          >
            {b.pickupLocation}
          </Box>
        </span>
      ),
    },
    { key: 'requestedCategoryName', header: 'Requested', hideBelow: 'md' },
    {
      key: 'vehiclePlate',
      header: 'Assigned',
      render: (b) =>
        b.vehiclePlate ? (
          <span>
            {b.vehiclePlate}
            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
              {b.driverName}
            </Box>
          </span>
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            Not assigned
          </Box>
        ),
      hideBelow: 'lg',
    },
    { key: 'serviceType', header: 'Service', hideBelow: 'xl' },
    { key: 'quotedAmount', header: 'Quote', align: 'right', render: (b) => formatCurrency(b.quotedAmount), hideBelow: 'sm' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (b) => <StatusBadge kind="booking" value={b.status} size="sm" /> },
  ]
  return (
    <Box>
      <PageHeader
        title="Bookings"
        description="Customer reservations from request to completion. Assigning a booking creates its trip and checks for conflicts."
        actions={
          <Can permission="BOOKING_MANAGE">
            <Button variant="primary" icon={AddIcon} to="/bookings/new">
              New booking
            </Button>
          </Can>
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Booking no., customer, company, place…"
        onRowClick={(b) => navigate(`/bookings/${b.id}`)}
        defaultSort="pickupAt,desc"
        filters={
          <>
            <SegmentedControl
              label="Window"
              value={state.upcoming ?? ''}
              onChange={(v) => update({ upcoming: v })}
              options={[
                { value: '', label: 'All' },
                { value: 'true', label: 'Upcoming' },
              ]}
            />
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
              value={state.categoryId ?? ''}
              onChange={(e) => update({ categoryId: e.target.value })}
              compact
              placeholder="Any category"
              aria-label="Category"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState title="No bookings match" compact />}
      />
    </Box>
  )
}
