import { addDays, differenceInCalendarDays, eachDayOfInterval, format, parseISO, subDays } from 'date-fns'
import { get } from '../router'
import { getDb } from '../db'
import { inDateRange } from '../core'
import { computeAlerts, currentAssignmentOf, documentStatus, toMaintenance, toSchedule } from '../mappers'
import { REFERENCE } from './reference'

const today = () => format(new Date(), 'yyyy-MM-dd')

/** Resolves the dashboard filter set shared by every dashboard endpoint. */
function scope(query) {
  const d = getDb()
  const to = query.to ?? today()
  const from = query.from ?? format(subDays(parseISO(to), 29), 'yyyy-MM-dd')
  const driverVehicleIds = query.driverId
    ? new Set(d.assignments.filter((a) => a.driverId === Number(query.driverId) && a.status === 'ACTIVE').map((a) => a.vehicleId))
    : null
  const vehicles = d.vehicles
    .filter((v) => !v.archived)
    .filter((v) => !query.categoryId || v.categoryId === Number(query.categoryId))
    .filter((v) => !query.vehicleId || v.id === Number(query.vehicleId))
    .filter((v) => !query.department || v.department === query.department)
    .filter((v) => !query.status || v.status === query.status)
    .filter((v) => !driverVehicleIds || driverVehicleIds.has(v.id))
  const vehicleIds = new Set(vehicles.map((v) => v.id))
  const inScope = (vehicleId) => vehicleIds.has(vehicleId)
  const trips = d.trips.filter((t) => inScope(t.vehicleId)).filter((t) => !query.driverId || t.driverId === Number(query.driverId))
  const fuel = d.fuel.filter((f) => inScope(f.vehicleId)).filter((f) => !query.driverId || f.driverId === Number(query.driverId))
  const maintenance = d.maintenance.filter((m) => inScope(m.vehicleId))
  const movements = d.movements.filter((m) => inScope(m.vehicleId))
  return { d, from, to, vehicles, vehicleIds, trips, fuel, maintenance, movements }
}

const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) ?? 0), 0)
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0)
const delta = (current, previous) => (previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : current > 0 ? 100 : 0)

get(
  '/dashboard/summary',
  ({ query }) => {
    const { d, from, to, vehicles, trips, fuel, maintenance, movements } = scope(query)
    const t = today()
    const periodDays = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
    const prevFrom = format(subDays(parseISO(from), periodDays), 'yyyy-MM-dd')
    const prevTo = format(subDays(parseISO(from), 1), 'yyyy-MM-dd')
    const byStatus = (s) => vehicles.filter((v) => v.status === s).length
    const tripsIn = (a, b) => trips.filter((x) => x.status === 'COMPLETED' && inDateRange(x.endedAt, a, b))
    const fuelIn = (a, b) => fuel.filter((x) => inDateRange(x.transactedAt, a, b))
    const periodTrips = tripsIn(from, to)
    const prevTrips = tripsIn(prevFrom, prevTo)
    const periodFuel = fuelIn(from, to)
    const prevFuel = fuelIn(prevFrom, prevTo)
    const movedToday = new Set(movements.filter((m) => m.date === t && m.distanceKm > 0).map((m) => m.vehicleId))
    const operational = vehicles.filter((v) => !['INACTIVE', 'OUT_OF_SERVICE'].includes(v.status))
    const schedules = d.schedules.filter((s) => vehicles.some((v) => v.id === s.vehicleId)).map(toSchedule)
    const vehiclesUsedInPeriod = new Set(periodTrips.map((x) => x.vehicleId)).size
    const docs = d.documents.filter(
      (x) => (x.ownerType === 'VEHICLE' && vehicles.some((v) => v.id === x.ownerId)) || x.ownerType === 'DRIVER',
    )
    const distance = sum(periodTrips, (x) => (x.endOdometer ?? 0) - (x.startOdometer ?? 0))
    const prevDistance = sum(prevTrips, (x) => (x.endOdometer ?? 0) - (x.startOdometer ?? 0))
    const fuelLitres = sum(periodFuel, (x) => x.litres)
    const fuelCost = sum(periodFuel, (x) => Math.round(x.litres * x.pricePerLitre))
    const prevFuelCost = sum(prevFuel, (x) => Math.round(x.litres * x.pricePerLitre))
    const maintCost = sum(
      maintenance.filter((m) => m.status === 'COMPLETED' && inDateRange(m.completedAt, from, to)).map(toMaintenance),
      (m) => m.totalCost,
    )
    const prevMaintCost = sum(
      maintenance.filter((m) => m.status === 'COMPLETED' && inDateRange(m.completedAt, prevFrom, prevTo)).map(toMaintenance),
      (m) => m.totalCost,
    )
    return {
      period: { from, to, days: periodDays },
      totalVehicles: vehicles.length,
      availableVehicles: byStatus('AVAILABLE'),
      assignedVehicles: byStatus('ASSIGNED'),
      onTripVehicles: byStatus('ON_TRIP'),
      reservedVehicles: byStatus('RESERVED'),
      inWorkshopVehicles: byStatus('IN_MAINTENANCE'),
      outOfServiceVehicles: byStatus('OUT_OF_SERVICE'),
      inactiveVehicles: byStatus('INACTIVE'),
      idleVehicles: operational.filter((v) => !movedToday.has(v.id) && v.status !== 'IN_MAINTENANCE').length,
      gpsProblemVehicles: operational.filter((v) => ['OFFLINE', 'NO_SIGNAL', 'DISCONNECTED'].includes(d.telemetry[v.id]?.status)).length,
      fuelSensorProblemVehicles: operational.filter((v) => d.telemetry[v.id]?.fuelSensorOk === false).length,
      tripsToday: trips.filter((x) => x.scheduledStartAt.startsWith(t) && x.status !== 'CANCELLED').length,
      tripsInProgress: trips.filter((x) => x.status === 'IN_PROGRESS').length,
      tripsInPeriod: periodTrips.length,
      distanceTodayKm: Math.round(
        sum(
          movements.filter((m) => m.date === t),
          (m) => m.distanceKm,
        ),
      ),
      distanceInPeriodKm: distance,
      activeDrivers: d.drivers.filter((x) => !x.archived && ['AVAILABLE', 'ASSIGNED', 'ON_TRIP'].includes(x.status)).length,
      driversOnTrip: d.drivers.filter((x) => x.status === 'ON_TRIP').length,
      vehiclesDueForService: new Set(schedules.filter((s) => s.state === 'DUE_SOON').map((s) => s.vehicleId)).size,
      overdueMaintenance: new Set(schedules.filter((s) => s.state === 'OVERDUE').map((s) => s.vehicleId)).size,
      openMaintenance: maintenance.filter((m) =>
        ['REPORTED', 'INSPECTION', 'APPROVED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(m.status),
      ).length,
      fuelConsumedLitres: Math.round(fuelLitres),
      fuelCost,
      maintenanceCost: maintCost,
      operatingCost: fuelCost + maintCost,
      costPerKm: distance > 0 ? Math.round(((fuelCost + maintCost) / distance) * 100) / 100 : null,
      upcomingBookings: d.bookings.filter(
        (b) =>
          ['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(b.status) &&
          b.pickupAt >= new Date().toISOString() &&
          b.pickupAt <= addDays(new Date(), 7).toISOString(),
      ).length,
      unassignedBookings: d.bookings.filter((b) => ['REQUESTED', 'CONFIRMED'].includes(b.status) && b.pickupAt >= new Date().toISOString())
        .length,
      activeIncidents: d.incidents.filter(
        (i) => ['OPEN', 'UNDER_INVESTIGATION'].includes(i.status) && vehicles.some((v) => v.id === i.vehicleId),
      ).length,
      expiredDocuments: docs.filter((x) => documentStatus(x.expiryDate).status === 'EXPIRED').length,
      expiringDocuments: docs.filter((x) => documentStatus(x.expiryDate).status === 'EXPIRING_SOON').length,
      utilizationPercent: pct(vehiclesUsedInPeriod, operational.length),
      deltas: {
        tripsInPeriod: delta(periodTrips.length, prevTrips.length),
        distanceInPeriodKm: delta(distance, prevDistance),
        fuelCost: delta(fuelCost, prevFuelCost),
        maintenanceCost: delta(maintCost, prevMaintCost),
        operatingCost: delta(fuelCost + maintCost, prevFuelCost + prevMaintCost),
      },
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/fleet-status',
  ({ query }) => {
    const { vehicles } = scope(query)
    return REFERENCE.vehicleStatuses.map((s) => ({
      status: s.value,
      label: s.label,
      tone: s.tone,
      count: vehicles.filter((v) => v.status === s.value).length,
    }))
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/distance-trend',
  ({ query }) => {
    const { from, to, movements, trips } = scope(query)
    return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((day) => {
      const key = format(day, 'yyyy-MM-dd')
      return {
        date: key,
        distanceKm: Math.round(
          sum(
            movements.filter((m) => m.date === key),
            (m) => m.distanceKm,
          ),
        ),
        trips: trips.filter((t) => t.status === 'COMPLETED' && (t.endedAt ?? '').startsWith(key)).length,
        vehiclesMoved: new Set(movements.filter((m) => m.date === key && m.distanceKm > 0).map((m) => m.vehicleId)).size,
      }
    })
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/utilization',
  ({ query }) => {
    const { from, to, vehicles, movements, trips, d } = scope(query)
    const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
    const rows = vehicles
      .filter((v) => v.status !== 'INACTIVE')
      .map((v) => {
        const mv = movements.filter((m) => m.vehicleId === v.id && inDateRange(m.date, from, to))
        const daysActive = mv.filter((m) => m.distanceKm > 0).length
        const distanceKm = Math.round(sum(mv, (m) => m.distanceKm))
        const tripCount = trips.filter((t) => t.vehicleId === v.id && t.status === 'COMPLETED' && inDateRange(t.endedAt, from, to)).length
        const utilizationPercent = pct(daysActive, days)
        const band = utilizationPercent >= 70 ? 'HEAVY' : utilizationPercent >= 35 ? 'NORMAL' : utilizationPercent > 0 ? 'LOW' : 'IDLE'
        return {
          vehicleId: v.id,
          plateNumber: v.plateNumber,
          categoryName: d.categories.find((c) => c.id === v.categoryId)?.name ?? '',
          status: v.status,
          daysActive,
          daysInPeriod: days,
          distanceKm,
          trips: tripCount,
          utilizationPercent,
          band,
        }
      })
    rows.sort((a, b) => b.utilizationPercent - a.utilizationPercent)
    const byCategory = {}
    for (const r of rows) {
      byCategory[r.categoryName] = byCategory[r.categoryName] ?? { category: r.categoryName, vehicles: 0, utilization: 0, distanceKm: 0 }
      byCategory[r.categoryName].vehicles += 1
      byCategory[r.categoryName].utilization += r.utilizationPercent
      byCategory[r.categoryName].distanceKm += r.distanceKm
    }
    return {
      rows,
      bands: ['HEAVY', 'NORMAL', 'LOW', 'IDLE'].map((b) => ({ band: b, count: rows.filter((r) => r.band === b).length })),
      byCategory: Object.values(byCategory)
        .map((c) => ({ ...c, utilization: Math.round((c.utilization / c.vehicles) * 10) / 10 }))
        .sort((a, b) => b.utilization - a.utilization),
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/fuel-trend',
  ({ query }) => {
    const { from, to, fuel } = scope(query)
    const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
    const weekly = days > 45
    const buckets = new Map()
    for (const f of fuel.filter((x) => inDateRange(x.transactedAt, from, to))) {
      const dt = parseISO(f.transactedAt)
      const key = weekly ? format(subDays(dt, dt.getDay()), 'yyyy-MM-dd') : format(dt, 'yyyy-MM-dd')
      const b = buckets.get(key) ?? { date: key, litres: 0, cost: 0, fills: 0 }
      b.litres += f.litres
      b.cost += Math.round(f.litres * f.pricePerLitre)
      b.fills += 1
      buckets.set(key, b)
    }
    const series = weekly
      ? [...buckets.values()]
      : eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(
          (day) => buckets.get(format(day, 'yyyy-MM-dd')) ?? { date: format(day, 'yyyy-MM-dd'), litres: 0, cost: 0, fills: 0 },
        )
    return {
      granularity: weekly ? 'week' : 'day',
      series: series.sort((a, b) => a.date.localeCompare(b.date)).map((b) => ({ ...b, litres: Math.round(b.litres * 10) / 10 })),
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/maintenance',
  ({ query }) => {
    const { from, to, maintenance, d } = scope(query)
    const list = maintenance.map(toMaintenance)
    const months = new Map()
    for (const m of list.filter((x) => inDateRange(x.reportedAt, format(subDays(parseISO(to), 180), 'yyyy-MM-dd'), to))) {
      const key = m.reportedAt.slice(0, 7)
      const b = months.get(key) ?? { month: key, reported: 0, completed: 0, cost: 0, preventive: 0, corrective: 0 }
      b.reported += 1
      if (m.status === 'COMPLETED') {
        b.completed += 1
        b.cost += m.totalCost
      }
      if (m.type === 'PREVENTIVE') b.preventive += 1
      else if (m.type === 'CORRECTIVE') b.corrective += 1
      months.set(key, b)
    }
    const schedules = d.schedules.map(toSchedule)
    return {
      trend: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
      byType: REFERENCE.maintenanceTypes.map((t) => ({
        type: t.value,
        label: t.label,
        count: list.filter((m) => m.type === t.value && inDateRange(m.reportedAt, from, to)).length,
        cost: sum(
          list.filter((m) => m.type === t.value && m.status === 'COMPLETED' && inDateRange(m.completedAt, from, to)),
          (m) => m.totalCost,
        ),
      })),
      open: list
        .filter((m) => ['REPORTED', 'INSPECTION', 'APPROVED', 'IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(m.status))
        .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
        .slice(0, 8),
      upcomingService: schedules
        .filter((s) => s.state !== 'OK')
        .sort((a, b) => (a.state === b.state ? (a.kmRemaining ?? 0) - (b.kmRemaining ?? 0) : a.state === 'OVERDUE' ? -1 : 1))
        .slice(0, 8),
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/cost-by-vehicle',
  ({ query }) => {
    const { from, to, vehicles, fuel, maintenance, trips } = scope(query)
    const rows = vehicles.map((v) => {
      const fuelCost = sum(
        fuel.filter((f) => f.vehicleId === v.id && inDateRange(f.transactedAt, from, to)),
        (f) => Math.round(f.litres * f.pricePerLitre),
      )
      const maintenanceCost = sum(
        maintenance
          .filter((m) => m.vehicleId === v.id && m.status === 'COMPLETED' && inDateRange(m.completedAt, from, to))
          .map(toMaintenance),
        (m) => m.totalCost,
      )
      const distanceKm = sum(
        trips.filter((t) => t.vehicleId === v.id && t.status === 'COMPLETED' && inDateRange(t.endedAt, from, to)),
        (t) => (t.endOdometer ?? 0) - (t.startOdometer ?? 0),
      )
      const totalCost = fuelCost + maintenanceCost
      return {
        vehicleId: v.id,
        plateNumber: v.plateNumber,
        fuelCost,
        maintenanceCost,
        totalCost,
        distanceKm,
        costPerKm: distanceKm > 0 ? Math.round((totalCost / distanceKm) * 100) / 100 : null,
      }
    })
    return rows
      .filter((r) => r.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost)
      .slice(0, Number(query.limit ?? 12))
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/availability-trend',
  ({ query }) => {
    const { from, to, vehicles, maintenance, movements } = scope(query)
    const operational = vehicles.filter((v) => v.status !== 'INACTIVE')
    return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map((day) => {
      const key = format(day, 'yyyy-MM-dd')
      const inWorkshop = maintenance
        .filter(
          (m) =>
            m.startedAt &&
            m.startedAt.slice(0, 10) <= key &&
            (!m.completedAt || m.completedAt.slice(0, 10) >= key) &&
            ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'COMPLETED'].includes(m.status),
        )
        .map((m) => m.vehicleId)
      const workshopSet = new Set(inWorkshop)
      const used = new Set(movements.filter((m) => m.date === key && m.distanceKm > 0).map((m) => m.vehicleId))
      return {
        date: key,
        available: operational.length - workshopSet.size,
        inWorkshop: workshopSet.size,
        used: used.size,
        total: operational.length,
      }
    })
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/alerts',
  ({ query }) => {
    const alerts = computeAlerts().filter((a) => !a.acknowledgedAt)
    return {
      critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
      warning: alerts.filter((a) => a.severity === 'WARNING').length,
      info: alerts.filter((a) => a.severity === 'INFO').length,
      items: alerts.slice(0, Number(query.limit ?? 8)),
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)

get(
  '/dashboard/daily-position',
  ({ query }) => {
    const { d, vehicles, movements } = scope(query)
    const t = query.date ?? today()
    return vehicles
      .filter((v) => v.status !== 'INACTIVE')
      .map((v) => {
        const mv = movements.find((m) => m.vehicleId === v.id && m.date === t)
        const assignment = currentAssignmentOf(v.id)
        const tele = d.telemetry[v.id]
        const flags = []
        if (!mv || mv.distanceKm === 0) flags.push('NOT_MOVED')
        if (mv && mv.drivingMinutes > d.settings.excessiveDailyDrivingHours * 60) flags.push('EXCESSIVE_HOURS')
        if (mv && mv.distanceKm > d.settings.highDailyDistanceKm) flags.push('HIGH_DISTANCE')
        if (mv?.nightDriving) flags.push('NIGHT_DRIVING')
        if (tele && ['OFFLINE', 'NO_SIGNAL', 'DISCONNECTED'].includes(tele.status)) flags.push('GPS_ISSUE')
        return {
          vehicleId: v.id,
          plateNumber: v.plateNumber,
          categoryName: d.categories.find((c) => c.id === v.categoryId)?.name ?? '',
          status: v.status,
          driverName: assignment ? (d.drivers.find((x) => x.id === assignment.driverId)?.fullName ?? null) : null,
          distanceKm: Math.round(mv?.distanceKm ?? 0),
          trips: mv?.tripCount ?? 0,
          drivingMinutes: mv?.drivingMinutes ?? 0,
          maxSpeedKph: mv?.maxSpeedKph ?? 0,
          firstMovementAt: mv?.firstMovementAt ?? null,
          lastMovementAt: mv?.lastMovementAt ?? null,
          gpsStatus: tele?.status ?? 'UNKNOWN',
          flags,
        }
      })
      .sort((a, b) => b.distanceKm - a.distanceKm)
  },
  { permission: 'DASHBOARD_VIEW' },
)
