import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import BlockIcon from '@mui/icons-material/Block'
import SendIcon from '@mui/icons-material/Send'
import UndoIcon from '@mui/icons-material/Undo'
import PlaceIcon from '@mui/icons-material/Place'
import ScheduleIcon from '@mui/icons-material/Schedule'
import SpeedIcon from '@mui/icons-material/Speed'
import PaymentsIcon from '@mui/icons-material/Payments'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import MapIcon from '@mui/icons-material/Map'
import PrintIcon from '@mui/icons-material/Print'
import EventIcon from '@mui/icons-material/Event'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList, Timeline } from '@/components/ui/Display'
import { StatusBadge, ToneBadge } from '@/components/ui/Badge'
import { Dropdown } from '@/components/ui/Dropdown'
import { ErrorState, LinkText, NotFoundInline, Skeleton, InlineAlert } from '@/components/ui/Feedback'
import { DeploymentTransitionDialog } from './DeploymentTransitionDialog'
import { ReplaceDeploymentDialog } from './ReplaceDeploymentDialog'
import { Stat, StatGrid } from '@/components/ui/Stat'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatKm,
  formatNumber,
  formatSmartDateTime,
  humanize,
} from '@/utils/format'

export default function DeploymentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can, user } = useAuth()
  const deployment = useQuery({ queryKey: ['deployments', 'detail', id], queryFn: () => http.get(`/deployments/${id}`) })
  const [dialog, setDialog] = useState(null)
  const [replacing, setReplacing] = useState(false)
  const vehicle = useQuery({
    queryKey: ['vehicles', 'detail', String(deployment.data?.vehicleId)],
    queryFn: () => http.get(`/vehicles/${deployment.data.vehicleId}`),
    enabled: Boolean(deployment.data) && can('VEHICLE_READ'),
  })
  const generate = useApiMutation({
    mutationFn: () => http.post(`/deployments/${id}/road-map`),
    invalidate: [['deployments']],
    success: (r) => `Road map ${r.number} generated`,
    onSuccess: () => navigate(`/deployments/${id}/road-map?autoprint=1`),
  })

  if (deployment.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (deployment.isError)
    return deployment.error.isNotFound ? (
      <NotFoundInline what="deployment" backTo="/deployments" backLabel="Back to deployments" />
    ) : (
      <ErrorState error={deployment.error} onRetry={deployment.refetch} />
    )
  const t = deployment.data
  const manage = can('DEPLOYMENT_MANAGE')
  const gate = !manage && can('GATE_RECORD')
  // A driver account only departs and returns on the deployments it is driving.
  const drives = !manage && !gate && can('DEPLOYMENT_START') && user?.driverId != null && t.driverId === user.driverId
  const actions = []
  if (drives || gate) {
    if (t.status === 'DISPATCHED')
      actions.push(
        <Button key="s" variant="primary" icon={PlayArrowIcon} onClick={() => setDialog('IN_PROGRESS')}>
          Record departure
        </Button>,
      )
    if (t.status === 'IN_PROGRESS')
      actions.push(
        <Button key="c" variant="primary" icon={StopIcon} onClick={() => setDialog('COMPLETED')}>
          Record return
        </Button>,
      )
  }
  if (manage) {
    if (t.status === 'PLANNED')
      actions.push(
        <Button key="d" variant="primary" icon={SendIcon} onClick={() => setDialog('DISPATCHED')}>
          Dispatch
        </Button>,
      )
    if (t.status === 'DISPATCHED')
      actions.push(
        <Button key="s" variant="primary" icon={PlayArrowIcon} onClick={() => setDialog('IN_PROGRESS')}>
          Record departure
        </Button>,
        <Button key="u" icon={UndoIcon} onClick={() => setDialog('PLANNED')}>
          Back to planned
        </Button>,
      )
    if (t.status === 'IN_PROGRESS')
      actions.push(
        <Button key="c" variant="primary" icon={StopIcon} onClick={() => setDialog('COMPLETED')}>
          Record return
        </Button>,
      )
    if (['DISPATCHED', 'IN_PROGRESS'].includes(t.status))
      actions.push(
        <Button key="r" icon={SwapHorizIcon} onClick={() => setReplacing(true)}>
          Replace vehicle
        </Button>,
      )
    if (['PLANNED', 'DISPATCHED'].includes(t.status))
      actions.push(
        <Button key="e" icon={EditIcon} to={`/deployments/${t.id}/edit`}>
          Edit
        </Button>,
        <Button key="x" variant="danger-soft" icon={BlockIcon} onClick={() => setDialog('CANCELLED')}>
          Cancel
        </Button>,
      )
  }
  if (!['PLANNED', 'CANCELLED'].includes(t.status) && (manage || can('DEPLOYMENT_READ') || drives))
    actions.push(
      t.roadMapCount > 0 ? (
        <Dropdown
          key="rm"
          trigger={
            <Button icon={MapIcon} variant="secondary">
              Road map
            </Button>
          }
          items={[
            { label: `Open latest (copy ${t.roadMapCount})`, icon: MapIcon, to: `/deployments/${t.id}/road-map` },
            ...(manage || can('DEPLOYMENT_READ')
              ? [{ label: 'Generate new copy', icon: PrintIcon, onSelect: () => generate.mutate(), hint: 'Recorded on the deployment' }]
              : []),
          ]}
        />
      ) : (
        <Button key="rm" icon={MapIcon} variant="secondary" onClick={() => generate.mutate()} loading={generate.isPending}>
          Generate road map
        </Button>
      ),
    )

  const timeline = [
    { id: 'created', at: t.createdAt, title: `Registered as ${t.deploymentNumber}`, tone: 'neutral' },
    t.replacesNumber && {
      id: 'replaces',
      at: t.createdAt,
      title: `Replaces ${t.replacesNumber}`,
      description: t.notes,
      tone: 'info',
      icon: SwapHorizIcon,
    },
    t.startedAt && {
      id: 'started',
      at: t.startedAt,
      title: `Departed at ${formatKm(t.startOdometer)}`,
      description: t.departureRecordedBy ? `Recorded at the gate by ${t.departureRecordedBy.name}` : 'Recorded by the driver',
      tone: 'accent',
      icon: PlayArrowIcon,
    },
    t.endedAt && {
      id: 'ended',
      at: t.endedAt,
      title: `Returned at ${formatKm(t.endOdometer)}`,
      description: `${formatKm(t.distanceKm)} · ${formatDuration(t.durationMinutes)}${t.returnRecordedBy ? ` · recorded by ${t.returnRecordedBy.name}` : ''}`,
      tone: 'success',
      icon: StopIcon,
    },
    t.status === 'REPLACED' && {
      id: 'replaced',
      at: t.updatedAt,
      title: `Replaced by ${t.replacedByNumber}`,
      description: t.replaceReason,
      tone: 'warning',
      icon: SwapHorizIcon,
    },
    t.status === 'CANCELLED' && {
      id: 'cancelled',
      at: t.updatedAt,
      title: 'Deployment cancelled',
      description: t.notes,
      tone: 'danger',
      icon: BlockIcon,
    },
  ].filter(Boolean)

  const lpoLink = can('ORDER_READ') || can('ORDER_MANAGE')
  const backTo = can('DEPLOYMENT_READ')
    ? { label: 'Deployments', to: '/deployments' }
    : gate
      ? { label: 'Gate', to: '/gate' }
      : { label: 'My trips', to: '/my-trips' }

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={t.deploymentNumber}
        breadcrumbs={[backTo, { label: t.deploymentNumber }]}
        meta={
          <>
            <StatusBadge kind="deployment" value={t.status} />
            <ToneBadge value={t.owner === 'SUBCONTRACTOR' ? 'SUBCONTRACTOR' : t.owner} size="sm" />
          </>
        }
        description={`${t.institution ?? 'No institution'}${t.lpoNumber ? ` · LPO ${t.lpoNumber}` : ''} · ${t.startLocation} → ${t.destination}`}
        actions={actions}
      />
      {t.status === 'IN_PROGRESS' ? (
        <InlineAlert tone="info" title="Vehicle out">
          Departed {formatSmartDateTime(t.startedAt)} at {formatKm(t.startOdometer)}. Record the return to capture the final odometer
          reading.
        </InlineAlert>
      ) : null}
      {t.status === 'REPLACED' ? (
        <InlineAlert tone="warning" title={`Replaced by ${t.replacedByNumber}`}>
          {t.replaceReason} <LinkText to={`/deployments/${t.replacedById}`}>Open the replacement</LinkText>.
        </InlineAlert>
      ) : null}
      {!t.purchaseOrderId && manage ? (
        <InlineAlert tone="warning" title="No purchase order linked">
          This deployment was created from a booking. Edit it to link the institution's LPO before dispatch.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="Amount"
          value={formatCurrency(t.amount)}
          icon={PaymentsIcon}
          hint={
            t.tariffCode
              ? `${t.tariffCode} · ${formatCurrency(t.tariffRate)} × ${t.effectiveDays} day${t.effectiveDays === 1 ? '' : 's'}`
              : 'No tariff category'
          }
        />
        <Stat
          label="Effective days"
          value={t.effectiveDays}
          icon={EventIcon}
          hint={`${formatDate(t.scheduledStartAt)} → ${formatDate(t.scheduledEndAt)}`}
        />
        <Stat
          label="Distance"
          value={t.distanceKm != null ? formatNumber(t.distanceKm) : '—'}
          unit="km"
          icon={SpeedIcon}
          hint={
            t.startOdometer != null
              ? `${formatKm(t.startOdometer)} → ${t.endOdometer != null ? formatKm(t.endOdometer) : '…'}`
              : 'Recorded at the gate'
          }
        />
        <Stat
          label="Duration"
          value={formatDuration(t.durationMinutes)}
          icon={ScheduleIcon}
          hint={t.startedAt ? `Departed ${formatSmartDateTime(t.startedAt)}` : `Scheduled ${formatSmartDateTime(t.scheduledStartAt)}`}
        />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
          <Card>
            <CardHeader title="Order" description="Institution and purchase order the deployment is billed against." />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Company', value: t.companyName ? `${t.companyName} · series ${t.series}` : null },
                  { label: 'Institution', value: t.institution },
                  {
                    label: 'Purchase order',
                    value: t.purchaseOrderId ? (
                      lpoLink ? (
                        <LinkText to={`/commerce/${t.purchaseOrderId}`}>{t.lpoNumber}</LinkText>
                      ) : (
                        t.lpoNumber
                      )
                    ) : null,
                  },
                  { label: 'LPO date', value: t.lpoDate ? formatDate(t.lpoDate) : null },
                  { label: 'LPO amount', value: t.lpoAmount != null ? formatCurrency(t.lpoAmount) : null },
                  {
                    label: 'Vehicle category',
                    value: t.tariffCode ? `${t.tariffCode} · ${t.tariffName} · ${formatCurrency(t.tariffRate)}/day` : null,
                  },
                  {
                    label: 'Vehicle owner',
                    value: t.owner === 'SUBCONTRACTOR' ? `Subcontractor · ${t.ownerName ?? ''}`.trim() : humanize(t.owner),
                  },
                  t.owner === 'SUBCONTRACTOR'
                    ? { label: 'Owner amount', value: t.ownerAmount != null ? formatCurrency(t.ownerAmount) : null }
                    : { label: 'Driver mission', value: t.driverMission != null ? formatCurrency(t.driverMission) : null },
                  { label: 'Purpose', value: t.purpose },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Movement" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Vehicle',
                    value: can('VEHICLE_READ') ? <LinkText to={`/vehicles/${t.vehicleId}`}>{t.vehiclePlate}</LinkText> : t.vehiclePlate,
                  },
                  {
                    label: 'Driver',
                    value: can('DRIVER_READ') ? <LinkText to={`/drivers/${t.driverId}`}>{t.driverName}</LinkText> : t.driverName,
                  },
                  {
                    label: 'Booking',
                    value: t.bookingId ? <LinkText to={`/bookings/${t.bookingId}`}>{t.bookingNumber}</LinkText> : 'None',
                  },
                  { label: 'Scheduled start', value: formatDateTime(t.scheduledStartAt) },
                  { label: 'Departed', value: t.startedAt ? formatDateTime(t.startedAt) : null },
                  { label: 'Returned', value: t.endedAt ? formatDateTime(t.endedAt) : null },
                  {
                    label: 'From',
                    value: (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <PlaceIcon sx={{ fontSize: 14, color: 'text.muted' }} aria-hidden />
                        {t.startLocation}
                      </Box>
                    ),
                  },
                  {
                    label: 'Destination',
                    value: (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        <PlaceIcon sx={{ fontSize: 14, color: 'text.muted' }} aria-hidden />
                        {t.destination}
                      </Box>
                    ),
                  },
                  { label: 'Passengers', value: t.passengers },
                  { label: 'Fuel used', value: t.fuelUsedLitres != null ? `${t.fuelUsedLitres} L` : null },
                  { label: 'Max speed', value: t.maxSpeedKph ? `${t.maxSpeedKph} km/h` : null },
                  { label: 'Road maps', value: t.roadMapCount ? `${t.roadMapCount} generated` : 'Not generated' },
                  t.notes && { label: 'Notes', value: t.notes, span: 'full' },
                ]}
              />
            </CardBody>
          </Card>
        </Stack>
        <Card>
          <CardHeader title="Timeline" />
          <CardBody>
            <Timeline items={timeline} renderTime={formatSmartDateTime} />
          </CardBody>
        </Card>
      </Box>
      {drives && t.status === 'PLANNED' ? (
        <InlineAlert tone="info" title="Waiting for dispatch">
          The office has not dispatched this deployment yet. You will be able to record the departure once it is dispatched.
        </InlineAlert>
      ) : null}
      <DeploymentTransitionDialog
        deployment={t}
        status={dialog}
        vehicle={vehicle.data}
        onClose={() => setDialog(null)}
        onDone={() => {
          deployment.refetch()
          if (dialog === 'CANCELLED') navigate(`/deployments/${t.id}`)
        }}
      />
      <ReplaceDeploymentDialog
        deployment={t}
        open={replacing}
        onClose={() => setReplacing(false)}
        onDone={(r) => navigate(`/deployments/${r.replacement.id}`)}
      />
    </Stack>
  )
}
