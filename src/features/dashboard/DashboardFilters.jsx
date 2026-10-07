import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import { http } from '@/api/client'
import { useCategoryOptions, useOptions } from '@/app/ReferenceProvider'
import { DateRangePicker } from '@/components/ui/DateRange'
import { Select } from '@/components/ui/Field'
import { useVehicleOptions, useDriverOptions } from '@/features/common/hooks'

/** Filter row shared by the dashboard and daily position screens. */
export function DashboardFilters({ state, update, reset, showRange = true, showStatus = true }) {
  const categories = useCategoryOptions()
  const statuses = useOptions('vehicle')
  const departments = useQuery({
    queryKey: ['vehicles', 'departments'],
    queryFn: () => http.get('/vehicles/departments'),
    staleTime: 300_000,
  })
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const hasFilters = ['categoryId', 'department', 'status', 'vehicleId', 'driverId'].some((k) => state[k])
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
      {showRange ? <DateRangePicker value={{ from: state.from, to: state.to }} onChange={(r) => update(r)} /> : null}
      <Select
        value={state.categoryId ?? ''}
        onChange={(e) => update({ categoryId: e.target.value })}
        compact
        aria-label="Category"
        placeholder="All categories"
      >
        {categories.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
      <Select
        value={state.department ?? ''}
        onChange={(e) => update({ department: e.target.value })}
        compact
        aria-label="Department"
        placeholder="All departments"
      >
        {(departments.data ?? []).map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </Select>
      {showStatus ? (
        <Select
          value={state.status ?? ''}
          onChange={(e) => update({ status: e.target.value })}
          compact
          aria-label="Operational status"
          placeholder="Any status"
        >
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      ) : null}
      <Select
        value={state.vehicleId ?? ''}
        onChange={(e) => update({ vehicleId: e.target.value })}
        compact
        aria-label="Vehicle"
        placeholder="All vehicles"
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
        aria-label="Driver"
        placeholder="All drivers"
      >
        {drivers.options.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </Select>
      {hasFilters ? (
        <ButtonBase
          type="button"
          onClick={reset}
          sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.muted', px: 0.5, borderRadius: 1, '&:hover': { color: 'text.primary' } }}
        >
          Clear
        </ButtonBase>
      ) : null}
    </Box>
  )
}
