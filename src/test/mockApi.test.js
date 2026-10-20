import { beforeEach, describe, expect, it } from 'vitest'
import { api, http, normaliseError } from '@/api/client'
import { useAuthStore } from '@/auth/authStore'
import { resetDb, getDb } from '@/api/mock/db'
import { DEMO_PASSWORD } from '@/api/mock/seed'

/** Signs in through the real client + mock adapter and stores the session. */
async function signIn(email) {
  const data = await http.post('/auth/login', { email, password: DEMO_PASSWORD }, { skipAuth: true, skipRefresh: true })
  useAuthStore.getState().setSession(data)
  return data.user
}

const fail = (p) =>
  p.then(
    () => {
      throw new Error('expected request to fail')
    },
    (e) => normaliseError(e),
  )

describe('mock API behaves like the Spring Boot contract', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  it('rejects bad credentials and accepts demo accounts', async () => {
    const err = await fail(http.post('/auth/login', { email: 'admin@limoz.rw', password: 'wrong' }, { skipAuth: true, skipRefresh: true }))
    expect(err.status).toBe(401)
    const user = await signIn('fleet@limoz.rw')
    expect(user.role).toBe('FLEET_MANAGER')
    expect(user.permissions).toContain('VEHICLE_CREATE')
  })

  it('requires authentication and enforces role permissions on the backend', async () => {
    const unauth = await fail(http.get('/vehicles'))
    expect(unauth.status).toBe(401)
    await signIn('viewer@limoz.rw')
    const list = await http.get('/vehicles', { params: { size: 5 } })
    expect(list.content).toHaveLength(5)
    expect(list.totalElements).toBeGreaterThan(20)
    const forbidden = await fail(http.post('/vehicles', {}))
    expect(forbidden.status).toBe(403)
    expect(forbidden.isForbidden).toBe(true)
  })

  it('validates vehicle creation and blocks duplicate plates', async () => {
    await signIn('fleet@limoz.rw')
    const invalid = await fail(http.post('/vehicles', { plateNumber: '' }))
    expect(invalid.status).toBe(400)
    expect(invalid.fieldErrorMap.plateNumber).toBeDefined()
    const existing = getDb().vehicles[0].plateNumber
    const body = {
      plateNumber: existing,
      fleetNumber: 'LMZ-999',
      make: 'Toyota',
      model: 'Hilux',
      year: 2024,
      categoryId: getDb().categories[0].id,
      fuelType: 'DIESEL',
      transmission: 'MANUAL',
      color: 'White',
      odometerKm: 10,
      seatingCapacity: 5,
      status: 'AVAILABLE',
    }
    const dup = await fail(http.post('/vehicles', body))
    expect(dup.status).toBe(409)
    const created = await http.post('/vehicles', { ...body, plateNumber: 'RAZ 999 Z' })
    expect(created.plateNumber).toBe('RAZ 999 Z')
    expect(getDb().audit[0]).toMatchObject({ action: 'CREATE', entityType: 'VEHICLE', entityLabel: 'RAZ 999 Z' })
  })

  it('prevents conflicting driver assignments and keeps history', async () => {
    await signIn('dispatch@limoz.rw')
    const d = getDb()
    const free = d.vehicles.find((v) => v.status === 'AVAILABLE')
    const busyDriver = d.assignments.find((a) => a.status === 'ACTIVE').driverId
    const conflict = await fail(http.post('/assignments', { vehicleId: free.id, driverId: busyDriver, purpose: 'Test' }))
    expect(conflict.status).toBe(422)
    expect(conflict.message).toMatch(/already assigned/i)
    const freeDriver = d.drivers.find((x) => x.status === 'AVAILABLE')
    const before = d.assignments.length
    const a = await http.post('/assignments', { vehicleId: free.id, driverId: freeDriver.id, purpose: 'Pool' })
    expect(a.status).toBe('ACTIVE')
    expect(d.assignments.length).toBe(before + 1)
    const ended = await http.patch(`/assignments/${a.id}/end`, { odometerAtEnd: a.odometerAtStart + 120 })
    expect(ended.status).toBe('ENDED')
    expect(d.assignments.length).toBe(before + 1) // never deleted
  })

  it('calculates trip distance from odometer readings on completion', async () => {
    await signIn('dispatch@limoz.rw')
    const d = getDb()
    const assignment = d.assignments.find(
      (a) =>
        a.status === 'ACTIVE' &&
        d.vehicles.find((v) => v.id === a.vehicleId)?.status === 'ASSIGNED' &&
        d.drivers.find((x) => x.id === a.driverId)?.status === 'ASSIGNED',
    )
    const vehicle = d.vehicles.find((v) => v.id === assignment.vehicleId)
    const trip = await http.post('/trips', {
      vehicleId: vehicle.id,
      driverId: assignment.driverId,
      startLocation: 'Depot',
      destination: 'Airport',
      scheduledStartAt: new Date(Date.now() + 10 * 3600_000).toISOString(),
      purpose: 'Test',
      passengers: 2,
    })
    expect(trip.status).toBe('PLANNED')
    await http.patch(`/trips/${trip.id}/status`, { status: 'DISPATCHED' })
    const started = await http.patch(`/trips/${trip.id}/status`, { status: 'IN_PROGRESS' })
    expect(started.startOdometer).toBe(vehicle.odometerKm)
    expect(getDb().vehicles.find((v) => v.id === vehicle.id).status).toBe('ON_TRIP')
    const badOdo = await fail(http.patch(`/trips/${trip.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer - 5 }))
    expect(badOdo.status).toBe(400)
    const done = await http.patch(`/trips/${trip.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer + 42 })
    expect(done.distanceKm).toBe(42)
    expect(done.durationMinutes).toBeGreaterThanOrEqual(0)
    expect(getDb().vehicles.find((v) => v.id === vehicle.id).odometerKm).toBe(started.startOdometer + 42)
  })

  it('computes fuel cost and consumption and flags anomalies', async () => {
    await signIn('finance@limoz.rw')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.status !== 'INACTIVE' && v.fuelType === 'DIESEL')
    const litres = 40
    const price = 1720
    const created = await http.post('/fuel', {
      vehicleId: vehicle.id,
      station: 'SP Kacyiru',
      transactedAt: new Date().toISOString(),
      fuelType: 'DIESEL',
      litres,
      pricePerLitre: price,
      odometerKm: vehicle.odometerKm,
    })
    expect(created.totalAmount).toBe(litres * price)
    expect(created.litresPer100Km === null || created.litresPer100Km > 0).toBe(true)
    const negative = await fail(
      http.post('/fuel', {
        vehicleId: vehicle.id,
        station: 'SP Kacyiru',
        transactedAt: new Date().toISOString(),
        fuelType: 'DIESEL',
        litres: -1,
        pricePerLitre: price,
        odometerKm: vehicle.odometerKm,
      }),
    )
    expect(negative.fieldErrorMap.litres).toMatch(/greater than zero/i)
    const wrongFuel = await fail(
      http.post('/fuel', {
        vehicleId: vehicle.id,
        station: 'SP Kacyiru',
        transactedAt: new Date().toISOString(),
        fuelType: 'PETROL',
        litres: 10,
        pricePerLitre: price,
        odometerKm: vehicle.odometerKm,
      }),
    )
    expect(wrongFuel.status).toBe(422)
  })

  it('walks maintenance through its workflow and frees the vehicle', async () => {
    await signIn('workshop@limoz.rw')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.status === 'AVAILABLE')
    const job = await http.post('/maintenance', {
      vehicleId: vehicle.id,
      complaint: 'Brake pads worn',
      type: 'CORRECTIVE',
      workshop: 'LIMOZ Workshop (Gikondo)',
      odometerKm: vehicle.odometerKm,
      laborCost: 50000,
    })
    expect(job.status).toBe('REPORTED')
    const skip = await fail(http.patch(`/maintenance/${job.id}/status`, { status: 'COMPLETED' }))
    expect(skip.status).toBe(422)
    await http.patch(`/maintenance/${job.id}/status`, { status: 'APPROVED' })
    const noTech = await fail(http.patch(`/maintenance/${job.id}/status`, { status: 'IN_PROGRESS' }))
    expect(noTech.fieldErrorMap.technicianName).toBeDefined()
    await http.patch(`/maintenance/${job.id}/status`, { status: 'IN_PROGRESS', technicianName: 'Claude Hakizimana' })
    expect(getDb().vehicles.find((v) => v.id === vehicle.id).status).toBe('IN_MAINTENANCE')
    const done = await http.patch(`/maintenance/${job.id}/status`, { status: 'COMPLETED', servicePerformed: 'Replaced pads' })
    expect(done.totalCost).toBe(50000)
    expect(getDb().vehicles.find((v) => v.id === vehicle.id).status).toBe('AVAILABLE')
  })

  it('dashboard summary is derived from the database', async () => {
    await signIn('management@limoz.rw')
    const s = await http.get('/dashboard/summary')
    const d = getDb()
    const live = d.vehicles.filter((v) => !v.archived)
    expect(s.totalVehicles).toBe(live.length)
    expect(s.availableVehicles).toBe(live.filter((v) => v.status === 'AVAILABLE').length)
    expect(s.inWorkshopVehicles).toBe(live.filter((v) => v.status === 'IN_MAINTENANCE').length)
    expect(s.fuelCost).toBeGreaterThan(0)
    const status = await http.get('/dashboard/fleet-status')
    expect(status.reduce((n, r) => n + r.count, 0)).toBe(live.length)
  })

  it('refreshes an expired access token transparently', async () => {
    await signIn('admin@limoz.rw')
    useAuthStore.setState({ accessToken: 'eyJ.e30.bad' })
    const me = await api.get('/auth/me').then((r) => r.data)
    expect(me.email).toBe('admin@limoz.rw')
    expect(useAuthStore.getState().accessToken).not.toBe('eyJ.e30.bad')
  })
})

describe('roles, departments and incident ownership', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  it('users get their permissions through a role, which an administrator can create and change', async () => {
    await signIn('it@limoz.rw')
    const role = await http.post('/roles', {
      name: 'Fuel clerk',
      description: 'Records fuel only',
      permissions: ['FUEL_READ', 'FUEL_MANAGE'],
    })
    expect(role.code).toBe('FUEL_CLERK')
    expect(role.userCount).toBe(0)
    const invalid = await fail(http.post('/roles', { name: 'Nobody', permissions: [] }))
    expect(invalid.fieldErrorMap.permissions).toBeDefined()
    const unknown = await fail(http.post('/roles', { name: 'Odd', permissions: ['NOT_A_PERMISSION'] }))
    expect(unknown.status).toBe(400)

    const dept = getDb().departments.find((d) => d.code === 'FINANCE')
    const created = await http.post('/users', {
      firstName: 'Aline',
      lastName: 'Uwase',
      email: 'aline@limoz.rw',
      roleId: role.id,
      departmentId: dept.id,
      password: DEMO_PASSWORD,
    })
    expect(created.role).toBe('FUEL_CLERK')
    expect(created.departmentName).toBe('Finance')
    expect(created.roleName).toBe('Fuel clerk')

    useAuthStore.getState().clearSession()
    const aline = await signIn('aline@limoz.rw')
    expect(aline.permissions).toEqual(['FUEL_READ', 'FUEL_MANAGE'])
    expect(aline.department).toMatchObject({ name: 'Finance' })
    const forbidden = await fail(http.get('/vehicles'))
    expect(forbidden.status).toBe(403)

    // Widening the role widens what the user can do the next time they are checked.
    useAuthStore.getState().clearSession()
    await signIn('it@limoz.rw')
    await http.put(`/roles/${role.id}`, { name: 'Fuel clerk', permissions: ['FUEL_READ', 'FUEL_MANAGE', 'VEHICLE_READ'] })
    const inUse = await fail(http.delete(`/roles/${role.id}`))
    expect(inUse.status).toBe(409)
    useAuthStore.getState().clearSession()
    await signIn('aline@limoz.rw')
    const vehicles = await http.get('/vehicles', { params: { size: 1 } })
    expect(vehicles.content).toHaveLength(1)
  })

  it('protects the super admin role and requires a role and department on every account', async () => {
    await signIn('admin@limoz.rw')
    const superAdmin = getDb().roles.find((r) => r.code === 'SUPER_ADMIN')
    const locked = await fail(http.delete(`/roles/${superAdmin.id}`))
    expect(locked.status).toBe(422)
    const trimmed = await http.put(`/roles/${superAdmin.id}`, { name: 'Super admin', permissions: ['DASHBOARD_VIEW'] })
    expect(trimmed.permissions.length).toBeGreaterThan(20)
    const missing = await fail(http.post('/users', { firstName: 'X', lastName: 'Y', email: 'xy@limoz.rw', password: 'Limoz#2026x' }))
    expect(missing.fieldErrorMap.roleId).toBeDefined()
    expect(missing.fieldErrorMap.departmentId).toBeDefined()
  })

  it('assigns incidents to a department, notifies its members and needs a note to hand over', async () => {
    await signIn('dispatch@limoz.rw')
    const d = getDb()
    const ops = d.departments.find((x) => x.code === 'OPS')
    const workshop = d.departments.find((x) => x.code === 'WORKSHOP')
    const vehicle = d.vehicles.find((v) => v.status === 'AVAILABLE')
    const base = {
      vehicleId: vehicle.id,
      occurredAt: new Date(Date.now() - 3600_000).toISOString(),
      location: 'Kigali Heights',
      type: 'DAMAGE',
      severity: 'LOW',
      description: 'Scratched rear bumper while parking.',
    }
    const noDept = await fail(http.post('/incidents', base))
    expect(noDept.fieldErrorMap.departmentId).toBeDefined()

    const notifBefore = d.notifications.length
    const incident = await http.post('/incidents', { ...base, departmentId: ops.id })
    expect(incident.departmentName).toBe('Fleet Operations')
    const opsMembers = d.users.filter((u) => u.departmentId === ops.id && u.active && u.email !== 'dispatch@limoz.rw')
    expect(d.notifications.length - notifBefore).toBe(opsMembers.length)
    expect(d.notifications[0]).toMatchObject({ link: `/incidents/${incident.id}`, kind: 'ALERT' })

    const noNote = await fail(http.patch(`/incidents/${incident.id}/department`, { departmentId: workshop.id, note: '' }))
    expect(noNote.fieldErrorMap.note).toBeDefined()
    const same = await fail(http.patch(`/incidents/${incident.id}/department`, { departmentId: ops.id, note: 'Keep it with ops please.' }))
    expect(same.fieldErrorMap.departmentId).toBeDefined()

    const before = d.notifications.length
    const moved = await http.patch(`/incidents/${incident.id}/department`, {
      departmentId: workshop.id,
      note: 'Bumper needs repair before the next hire.',
    })
    expect(moved.departmentName).toBe('Workshop')
    expect(moved.history.at(-1)).toMatchObject({ action: 'Reassigned to Workshop' })
    expect(moved.history.at(-1).note).toContain('Bumper needs repair')
    const workshopMembers = d.users.filter((u) => u.departmentId === workshop.id && u.active)
    expect(d.notifications.length - before).toBe(workshopMembers.length)
    expect(d.audit[0]).toMatchObject({ action: 'ASSIGN', entityType: 'INCIDENT', entityLabel: moved.incidentNumber })

    // Editing the incident never moves it silently.
    const edited = await http.put(`/incidents/${incident.id}`, { ...base, departmentId: ops.id })
    expect(edited.departmentId).toBe(workshop.id)

    const byDept = await http.get('/incidents', { params: { departmentId: workshop.id } })
    expect(byDept.content.some((i) => i.id === incident.id)).toBe(true)
  })

  it('keeps departments consistent: unique codes, no deleting while in use', async () => {
    await signIn('it@limoz.rw')
    const created = await http.post('/departments', { name: 'Airport Desk', description: 'Kigali airport counter' })
    expect(created.code).toBe('AIRPORT_DESK')
    const dup = await fail(http.post('/departments', { name: 'Airport desk' }))
    expect(dup.fieldErrorMap.name).toBeDefined()
    const ops = getDb().departments.find((x) => x.code === 'OPS')
    const inUse = await fail(http.delete(`/departments/${ops.id}`))
    expect(inUse.status).toBe(409)
    await http.delete(`/departments/${created.id}`)
    expect(getDb().departments.some((x) => x.id === created.id)).toBe(false)
    const list = await http.get('/departments')
    expect(list.find((x) => x.code === 'OPS').memberCount).toBeGreaterThan(0)
  })
})

describe('driver workflow: fuel allocations, own trips and vehicle reports', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  const proof = { fileName: 'receipt.jpg', contentType: 'image/jpeg', sizeBytes: 2048, dataUrl: 'data:image/jpeg;base64,/9j/4AAQ' }

  it('the driver role holds only the three driver permissions and lands on its own workspace data', async () => {
    const driver = await signIn('driver@limoz.rw')
    expect(driver.permissions.sort()).toEqual(['FUEL_SUBMIT', 'MAINTENANCE_REPORT', 'TRIP_START'])
    expect(driver.driverId).toBe(getDb().drivers[0].id)
    expect(driver.driverName).toBe(getDb().drivers[0].fullName)
    const dashboard = await fail(http.get('/dashboard/summary'))
    expect(dashboard.status).toBe(403)
    const ws = await http.get('/me/workspace')
    expect(ws.driver.id).toBe(driver.driverId)
    expect(ws.vehicle).not.toBeNull()
    expect(ws.trips.upcoming.some((t) => t.status === 'DISPATCHED')).toBe(true)
    expect(ws.fuelAllocations.some((a) => a.status === 'PENDING')).toBe(true)
    for (const t of [...ws.trips.upcoming, ...ws.trips.recent]) expect(t.driverId).toBe(driver.driverId)
  })

  it('officer allocates fuel, driver submits the receipt, officer verifies it into a fuel transaction', async () => {
    const officer = await signIn('officer@limoz.rw')
    const d = getDb()
    const demoDriver = d.drivers[0]
    const vehicle = d.vehicles.find((v) =>
      d.assignments.some((a) => a.status === 'ACTIVE' && a.vehicleId === v.id && a.driverId === demoDriver.id),
    )
    // The seed leaves one open allocation on the demo driver; close it so a fresh one can be created.
    const seeded = d.fuelRequests.find((r) => r.driverId === demoDriver.id && r.status === 'PENDING')
    await http.patch(`/fuel/allocations/${seeded.id}/cancel`, { reason: 'Replaced by a new allocation.' })

    const invalid = await fail(http.post('/fuel/allocations', { vehicleId: vehicle.id, litres: 0 }))
    expect(invalid.fieldErrorMap.litres).toBeDefined()
    const notifBefore = d.notifications.length
    const allocation = await http.post('/fuel/allocations', {
      vehicleId: vehicle.id,
      litres: 40,
      station: 'SP Kacyiru',
      purpose: 'Airport runs',
    })
    expect(allocation.status).toBe('PENDING')
    expect(allocation.driverId).toBe(demoDriver.id) // defaults to the vehicle's current driver
    expect(allocation.requestNumber).toMatch(/^FA-\d{4}-\d{4}$/)
    expect(d.notifications.length - notifBefore).toBe(1) // the linked driver account
    expect(d.notifications[0]).toMatchObject({ link: '/my-day' })
    const duplicate = await fail(http.post('/fuel/allocations', { vehicleId: vehicle.id, litres: 20 }))
    expect(duplicate.status).toBe(409)

    // The driver only sees their own allocations and cannot read the fuel ledger.
    useAuthStore.getState().clearSession()
    await signIn('driver@limoz.rw')
    const mine = await http.get('/fuel/allocations')
    expect(mine.content.length).toBeGreaterThan(0)
    expect(mine.content.every((r) => r.driverId === demoDriver.id)).toBe(true)
    const ledger = await fail(http.get('/fuel'))
    expect(ledger.status).toBe(403)
    const other = d.fuelRequests.find((r) => r.driverId !== demoDriver.id)
    const notMine = await fail(http.get(`/fuel/allocations/${other.id}`))
    expect(notMine.status).toBe(403)

    const receipt = {
      litres: 41.5,
      pricePerLitre: 1720,
      odometerKm: vehicle.odometerKm,
      receiptNumber: 'R-TEST-0001',
      station: 'SP Kacyiru',
      transactedAt: new Date(Date.now() - 30 * 60_000).toISOString(),
      proof,
    }
    const noProof = await fail(http.patch(`/fuel/allocations/${allocation.id}/submit`, { ...receipt, proof: null }))
    expect(noProof.fieldErrorMap.proof).toBeDefined()
    const tooMuch = await fail(http.patch(`/fuel/allocations/${allocation.id}/submit`, { ...receipt, litres: 55 }))
    expect(tooMuch.status).toBe(422)
    const fuelBefore = d.fuel.length
    const submitted = await http.patch(`/fuel/allocations/${allocation.id}/submit`, receipt)
    expect(submitted.status).toBe('SUBMITTED')
    expect(submitted.submission).toMatchObject({ litres: 41.5, totalAmount: 71380, proof: { fileName: 'receipt.jpg' } })
    expect(d.fuel.length).toBe(fuelBefore) // nothing recorded until the officer verifies
    expect(d.notifications[0]).toMatchObject({ userId: officer.id, link: `/fuel/allocations/${allocation.id}` })
    const again = await fail(http.patch(`/fuel/allocations/${allocation.id}/submit`, receipt))
    expect(again.status).toBe(422)

    // The officer sends it back, the driver fixes it, the officer verifies.
    useAuthStore.getState().clearSession()
    await signIn('officer@limoz.rw')
    const driverCannot = await fail(http.patch(`/fuel/allocations/${allocation.id}/return`, { note: '' }))
    expect(driverCannot.fieldErrorMap.note).toBeDefined()
    const returned = await http.patch(`/fuel/allocations/${allocation.id}/return`, { note: 'Photo is blurry, retake it.' })
    expect(returned.status).toBe('RETURNED')
    useAuthStore.getState().clearSession()
    await signIn('driver@limoz.rw')
    const cannotVerify = await fail(http.patch(`/fuel/allocations/${allocation.id}/verify`, {}))
    expect(cannotVerify.status).toBe(403)
    const resubmitted = await http.patch(`/fuel/allocations/${allocation.id}/submit`, { ...receipt, receiptNumber: 'R-TEST-0002' })
    expect(resubmitted.status).toBe('SUBMITTED')
    expect(resubmitted.history.at(-1).action).toBe('Receipt resubmitted')
    useAuthStore.getState().clearSession()
    await signIn('officer@limoz.rw')
    const verified = await http.patch(`/fuel/allocations/${allocation.id}/verify`, { note: 'Matches the receipt.' })
    expect(verified.status).toBe('VERIFIED')
    expect(verified.fuelTransactionId).toBeDefined()
    expect(d.fuel.length).toBe(fuelBefore + 1)
    const fuel = await http.get(`/fuel/${verified.fuelTransactionId}`)
    expect(fuel).toMatchObject({
      litres: 41.5,
      receiptNumber: 'R-TEST-0002',
      allocationId: allocation.id,
      allocationNumber: allocation.requestNumber,
    })
    expect(fuel.driverId).toBe(demoDriver.id)
    expect(d.audit[0]).toMatchObject({ action: 'APPROVE', entityType: 'FUEL_ALLOCATION', entityLabel: allocation.requestNumber })
    const summary = await http.get('/fuel/allocations/summary')
    expect(summary.verifiedThisMonth).toBeGreaterThan(0)
  })

  it('a driver starts and completes only their own dispatched trips', async () => {
    const driver = await signIn('driver@limoz.rw')
    const d = getDb()
    const own = d.trips.find((t) => t.driverId === driver.driverId && t.status === 'DISPATCHED')
    const others = d.trips.find((t) => t.driverId !== driver.driverId && t.status === 'DISPATCHED')
    const list = await http.get('/trips', { params: { size: 100 } })
    expect(list.content.every((t) => t.driverId === driver.driverId)).toBe(true)
    const peek = await fail(http.get(`/trips/${others.id}`))
    expect(peek.status).toBe(403)
    const startOthers = await fail(http.patch(`/trips/${others.id}/status`, { status: 'IN_PROGRESS' }))
    expect(startOthers.status).toBe(403)
    const cancel = await fail(http.patch(`/trips/${own.id}/status`, { status: 'CANCELLED', reason: 'Nope' }))
    expect(cancel.status).toBe(403)
    const plan = await fail(http.post('/trips', {}))
    expect(plan.status).toBe(403)

    const started = await http.patch(`/trips/${own.id}/status`, { status: 'IN_PROGRESS' })
    expect(started.status).toBe('IN_PROGRESS')
    expect(d.vehicles.find((v) => v.id === own.vehicleId).status).toBe('ON_TRIP')
    const ws = await http.get('/me/workspace')
    expect(ws.trips.active.id).toBe(own.id)
    const done = await http.patch(`/trips/${own.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer + 18 })
    expect(done.distanceKm).toBe(18)
    expect(d.audit[0]).toMatchObject({ action: 'STATUS_CHANGE', entityType: 'TRIP', userId: driver.id })
  })

  it('a driver reports the vehicle they drive and the workshop is notified', async () => {
    const driver = await signIn('driver@limoz.rw')
    const d = getDb()
    const own = d.assignments.find((a) => a.status === 'ACTIVE' && a.driverId === driver.driverId).vehicleId
    const someoneElses = d.vehicles.find((v) => v.id !== own && !v.archived)
    const cannotOpenWorkOrder = await fail(
      http.post('/maintenance', { vehicleId: own, complaint: 'x', type: 'CORRECTIVE', workshop: 'w', odometerKm: 1 }),
    )
    expect(cannotOpenWorkOrder.status).toBe(403)
    const wrongVehicle = await fail(
      http.post('/maintenance/report', { vehicleId: someoneElses.id, complaint: 'Brakes squeal when stopping' }),
    )
    expect(wrongVehicle.status).toBe(403)
    const tooShort = await fail(http.post('/maintenance/report', { complaint: 'bad' }))
    expect(tooShort.fieldErrorMap.complaint).toBeDefined()

    const workshopUsers = d.users.filter(
      (u) => u.active && d.roles.find((r) => r.id === u.roleId).permissions.includes('MAINTENANCE_MANAGE'),
    )
    const before = d.notifications.length
    const report = await http.post('/maintenance/report', { complaint: 'Brakes squeal when stopping', urgent: true })
    expect(report).toMatchObject({ vehicleId: own, status: 'REPORTED', type: 'CORRECTIVE', workshop: null })
    expect(report.maintenanceNumber).toMatch(/^MT-/)
    expect(d.vehicles.find((v) => v.id === own).status).toBe('OUT_OF_SERVICE')
    expect(d.notifications.length - before).toBe(workshopUsers.length)
    expect(d.notifications[0]).toMatchObject({ link: `/maintenance/${report.id}`, kind: 'ALERT' })
    const duplicate = await fail(http.post('/maintenance/report', { complaint: 'Brakes squeal when stopping' }))
    expect(duplicate.status).toBe(409)
    const ws = await http.get('/me/workspace')
    expect(ws.maintenance.some((m) => m.id === report.id)).toBe(true)

    // The workshop picks the report up through the normal work-order flow.
    useAuthStore.getState().clearSession()
    await signIn('workshop@limoz.rw')
    const approved = await http.patch(`/maintenance/${report.id}/status`, { status: 'APPROVED' })
    expect(approved.status).toBe('APPROVED')
  })

  it('an administrator links an account to one driver profile at most once', async () => {
    await signIn('it@limoz.rw')
    const d = getDb()
    const driverRole = d.roles.find((r) => r.code === 'DRIVER')
    const dept = d.departments.find((x) => x.code === 'OPS')
    const taken = d.drivers[0]
    const free = d.drivers.find((x) => !d.users.some((u) => u.driverId === x.id) && !x.archived && x.status === 'AVAILABLE')
    const clash = await fail(
      http.post('/users', {
        firstName: 'Twin',
        lastName: 'Driver',
        email: 'twin@limoz.rw',
        roleId: driverRole.id,
        departmentId: dept.id,
        driverId: taken.id,
        password: DEMO_PASSWORD,
      }),
    )
    expect(clash.fieldErrorMap.driverId).toContain('already linked')
    const created = await http.post('/users', {
      firstName: 'New',
      lastName: 'Driver',
      email: 'new.driver@limoz.rw',
      roleId: driverRole.id,
      departmentId: dept.id,
      driverId: free.id,
      password: DEMO_PASSWORD,
    })
    expect(created.driverName).toBe(free.fullName)
    useAuthStore.getState().clearSession()
    const session = await signIn('new.driver@limoz.rw')
    expect(session.driverId).toBe(free.id)
    const ws = await http.get('/me/workspace')
    expect(ws.driver.id).toBe(free.id)
  })
})
