import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import ReplayIcon from '@mui/icons-material/Replay'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import WifiIcon from '@mui/icons-material/Wifi'
import { http, isMockApi } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useTheme } from '@/app/ThemeProvider'
import { useReference, useStatusMeta } from '@/app/ReferenceProvider'
import { changePasswordSchema } from '@/auth/schemas'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Tabs, useActiveTab, SegmentedControl } from '@/components/ui/Tabs'
import { Card, CardBody, CardHeader, CardFooter } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, Textarea, Switch } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { DescriptionList } from '@/components/ui/Display'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Badge'
import { InlineAlert, Skeleton } from '@/components/ui/Feedback'
import { Avatar } from '@/components/ui/Avatar'
import { useToast } from '@/components/ui/Toast'
import { isMockOffline, setMockOffline } from '@/api/mock'

const mono = (t) => t.typography.fontFamilyMono

const TABS = [
  { key: 'profile', label: 'My profile' },
  { key: 'thresholds', label: 'Operational thresholds' },
  { key: 'categories', label: 'Vehicle categories' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'system', label: 'System' },
]

export default function SettingsPage() {
  const { can } = useAuth()
  const tabs = TABS.filter((t) =>
    ['thresholds', 'categories', 'system'].includes(t.key) ? can('SETTINGS_MANAGE') || t.key !== 'system' : true,
  )
  const tab = useActiveTab('tab', tabs)
  return (
    <Box>
      <PageHeader title="Settings" description="Personal preferences and the operational rules that drive alerts and validation." />
      <Tabs tabs={tabs} param="tab" sx={{ mb: 2.5 }} />
      {tab === 'profile' ? <ProfileTab /> : null}
      {tab === 'thresholds' ? <ThresholdsTab /> : null}
      {tab === 'categories' ? <CategoriesTab /> : null}
      {tab === 'appearance' ? <AppearanceTab /> : null}
      {tab === 'system' ? <SystemTab /> : null}
    </Box>
  )
}

function ProfileTab() {
  const { user } = useAuth()
  const roleMeta = useStatusMeta('role', user.role)
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => http.get('/auth/me') })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(changePasswordSchema), defaultValues: { currentPassword: '', newPassword: '', confirm: '' } })
  const change = useApiMutation({
    mutationFn: (v) => http.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword }),
    success: 'Password changed',
    setError,
    onSuccess: () => reset(),
  })
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { lg: 'repeat(2, minmax(0, 1fr))' } }}>
      <Card>
        <CardHeader title="Account" />
        <CardBody>
          <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar name={user.name} size="xl" />
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 600, color: 'text.primary' }}>{user.name}</Typography>
              <Typography sx={{ fontSize: 13, color: 'text.muted' }}>{user.email}</Typography>
            </Box>
          </Box>
          {me.isLoading ? (
            <Skeleton height={96} />
          ) : (
            <DescriptionList
              items={[
                { label: 'Role', value: roleMeta?.label ?? user.role },
                { label: 'Phone', value: me.data?.profile?.phone },
                {
                  label: 'Permissions',
                  value: (
                    <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {user.permissions.map((p) => (
                        <Badge key={p} size="sm" tone="neutral">
                          {p.toLowerCase().replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </Box>
                  ),
                  span: 2,
                },
              ]}
            />
          )}
          <Typography sx={{ mt: 2, fontSize: 12.5, color: 'text.muted' }}>
            Name, email and role are managed by an IT administrator under Users.
          </Typography>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <Box component="form" onSubmit={handleSubmit((v) => change.mutate(v))} noValidate>
          <CardBody sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Field label="Current password" required error={errors.currentPassword?.message}>
              <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
            </Field>
            <Field label="New password" required error={errors.newPassword?.message} hint="At least 10 characters.">
              <Input type="password" autoComplete="new-password" {...register('newPassword')} />
            </Field>
            <Field label="Confirm new password" required error={errors.confirm?.message}>
              <Input type="password" autoComplete="new-password" {...register('confirm')} />
            </Field>
          </CardBody>
          <CardFooter>
            <span />
            <Button type="submit" variant="primary" loading={change.isPending}>
              Update password
            </Button>
          </CardFooter>
        </Box>
      </Card>
    </Box>
  )
}

function Row({ label, hint, children }) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1,
        borderBottom: 1,
        borderColor: 'divider',
        py: 2,
        gridTemplateColumns: { sm: '1fr 220px' },
        alignItems: { sm: 'center' },
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>{label}</Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>{hint}</Typography>
      </Box>
      {children}
    </Box>
  )
}

function ThresholdsTab() {
  const { can } = useAuth()
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => http.get('/settings') })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({ defaultValues: settings.data ?? {} })
  useEffect(() => {
    if (settings.data) reset({ ...settings.data, documentExpiryWarningDays: settings.data.documentExpiryWarningDays.join(', ') })
  }, [settings.data, reset])
  const save = useApiMutation({
    mutationFn: (v) =>
      http.put('/settings', {
        ...v,
        documentExpiryWarningDays: String(v.documentExpiryWarningDays)
          .split(/[,\s]+/)
          .filter(Boolean)
          .map(Number),
        excessiveDailyDrivingHours: Number(v.excessiveDailyDrivingHours),
        highDailyDistanceKm: Number(v.highDailyDistanceKm),
        fuelVarianceTolerancePercent: Number(v.fuelVarianceTolerancePercent),
        maintenanceDueSoonKm: Number(v.maintenanceDueSoonKm),
        maintenanceDueSoonDays: Number(v.maintenanceDueSoonDays),
        gpsOfflineThresholdMinutes: Number(v.gpsOfflineThresholdMinutes),
        idleVehicleDays: Number(v.idleVehicleDays),
      }),
    invalidate: [['settings'], ['alerts'], ['dashboard'], ['vehicles'], ['maintenance'], ['documents'], ['fuel']],
    success: 'Thresholds saved',
    setError,
  })
  const readOnly = !can('SETTINGS_MANAGE')
  if (settings.isLoading) return <Skeleton height={384} />
  const e = (k) => errors[k]?.message
  return (
    <Box component="form" onSubmit={handleSubmit((v) => save.mutate(v))} noValidate>
      {readOnly ? (
        <InlineAlert tone="info" sx={{ mb: 2 }}>
          You can view thresholds but only a fleet manager or administrator can change them.
        </InlineAlert>
      ) : null}
      <Card>
        <CardHeader title="Movement & driving" description="Used by the daily position screen and vehicle movement report." />
        <CardBody sx={{ py: 0 }}>
          <Row label="Night driving window" hint="Trips starting or ending inside this window are flagged.">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <Field error={e('nightDrivingStart')}>
                <Input type="time" {...register('nightDrivingStart')} disabled={readOnly} />
              </Field>
              <Field error={e('nightDrivingEnd')}>
                <Input type="time" {...register('nightDrivingEnd')} disabled={readOnly} />
              </Field>
            </Box>
          </Row>
          <Row label="Excessive daily driving" hint="Hours of driving in one day before a vehicle is flagged.">
            <Field error={e('excessiveDailyDrivingHours')}>
              <Input type="number" inputMode="numeric" {...register('excessiveDailyDrivingHours')} trailing="hours" disabled={readOnly} />
            </Field>
          </Row>
          <Row label="High daily distance" hint="Kilometres in one day before a vehicle is flagged.">
            <Field error={e('highDailyDistanceKm')}>
              <Input type="number" inputMode="numeric" {...register('highDailyDistanceKm')} trailing="km" disabled={readOnly} />
            </Field>
          </Row>
          <Row label="Idle vehicle" hint="Days without movement before an idle alert is raised.">
            <Field error={e('idleVehicleDays')}>
              <Input type="number" inputMode="numeric" {...register('idleVehicleDays')} trailing="days" disabled={readOnly} />
            </Field>
          </Row>
          <Row label="GPS offline" hint="Minutes without a telematics report before a critical alert.">
            <Field error={e('gpsOfflineThresholdMinutes')}>
              <Input type="number" inputMode="numeric" {...register('gpsOfflineThresholdMinutes')} trailing="min" disabled={readOnly} />
            </Field>
          </Row>
        </CardBody>
      </Card>
      <Card sx={{ mt: 2 }}>
        <CardHeader title="Maintenance, fuel & documents" />
        <CardBody sx={{ py: 0 }}>
          <Row label="Service due soon" hint="Distance and time before a scheduled service counts as due soon.">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <Field error={e('maintenanceDueSoonKm')}>
                <Input type="number" inputMode="numeric" {...register('maintenanceDueSoonKm')} trailing="km" disabled={readOnly} />
              </Field>
              <Field error={e('maintenanceDueSoonDays')}>
                <Input type="number" inputMode="numeric" {...register('maintenanceDueSoonDays')} trailing="days" disabled={readOnly} />
              </Field>
            </Box>
          </Row>
          <Row label="Fuel variance tolerance" hint="Consumption deviation from the class average before a fill is flagged.">
            <Field error={e('fuelVarianceTolerancePercent')}>
              <Input type="number" inputMode="numeric" {...register('fuelVarianceTolerancePercent')} trailing="%" disabled={readOnly} />
            </Field>
          </Row>
          <Row label="Document expiry warnings" hint="Days before expiry at which warnings are raised, comma separated.">
            <Field error={e('documentExpiryWarningDays')}>
              <Input {...register('documentExpiryWarningDays')} placeholder="30, 15, 7" disabled={readOnly} />
            </Field>
          </Row>
          <Row label="Timezone & currency" hint="Display and business-day calculations.">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
              <Input {...register('timezone')} disabled />
              <Input {...register('currency')} disabled />
            </Box>
          </Row>
        </CardBody>
        {!readOnly ? (
          <CardFooter>
            <Box component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
              {isDirty ? 'Unsaved changes' : 'All changes saved'}
            </Box>
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!isDirty}>
              Save thresholds
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </Box>
  )
}

function CategoriesTab() {
  const { can } = useAuth()
  const { data, isLoading, refetch } = useReference()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const manage = can('SETTINGS_MANAGE')
  const invalidate = [['reference'], ['vehicles']]
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/vehicle-categories/${id}`),
    invalidate,
    success: 'Category deleted',
    onSuccess: () => {
      setDeleting(null)
      refetch()
    },
  })
  const toggle = useApiMutation({
    mutationFn: (c) => http.put(`/vehicle-categories/${c.id}`, { active: !c.active }),
    invalidate,
    onSuccess: () => {
      refetch()
      queryClient.invalidateQueries({ queryKey: ['reference'] })
    },
  })
  return (
    <Card>
      <CardHeader
        title="Vehicle categories"
        description="Configured here rather than in code. Inactive categories stay on historical records."
        actions={
          manage ? (
            <Button
              size="sm"
              variant="primary"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add category
            </Button>
          ) : null
        }
      />
      <DataTable
        stickyHeader={false}
        isLoading={isLoading}
        rows={data.vehicleCategories}
        columns={[
          {
            key: 'name',
            header: 'Name',
            render: (c) => (
              <Box component="span" sx={{ fontWeight: 500 }}>
                {c.name}
              </Box>
            ),
          },
          { key: 'code', header: 'Code', sx: { fontFamily: mono, fontSize: 12.5 } },
          { key: 'description', header: 'Description', hideBelow: 'md' },
          { key: 'seatingCapacity', header: 'Seats', align: 'right', hideBelow: 'sm' },
          { key: 'vehicleCount', header: 'Vehicles', align: 'right' },
          {
            key: 'active',
            header: 'Active',
            render: (c) =>
              manage ? (
                <Switch size="sm" checked={c.active} onChange={() => toggle.mutate(c)} label={`${c.name} active`} />
              ) : c.active ? (
                'Yes'
              ) : (
                'No'
              ),
          },
          manage && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) => (
              <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                <IconButton
                  label="Edit"
                  icon={EditIcon}
                  size="xs"
                  onClick={() => {
                    setEditing(c)
                    setOpen(true)
                  }}
                />
                <IconButton label="Delete" icon={DeleteIcon} size="xs" onClick={() => setDeleting(c)} disabled={c.vehicleCount > 0} />
              </Box>
            ),
          },
        ]}
      />
      <CategoryDialog open={open} onClose={() => setOpen(false)} category={editing} onSaved={refetch} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="Only categories with no vehicles can be deleted."
        confirmLabel="Delete"
      />
    </Card>
  )
}

function CategoryDialog({ open, onClose, category, onSaved }) {
  const isEdit = Boolean(category)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: category
      ? {
          name: category.name,
          code: category.code,
          description: category.description ?? '',
          seatingCapacity: category.seatingCapacity ?? '',
        }
      : { name: '', code: '', description: '', seatingCapacity: '' },
  })
  const save = useApiMutation({
    mutationFn: (v) =>
      isEdit
        ? http.put(`/vehicle-categories/${category.id}`, {
            ...v,
            seatingCapacity: v.seatingCapacity === '' ? null : Number(v.seatingCapacity),
          })
        : http.post('/vehicle-categories', { ...v, seatingCapacity: v.seatingCapacity === '' ? null : Number(v.seatingCapacity) }),
    invalidate: [['reference']],
    success: isEdit ? 'Category updated' : 'Category added',
    setError: setFieldError,
    onSuccess: () => {
      reset()
      onSaved()
      onClose()
    },
  })
  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      await save.mutateAsync(v)
    } catch (e) {
      if (!e.fieldErrors?.length) setError(e)
    }
  })
  if (!open) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? 'Edit category' : 'Add category'}
      size="sm"
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
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Required' })} autoFocus />
        </Field>
        <Field label="Code" required error={errors.code?.message} hint="Short, unique, uppercase.">
          <Input {...register('code', { required: 'Required' })} mono uppercase disabled={isEdit} />
        </Field>
        <Field label="Default seating" error={errors.seatingCapacity?.message}>
          <Input type="number" inputMode="numeric" {...register('seatingCapacity')} />
        </Field>
        <Field label="Description">
          <Textarea rows={2} {...register('description')} />
        </Field>
      </Stack>
    </Dialog>
  )
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  return (
    <Card>
      <CardHeader title="Theme" description="Light uses pure white surfaces; dark uses pure black. System follows your operating system." />
      <CardBody>
        <SegmentedControl
          size="md"
          label="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light', icon: LightModeIcon },
            { value: 'dark', label: 'Dark', icon: DarkModeIcon },
            { value: 'system', label: 'System', icon: BrightnessAutoIcon },
          ]}
        />
        <Typography sx={{ mt: 1.5, fontSize: 12.5, color: 'text.muted' }}>Stored on this device only.</Typography>
      </CardBody>
    </Card>
  )
}

function SystemTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const [offline, setOffline] = useState(isMockOffline())
  const resetDemo = useApiMutation({
    mutationFn: () => http.post('/system/reset-demo-data'),
    success: 'Demo data regenerated',
    onSuccess: () => {
      setConfirm(false)
      queryClient.clear()
      queryClient.invalidateQueries()
    },
  })
  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader title="Backend connection" />
        <CardBody>
          <DescriptionList
            items={[
              {
                label: 'Mode',
                value: isMockApi ? (
                  <Badge tone="warning" size="sm" dot>
                    In-browser mock API
                  </Badge>
                ) : (
                  <Badge tone="success" size="sm" dot>
                    Spring Boot API
                  </Badge>
                ),
              },
              {
                label: 'API base',
                value: (
                  <Box component="code" sx={{ fontFamily: mono, fontSize: 12.5 }}>
                    {(import.meta.env.VITE_API_BASE_URL || '') + '/api/v1'}
                  </Box>
                ),
              },
              { label: 'Build', value: import.meta.env.MODE },
              { label: 'Timezone', value: 'Africa/Kigali' },
            ]}
          />
          {isMockApi ? (
            <Typography sx={{ mt: 2, fontSize: 12.5, color: 'text.muted' }}>
              Set{' '}
              <Box component="code" sx={{ fontFamily: mono }}>
                VITE_USE_MOCK_API=false
              </Box>{' '}
              and{' '}
              <Box component="code" sx={{ fontFamily: mono }}>
                VITE_API_BASE_URL
              </Box>{' '}
              in{' '}
              <Box component="code" sx={{ fontFamily: mono }}>
                .env
              </Box>{' '}
              to use the real backend. The request and response shapes are identical.
            </Typography>
          ) : null}
        </CardBody>
      </Card>
      {isMockApi ? (
        <Card>
          <CardHeader title="Demo controls" description="Only available while the mock API is active." />
          <CardBody sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>Simulate server outage</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
                  Every request fails with a network error so error and retry states can be reviewed.
                </Typography>
              </Box>
              <Button
                icon={offline ? WifiIcon : WifiOffIcon}
                variant={offline ? 'primary' : 'secondary'}
                onClick={() => {
                  setMockOffline(!offline)
                  setOffline(!offline)
                  toast.info(offline ? 'Mock API back online' : 'Mock API is now offline')
                }}
              >
                {offline ? 'Bring back online' : 'Go offline'}
              </Button>
            </Box>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 2,
                borderTop: 1,
                borderColor: 'divider',
                pt: 2.5,
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>Reset demo data</Typography>
                <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
                  Discards every change made in this browser and regenerates the seed data for today.
                </Typography>
              </Box>
              <Button icon={ReplayIcon} variant="danger-soft" onClick={() => setConfirm(true)}>
                Reset
              </Button>
            </Box>
          </CardBody>
        </Card>
      ) : null}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => resetDemo.mutate()}
        loading={resetDemo.isPending}
        title="Reset demo data?"
        description="All vehicles, trips, fuel, maintenance and users you created or edited in this browser will be replaced with fresh seed data."
        confirmLabel="Reset data"
      />
    </Stack>
  )
}
