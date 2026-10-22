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
 * linked to, the vehicle currently assigned, every trip ahead of them and their recent history,
 * all their fuel allocations and the problems they have reported. The page splits this into
 * "My day" (what needs attention now), "Trips" and "Fuel". Office staff who hold a driver permission but no driver
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
        trips: { active: null, upcoming: [], history: [], recent: [] },
        fuelAllocations: [],
        maintenance: [],
      }
    const assignment = currentAssignmentOfDriver(driver.id)
    const vehicle = assignment ? toVehicle(vehicleById(assignment.vehicleId)) : null
    const mine = d.trips.filter((t) => t.driverId === driver.id)
    const active = mine.find((t) => t.status === 'IN_PROGRESS') ?? null
    // Every trip still ahead of the driver; the page decides which of them belong to "today".
    const upcoming = mine
      .filter((t) => ['PLANNED', 'DISPATCHED'].includes(t.status))
      .sort((a, b) => a.scheduledStartAt.localeCompare(b.scheduledStartAt))
    const history = mine
      .filter((t) => ['COMPLETED', 'CANCELLED'].includes(t.status))
      .sort((a, b) => (b.endedAt ?? b.updatedAt).localeCompare(a.endedAt ?? a.updatedAt))
      .slice(0, 50)
    const allocations = d.fuelRequests.filter((r) => r.driverId === driver.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    const maintenance = d.maintenance
      .filter((m) => m.reportedById === user.id || (vehicle && m.vehicleId === vehicle.id && OPEN_MAINTENANCE.includes(m.status)))
      .sort((a, b) => b.reportedAt.localeCompare(a.reportedAt))
      .slice(0, 6)
    return {
      driver: toDriver(driver),
      vehicle,
      licence: documentStatus(driver.licenseExpiry),
      trips: {
        active: active ? toTrip(active) : null,
        upcoming: upcoming.map(toTrip),
        history: history.map(toTrip),
        recent: history
          .filter((t) => t.status === 'COMPLETED')
          .slice(0, 5)
          .map(toTrip),
      },
      fuelAllocations: allocations.map(toFuelRequest),
      maintenance: maintenance.map(toMaintenance),
    }
  },
  { permission: DRIVER_PERMISSIONS },
)
