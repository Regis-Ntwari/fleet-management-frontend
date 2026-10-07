import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, Dash, StatusBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { formatDate, humanize } from '@/utils/format'

export function LicenceBadge({ expiry }) {
  const days = Math.ceil((new Date(expiry) - new Date()) / 86_400_000)
  if (days < 0)
    return (
      <Badge tone="danger" size="sm" dot>
        Expired {formatDate(expiry)}
      </Badge>
    )
  if (days <= 30)
    return (
      <Badge tone="warning" size="sm" dot>
        Expires in {days} d
      </Badge>
    )
  return (
    <Box component="span" sx={{ color: 'text.secondary' }}>
      {formatDate(expiry)}
    </Box>
  )
}

export default function DriversPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('driver')
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      employmentStatus: state.employmentStatus,
      licenseValid: state.licenseValid,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['drivers', 'list'], '/drivers', params)

  const columns = [
    {
      key: 'fullName',
      header: 'Driver',
      sortKey: 'fullName',
      render: (d) => (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar name={d.fullName} size="sm" />
          <Box component="span">
            <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
              {d.fullName}
            </Box>
            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
              {d.employeeNumber}
            </Box>
          </Box>
        </Box>
      ),
    },
    { key: 'phone', header: 'Phone', sx: { fontVariantNumeric: 'tabular-nums' }, hideBelow: 'md' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (d) => <StatusBadge kind="driver" value={d.status} size="sm" /> },
    {
      key: 'currentVehiclePlate',
      header: 'Vehicle',
      render: (d) => d.currentVehiclePlate ?? <Dash />,
      hideBelow: 'sm',
    },
    {
      key: 'licenseExpiry',
      header: 'Licence expiry',
      sortKey: 'licenseExpiry',
      render: (d) => <LicenceBadge expiry={d.licenseExpiry} />,
      hideBelow: 'lg',
    },
  ]

  return (
    <Box>
      <PageHeader
        title="Drivers"
        description="Driver roster with licence validity, current vehicle and availability."
        actions={
          <Can permission="DRIVER_MANAGE">
            <Button variant="primary" icon={AddIcon} to="/drivers/new">
              Add driver
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
        searchPlaceholder="Name, employee no., phone, licence…"
        onRowClick={(d) => navigate(`/drivers/${d.id}`)}
        defaultSort="fullName,asc"
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
              value={state.employmentStatus ?? ''}
              onChange={(e) => update({ employmentStatus: e.target.value })}
              compact
              placeholder="Any employment"
              aria-label="Employment"
            >
              {['FULL_TIME', 'CONTRACT', 'CASUAL'].map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
            <Select
              value={state.licenseValid ?? ''}
              onChange={(e) => update({ licenseValid: e.target.value })}
              compact
              placeholder="Any licence"
              aria-label="Licence"
            >
              <option value="false">Expired licence</option>
            </Select>
          </>
        }
        empty={<EmptyState title="No drivers found" description="Try a different search or clear the filters." compact />}
      />
    </Box>
  )
}
