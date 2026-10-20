import { addDays, startOfDay } from 'date-fns'
import { get } from '../router'
import { getDb } from '../db'
import { DRIVER_PERMISSIONS } from '../core'
import {
  currentAssignmentOfDriver,
  documentStatus,
  driverOfUser,
  toDriver,
  toFuelRequest,
  toMaintenance,
  toTrip,
  toVehicle,
  vehicleById,
} from '../mappers'

const OPEN_MAINTENANCE = ['REPORTED', 'INSPECTION', 'APPROVED', 'IN_PROGRESS', 'WAITING_FOR_PARTS']

/**
 * Everything the driver workspace ("My day") needs in one call: the driver profile the account is
 * linked to, the vehicle currently assigned, trips to start or complete, fuel allocations to fulfil
 * and the problems the driver has reported. Office staff who hold a driver permission but no driver
 * link get an empty workspace rather than an error.
 */
get(
  '/me/workspace',
  ({ user }) => {
    const d = getDb()
    const driver = driverOfUser(user)
    if (!driver)
      return {
        driver: null,
        vehicle: null,
        licence: null,
        trips: { active: null, upcoming: [], recent: [] },
        fuelAllocations: [],
        maintenance: [],
      }
    const assignment = currentAssignmentOfDriver(driver.id)
    const vehicle = assignment ? toVehicle(vehicleById(assignment.vehicleId)) : null
    const horizon = addDays(startOfDay(new Date()), 3).toISOString()
    const mine = d.trips.filter((t) => t.driverId === driver.id)
    const active = mine.find((t) => t.status === 'IN_PROGRESS') ?? null
    const upcoming = mine
      .filter((t) => ['PLANNED', 'DISPATCHED'].includes(t.status) && t.scheduledStartAt < horizon)
      .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
    const recent = mine
      .filter((t) => t.status === 'COMPLETED')
      .sort((a, b) => b.endedAt.localeCompare(a.endedAt))
      .slice(0, 5)
    const allocations = d.fuelRequests.filter((r) => r.driverId === driver.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const openAllocations = allocations.filter((r) => ['PENDING', 'RETURNED', 'SUBMITTED'].includes(r.status))
    const closedAllocations = allocations.filter((r) => !['PENDING', 'RETURNED', 'SUBMITTED'].includes(r.status)).slice(0, 3)
    const maintenance = d.maintenance
      .filter((m) => m.reportedById === user.id || (vehicle && m.vehicleId === vehicle.id && OPEN_MAINTENANCE.includes(m.status)))
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
      .slice(0, 6)
    return {
      driver: toDriver(driver),
      vehicle,
      licence: documentStatus(driver.licenseExpiry),
      trips: { active: active ? toTrip(active) : null, upcoming: upcoming.map(toTrip), recent: recent.map(toTrip) },
      fuelAllocations: [...openAllocations, ...closedAllocations].map(toFuelRequest),
      maintenance: maintenance.map(toMaintenance),
    }
  },
  { permission: DRIVER_PERMISSIONS },
)
