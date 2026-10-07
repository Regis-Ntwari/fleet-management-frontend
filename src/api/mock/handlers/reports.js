import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'
import { get } from '../router'
import { getDb } from '../db'
import { inDateRange, notFound } from '../core'
import { currentAssignmentOf, documentStatus, expectedL100, recordAudit, toFuel, toMaintenance, toSchedule } from '../mappers'
import { buildSummary } from './reportSummaries'

export const REPORTS = [
  {
    key: 'daily-fleet',
    name: 'Daily fleet report',
    description: 'Position of every vehicle for a chosen day: driver, status, distance and remarks.',
    group: 'Operations',
    supportsDateRange: false,
  },
  {
    key: 'fleet-availability',
    name: 'Fleet availability',
    description: 'Available, assigned, on-trip and workshop counts per day across the period.',
    group: 'Operations',
    supportsDateRange: true,
  },
  {
    key: 'trips',
    name: 'Trip report',
    description: 'All trips in the period with distance, duration and status.',
    group: 'Operations',
    supportsDateRange: true,
  },
  {
    key: 'vehicle-movement',
    name: 'Vehicle movement',
    description: 'Daily distance, driving time and exception flags per vehicle.',
    group: 'Operations',
    supportsDateRange: true,
  },
  {
    key: 'driver-utilization',
    name: 'Driver utilization',
    description: 'Trips, distance and on-time rate per driver.',
    group: 'Operations',
    supportsDateRange: true,
  },
  {
    key: 'maintenance',
    name: 'Maintenance report',
    description: 'Maintenance jobs reported in the period with status and cost.',
    group: 'Maintenance',
    supportsDateRange: true,
  },
  {
    key: 'maintenance-cost',
    name: 'Maintenance cost',
    description: 'Completed maintenance cost per vehicle, split into parts, labour and other.',
    group: 'Maintenance',
    supportsDateRange: true,
  },
  {
    key: 'upcoming-service',
    name: 'Upcoming service',
    description: 'Preventive tasks that are overdue or due soon.',
    group: 'Maintenance',
    supportsDateRange: false,
  },
  {
    key: 'fuel-consumption',
    name: 'Fuel consumption',
    description: 'Litres, cost and L/100 km per vehicle.',
    group: 'Fuel & cost',
    supportsDateRange: true,
  },
  {
    key: 'fuel-variance',
    name: 'Fuel variance',
    description: 'Fills where consumption deviates from the expected rate for the vehicle class.',
    group: 'Fuel & cost',
    supportsDateRange: true,
  },
  {
    key: 'vehicle-cost',
    name: 'Vehicle cost',
    description: 'Total operating cost and cost per km per vehicle.',
    group: 'Fuel & cost',
    supportsDateRange: true,
  },
  {
    key: 'incidents',
    name: 'Incident report',
    description: 'Incidents in the period with severity, status and estimated cost.',
    group: 'Compliance',
    supportsDateRange: true,
  },
  {
    key: 'expired-documents',
    name: 'Expired & expiring documents',
    description: 'Vehicle and driver documents that are expired or inside the warning window.',
    group: 'Compliance',
    supportsDateRange: false,
  },
]

const col = (key, label, format, align) => ({ key, label, ...(format ? { format } : {}), ...(align ? { align } : {}) })
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) ?? 0), 0)
const r1 = (n) => Math.round(n * 10) / 10

const builders = {
  'daily-fleet': ({ d, date }) => {
    const rows = d.vehicles
      .filter((v) => !v.archived)
      .map((v) => {
        const mv = d.movements.find((m) => m.vehicleId === v.id && m.date === date)
        const a = currentAssignmentOf(v.id)
        const tele = d.telemetry[v.id]
        const remarks = []
        if (v.status === 'IN_MAINTENANCE')
          remarks.push(
            d.maintenance.find((m) => m.vehicleId === v.id && ['IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(m.status))?.complaint ??
              'In workshop',
          )
        if (!mv || mv.distanceKm === 0) remarks.push('Did not move')
        if (tele && ['OFFLINE', 'NO_SIGNAL'].includes(tele.status)) remarks.push(`GPS ${tele.status.toLowerCase().replace('_', ' ')}`)
        if (mv && mv.distanceKm > d.settings.highDailyDistanceKm) remarks.push(`High distance (${Math.round(mv.distanceKm)} km)`)
        const expired = d.documents.filter(
          (x) => x.ownerType === 'VEHICLE' && x.ownerId === v.id && documentStatus(x.expiryDate).status === 'EXPIRED',
        )
        if (expired.length) remarks.push(`Expired ${expired.map((x) => x.type.toLowerCase().replace('_', ' ')).join(', ')}`)
        return {
          plateNumber: v.plateNumber,
          vehicle: `${v.make} ${v.model}`,
          category: d.categories.find((c) => c.id === v.categoryId)?.name ?? '',
          driver: a ? d.drivers.find((x) => x.id === a.driverId)?.fullName : '—',
          status: v.status,
          distanceKm: Math.round(mv?.distanceKm ?? 0),
          trips: mv?.tripCount ?? 0,
          remarks: remarks.join('; ') || 'Normal',
        }
      })
    return {
      columns: [
        col('plateNumber', 'Plate'),
        col('vehicle', 'Vehicle'),
        col('category', 'Category'),
        col('driver', 'Driver'),
        col('status', 'Status', 'status'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('trips', 'Trips', 'number', 'right'),
        col('remarks', 'Remarks'),
      ],
      rows,
      totals: { plateNumber: `${rows.length} vehicles`, distanceKm: sum(rows, (r) => r.distanceKm), trips: sum(rows, (r) => r.trips) },
    }
  },
  'fleet-availability': ({ d, from, to }) => {
    const operational = d.vehicles.filter((v) => !v.archived && v.status !== 'INACTIVE')
    const rows = []
    for (let cur = parseISO(from); cur <= parseISO(to); cur = new Date(cur.getTime() + 86400000)) {
      const key = format(cur, 'yyyy-MM-dd')
      const workshop = new Set(
        d.maintenance
          .filter((m) => m.startedAt && m.startedAt.slice(0, 10) <= key && (!m.completedAt || m.completedAt.slice(0, 10) >= key))
          .map((m) => m.vehicleId),
      ).size
      const used = new Set(d.movements.filter((m) => m.date === key && m.distanceKm > 0).map((m) => m.vehicleId)).size
      const onTrip = d.trips.filter((t) => t.status === 'COMPLETED' && (t.startedAt ?? '').startsWith(key)).length
      rows.push({
        date: key,
        total: operational.length,
        inWorkshop: workshop,
        available: operational.length - workshop,
        used,
        trips: onTrip,
        utilization: operational.length ? r1((used / operational.length) * 100) : 0,
      })
    }
    return {
      columns: [
        col('date', 'Date', 'date'),
        col('total', 'Fleet', 'number', 'right'),
        col('inWorkshop', 'In workshop', 'number', 'right'),
        col('available', 'Available', 'number', 'right'),
        col('used', 'Vehicles used', 'number', 'right'),
        col('trips', 'Trips', 'number', 'right'),
        col('utilization', 'Utilization', 'percent', 'right'),
      ],
      rows,
      totals: {
        date: 'Average',
        used: r1(sum(rows, (r) => r.used) / Math.max(1, rows.length)),
        trips: sum(rows, (r) => r.trips),
        utilization: r1(sum(rows, (r) => r.utilization) / Math.max(1, rows.length)),
      },
    }
  },
  trips: ({ d, from, to }) => {
    const rows = d.trips
      .filter((t) => inDateRange(t.scheduledStartAt, from, to))
      .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
      .map((t) => ({
        tripNumber: t.tripNumber,
        scheduledStartAt: t.scheduledStartAt,
        plateNumber: d.vehicles.find((v) => v.id === t.vehicleId)?.plateNumber,
        driver: d.drivers.find((x) => x.id === t.driverId)?.fullName,
        customer: t.customerName ?? '—',
        route: `${t.startLocation} → ${t.destination}`,
        distanceKm: t.endOdometer != null && t.startOdometer != null ? t.endOdometer - t.startOdometer : null,
        durationMin: t.startedAt && t.endedAt ? Math.round((parseISO(t.endedAt) - parseISO(t.startedAt)) / 60000) : null,
        status: t.status,
      }))
    return {
      columns: [
        col('tripNumber', 'Trip'),
        col('scheduledStartAt', 'Scheduled', 'datetime'),
        col('plateNumber', 'Vehicle'),
        col('driver', 'Driver'),
        col('customer', 'Customer'),
        col('route', 'Route'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('durationMin', 'Duration (min)', 'number', 'right'),
        col('status', 'Status', 'status'),
      ],
      rows,
      totals: {
        tripNumber: `${rows.length} trips`,
        distanceKm: sum(rows, (r) => r.distanceKm),
        durationMin: sum(rows, (r) => r.durationMin),
      },
    }
  },
  'vehicle-movement': ({ d, from, to }) => {
    const rows = d.movements
      .filter((m) => inDateRange(m.date, from, to))
      .sort((a, b) => b.date.localeCompare(a.date) || a.vehicleId - b.vehicleId)
      .map((m) => {
        const flags = []
        if (m.drivingMinutes > d.settings.excessiveDailyDrivingHours * 60) flags.push('Excessive hours')
        if (m.distanceKm > d.settings.highDailyDistanceKm) flags.push('High distance')
        if (m.nightDriving) flags.push('Night driving')
        return {
          date: m.date,
          plateNumber: d.vehicles.find((v) => v.id === m.vehicleId)?.plateNumber,
          distanceKm: Math.round(m.distanceKm),
          trips: m.tripCount,
          drivingMinutes: m.drivingMinutes,
          firstMovementAt: m.firstMovementAt,
          lastMovementAt: m.lastMovementAt,
          maxSpeedKph: m.maxSpeedKph,
          flags: flags.join(', ') || '—',
        }
      })
    return {
      columns: [
        col('date', 'Date', 'date'),
        col('plateNumber', 'Vehicle'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('trips', 'Trips', 'number', 'right'),
        col('drivingMinutes', 'Driving (min)', 'number', 'right'),
        col('firstMovementAt', 'First move', 'datetime'),
        col('lastMovementAt', 'Last move', 'datetime'),
        col('maxSpeedKph', 'Max km/h', 'number', 'right'),
        col('flags', 'Flags'),
      ],
      rows,
      totals: {
        date: `${rows.length} vehicle-days`,
        distanceKm: sum(rows, (r) => r.distanceKm),
        trips: sum(rows, (r) => r.trips),
        drivingMinutes: sum(rows, (r) => r.drivingMinutes),
      },
    }
  },
  'driver-utilization': ({ d, from, to }) => {
    const days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
    const rows = d.drivers
      .filter((x) => !x.archived)
      .map((dr) => {
        const trips = d.trips.filter((t) => t.driverId === dr.id && t.status === 'COMPLETED' && inDateRange(t.endedAt, from, to))
        const distance = sum(trips, (t) => (t.endOdometer ?? 0) - (t.startOdometer ?? 0))
        const daysWorked = new Set(trips.map((t) => (t.endedAt ?? '').slice(0, 10))).size
        const onTime = trips.filter((t) => t.startedAt && parseISO(t.startedAt) - parseISO(t.scheduledStartAt) <= 10 * 60000).length
        return {
          driver: dr.fullName,
          employeeNumber: dr.employeeNumber,
          status: dr.status,
          trips: trips.length,
          distanceKm: distance,
          daysWorked,
          utilization: r1((daysWorked / days) * 100),
          onTimeRate: trips.length ? Math.round((onTime / trips.length) * 100) : null,
          incidents: d.incidents.filter((i) => i.driverId === dr.id && inDateRange(i.occurredAt, from, to)).length,
        }
      })
      .sort((a, b) => b.trips - a.trips)
    return {
      columns: [
        col('driver', 'Driver'),
        col('employeeNumber', 'Employee no.'),
        col('status', 'Status', 'status'),
        col('trips', 'Trips', 'number', 'right'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('daysWorked', 'Days worked', 'number', 'right'),
        col('utilization', 'Utilization', 'percent', 'right'),
        col('onTimeRate', 'On-time', 'percent', 'right'),
        col('incidents', 'Incidents', 'number', 'right'),
      ],
      rows,
      totals: {
        driver: `${rows.length} drivers`,
        trips: sum(rows, (r) => r.trips),
        distanceKm: sum(rows, (r) => r.distanceKm),
        incidents: sum(rows, (r) => r.incidents),
      },
    }
  },
  maintenance: ({ d, from, to }) => {
    const rows = d.maintenance
      .filter((m) => inDateRange(m.reportedAt, from, to))
      .map(toMaintenance)
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
      .map((m) => ({
        maintenanceNumber: m.maintenanceNumber,
        reportedAt: m.reportedAt,
        plateNumber: m.vehiclePlate,
        type: m.type,
        complaint: m.complaint,
        workshop: m.workshop,
        technician: m.technicianName ?? '—',
        completedAt: m.completedAt,
        totalCost: m.totalCost,
        status: m.status,
      }))
    return {
      columns: [
        col('maintenanceNumber', 'Job'),
        col('reportedAt', 'Reported', 'date'),
        col('plateNumber', 'Vehicle'),
        col('type', 'Type', 'status'),
        col('complaint', 'Complaint'),
        col('workshop', 'Workshop'),
        col('technician', 'Technician'),
        col('completedAt', 'Completed', 'date'),
        col('totalCost', 'Cost', 'currency', 'right'),
        col('status', 'Status', 'status'),
      ],
      rows,
      totals: { maintenanceNumber: `${rows.length} jobs`, totalCost: sum(rows, (r) => r.totalCost) },
    }
  },
  'maintenance-cost': ({ d, from, to }) => {
    const rows = d.vehicles
      .filter((v) => !v.archived)
      .map((v) => {
        const jobs = d.maintenance
          .filter((m) => m.vehicleId === v.id && m.status === 'COMPLETED' && inDateRange(m.completedAt, from, to))
          .map(toMaintenance)
        return {
          plateNumber: v.plateNumber,
          vehicle: `${v.make} ${v.model}`,
          jobs: jobs.length,
          partsCost: sum(jobs, (j) => j.partsCost),
          laborCost: sum(jobs, (j) => j.laborCost),
          otherCost: sum(jobs, (j) => j.otherCost),
          totalCost: sum(jobs, (j) => j.totalCost),
        }
      })
      .filter((r) => r.jobs > 0)
      .sort((a, b) => b.totalCost - a.totalCost)
    return {
      columns: [
        col('plateNumber', 'Plate'),
        col('vehicle', 'Vehicle'),
        col('jobs', 'Jobs', 'number', 'right'),
        col('partsCost', 'Parts', 'currency', 'right'),
        col('laborCost', 'Labour', 'currency', 'right'),
        col('otherCost', 'Other', 'currency', 'right'),
        col('totalCost', 'Total', 'currency', 'right'),
      ],
      rows,
      totals: {
        plateNumber: `${rows.length} vehicles`,
        jobs: sum(rows, (r) => r.jobs),
        partsCost: sum(rows, (r) => r.partsCost),
        laborCost: sum(rows, (r) => r.laborCost),
        otherCost: sum(rows, (r) => r.otherCost),
        totalCost: sum(rows, (r) => r.totalCost),
      },
    }
  },
  'upcoming-service': ({ d }) => {
    const rows = d.schedules
      .map(toSchedule)
      .filter((s) => s.state !== 'OK')
      .sort((a, b) => (a.state === b.state ? (a.kmRemaining ?? 0) - (b.kmRemaining ?? 0) : a.state === 'OVERDUE' ? -1 : 1))
      .map((s) => ({
        plateNumber: s.vehiclePlate,
        task: s.task,
        lastServiceKm: s.lastServiceKm,
        lastServiceDate: s.lastServiceDate,
        nextServiceKm: s.nextServiceKm,
        nextServiceDate: s.nextServiceDate,
        currentOdometerKm: s.currentOdometerKm,
        kmRemaining: s.kmRemaining,
        daysRemaining: s.daysRemaining,
        state: s.state,
      }))
    return {
      columns: [
        col('plateNumber', 'Vehicle'),
        col('task', 'Task'),
        col('lastServiceKm', 'Last (km)', 'number', 'right'),
        col('lastServiceDate', 'Last date', 'date'),
        col('nextServiceKm', 'Next (km)', 'number', 'right'),
        col('nextServiceDate', 'Next date', 'date'),
        col('currentOdometerKm', 'Odometer', 'number', 'right'),
        col('kmRemaining', 'Km left', 'number', 'right'),
        col('daysRemaining', 'Days left', 'number', 'right'),
        col('state', 'State', 'status'),
      ],
      rows,
      totals: { plateNumber: `${rows.length} tasks` },
    }
  },
  'fuel-consumption': ({ d, from, to }) => {
    const rows = d.vehicles
      .filter((v) => !v.archived)
      .map((v) => {
        const fills = d.fuel
          .filter((f) => f.vehicleId === v.id && inDateRange(f.transactedAt, from, to))
          .sort((a, b) => a.transactedAt.localeCompare(b.transactedAt))
          .map((f) => toFuel(f))
        const litres = sum(fills, (f) => f.litres)
        const cost = sum(fills, (f) => f.totalAmount)
        const withDist = fills.filter((f) => f.distanceSinceLastKm > 0)
        const distance = sum(withDist, (f) => f.distanceSinceLastKm)
        const l100 = distance > 0 ? r1((sum(withDist, (f) => f.litres) / distance) * 100) : null
        return {
          plateNumber: v.plateNumber,
          vehicle: `${v.make} ${v.model}`,
          fuelType: v.fuelType,
          fills: fills.length,
          litres: r1(litres),
          cost,
          distanceKm: distance,
          l100,
          expectedL100: expectedL100(v.categoryId),
          costPerKm: distance > 0 ? Math.round((cost / distance) * 100) / 100 : null,
        }
      })
      .filter((r) => r.fills > 0)
      .sort((a, b) => b.cost - a.cost)
    return {
      columns: [
        col('plateNumber', 'Plate'),
        col('vehicle', 'Vehicle'),
        col('fuelType', 'Fuel'),
        col('fills', 'Fills', 'number', 'right'),
        col('litres', 'Litres', 'number', 'right'),
        col('cost', 'Cost', 'currency', 'right'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('l100', 'L/100 km', 'number', 'right'),
        col('expectedL100', 'Expected', 'number', 'right'),
        col('costPerKm', 'Cost/km', 'currency', 'right'),
      ],
      rows,
      totals: {
        plateNumber: `${rows.length} vehicles`,
        fills: sum(rows, (r) => r.fills),
        litres: r1(sum(rows, (r) => r.litres)),
        cost: sum(rows, (r) => r.cost),
        distanceKm: sum(rows, (r) => r.distanceKm),
      },
    }
  },
  'fuel-variance': ({ d, from, to }) => {
    const tol = d.settings.fuelVarianceTolerancePercent
    const rows = d.fuel
      .filter((f) => inDateRange(f.transactedAt, from, to))
      .map((f) => toFuel(f))
      .filter((f) => f.litresPer100Km != null)
      .map((f) => {
        const expected = expectedL100(d.vehicles.find((v) => v.id === f.vehicleId)?.categoryId)
        const variance = expected ? r1(((f.litresPer100Km - expected) / expected) * 100) : null
        return {
          transactedAt: f.transactedAt,
          plateNumber: f.vehiclePlate,
          driver: f.driverName ?? '—',
          station: f.station,
          litres: f.litres,
          distanceKm: f.distanceSinceLastKm,
          l100: f.litresPer100Km,
          expectedL100: expected,
          variance,
          flag:
            variance == null ? '—' : Math.abs(variance) > tol ? (variance > 0 ? 'Above tolerance' : 'Below tolerance') : 'Within tolerance',
        }
      })
      .filter((r) => r.variance != null && Math.abs(r.variance) > tol)
      .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    return {
      columns: [
        col('transactedAt', 'Date', 'datetime'),
        col('plateNumber', 'Vehicle'),
        col('driver', 'Driver'),
        col('station', 'Station'),
        col('litres', 'Litres', 'number', 'right'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('l100', 'L/100 km', 'number', 'right'),
        col('expectedL100', 'Expected', 'number', 'right'),
        col('variance', 'Variance', 'percent', 'right'),
        col('flag', 'Flag'),
      ],
      rows,
      totals: { transactedAt: `${rows.length} fills outside ±${tol}%` },
    }
  },
  'vehicle-cost': ({ d, from, to }) => {
    const rows = d.vehicles
      .filter((v) => !v.archived)
      .map((v) => {
        const fuelCost = sum(
          d.fuel.filter((f) => f.vehicleId === v.id && inDateRange(f.transactedAt, from, to)),
          (f) => Math.round(f.litres * f.pricePerLitre),
        )
        const maintenanceCost = sum(
          d.maintenance
            .filter((m) => m.vehicleId === v.id && m.status === 'COMPLETED' && inDateRange(m.completedAt, from, to))
            .map(toMaintenance),
          (m) => m.totalCost,
        )
        const incidentCost = sum(
          d.incidents.filter((i) => i.vehicleId === v.id && inDateRange(i.occurredAt, from, to)),
          (i) => i.estimatedCost,
        )
        const distance = sum(
          d.trips.filter((t) => t.vehicleId === v.id && t.status === 'COMPLETED' && inDateRange(t.endedAt, from, to)),
          (t) => (t.endOdometer ?? 0) - (t.startOdometer ?? 0),
        )
        const total = fuelCost + maintenanceCost + incidentCost
        return {
          plateNumber: v.plateNumber,
          vehicle: `${v.make} ${v.model}`,
          category: d.categories.find((c) => c.id === v.categoryId)?.name ?? '',
          fuelCost,
          maintenanceCost,
          incidentCost,
          totalCost: total,
          distanceKm: distance,
          costPerKm: distance > 0 ? Math.round((total / distance) * 100) / 100 : null,
        }
      })
      .filter((r) => r.totalCost > 0)
      .sort((a, b) => b.totalCost - a.totalCost)
    return {
      columns: [
        col('plateNumber', 'Plate'),
        col('vehicle', 'Vehicle'),
        col('category', 'Category'),
        col('fuelCost', 'Fuel', 'currency', 'right'),
        col('maintenanceCost', 'Maintenance', 'currency', 'right'),
        col('incidentCost', 'Incidents', 'currency', 'right'),
        col('totalCost', 'Total', 'currency', 'right'),
        col('distanceKm', 'Distance (km)', 'number', 'right'),
        col('costPerKm', 'Cost/km', 'currency', 'right'),
      ],
      rows,
      totals: {
        plateNumber: `${rows.length} vehicles`,
        fuelCost: sum(rows, (r) => r.fuelCost),
        maintenanceCost: sum(rows, (r) => r.maintenanceCost),
        incidentCost: sum(rows, (r) => r.incidentCost),
        totalCost: sum(rows, (r) => r.totalCost),
        distanceKm: sum(rows, (r) => r.distanceKm),
      },
    }
  },
  incidents: ({ d, from, to }) => {
    const rows = d.incidents
      .filter((i) => inDateRange(i.occurredAt, from, to))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((i) => ({
        incidentNumber: i.incidentNumber,
        occurredAt: i.occurredAt,
        plateNumber: d.vehicles.find((v) => v.id === i.vehicleId)?.plateNumber,
        driver: d.drivers.find((x) => x.id === i.driverId)?.fullName ?? '—',
        type: i.type,
        severity: i.severity,
        location: i.location,
        description: i.description,
        estimatedCost: i.estimatedCost,
        status: i.status,
      }))
    return {
      columns: [
        col('incidentNumber', 'Incident'),
        col('occurredAt', 'Occurred', 'datetime'),
        col('plateNumber', 'Vehicle'),
        col('driver', 'Driver'),
        col('type', 'Type', 'status'),
        col('severity', 'Severity', 'status'),
        col('location', 'Location'),
        col('description', 'Description'),
        col('estimatedCost', 'Est. cost', 'currency', 'right'),
        col('status', 'Status', 'status'),
      ],
      rows,
      totals: { incidentNumber: `${rows.length} incidents`, estimatedCost: sum(rows, (r) => r.estimatedCost) },
    }
  },
  'expired-documents': ({ d }) => {
    const rows = d.documents
      .map((x) => ({ x, s: documentStatus(x.expiryDate) }))
      .filter(({ s }) => s.status !== 'VALID')
      .sort((a, b) => a.s.days - b.s.days)
      .map(({ x, s }) => ({
        owner:
          x.ownerType === 'VEHICLE'
            ? d.vehicles.find((v) => v.id === x.ownerId)?.plateNumber
            : d.drivers.find((dr) => dr.id === x.ownerId)?.fullName,
        ownerType: x.ownerType,
        type: x.type,
        number: x.number,
        issueDate: x.issueDate,
        expiryDate: x.expiryDate,
        daysToExpiry: s.days,
        status: s.status,
      }))
    return {
      columns: [
        col('owner', 'Owner'),
        col('ownerType', 'Owner type', 'status'),
        col('type', 'Document', 'status'),
        col('number', 'Number'),
        col('issueDate', 'Issued', 'date'),
        col('expiryDate', 'Expires', 'date'),
        col('daysToExpiry', 'Days', 'number', 'right'),
        col('status', 'Status', 'status'),
      ],
      rows,
      totals: { owner: `${rows.length} documents` },
    }
  },
}

get('/reports', () => REPORTS, { permission: 'REPORT_VIEW' })

get(
  '/reports/:key',
  ({ params, query, user }) => {
    const def = REPORTS.find((r) => r.key === params.key)
    if (!def) throw notFound('Report')
    const d = getDb()
    const to = query.to ?? format(new Date(), 'yyyy-MM-dd')
    const from = query.from ?? format(subDays(parseISO(to), 29), 'yyyy-MM-dd')
    const date = query.date ?? format(new Date(), 'yyyy-MM-dd')
    const built = builders[def.key]({ d, from, to, date })
    if (query.export)
      recordAudit({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'EXPORT',
        entityType: 'REPORT',
        entityId: null,
        entityLabel: `${def.name} (${query.export})`,
        changes: null,
      })
    return {
      key: def.key,
      name: def.name,
      generatedAt: new Date().toISOString(),
      from: def.supportsDateRange ? from : null,
      to: def.supportsDateRange ? to : null,
      date: def.supportsDateRange ? null : date,
      ...built,
      // KPIs and chart series are part of the contract so the server-rendered PDF
      // and the screen draw the same visuals from the same numbers.
      summary: buildSummary(def.key, { d, from, to, date, rows: built.rows }),
    }
  },
  { permission: 'REPORT_VIEW' },
)
