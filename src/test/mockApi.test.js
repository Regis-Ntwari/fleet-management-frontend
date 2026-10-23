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
      owner: 'LIMOZ',
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
    const lpo = d.purchaseOrders.find((o) => !o.closedAt)
    const company = d.companies.find((c) => c.code === 'GORILLAND')
    // Clear what the seed planned for this vehicle and driver so the new deployment cannot clash.
    for (const t of d.deployments.filter(
      (t) => ['PLANNED', 'DISPATCHED'].includes(t.status) && (t.vehicleId === vehicle.id || t.driverId === assignment.driverId),
    ))
      await http.patch(`/deployments/${t.id}/status`, { status: 'CANCELLED', reason: 'test fixture' })
    const missing = await fail(http.post('/deployments', { vehicleId: vehicle.id, driverId: assignment.driverId }))
    expect(missing.status).toBe(400)
    expect(missing.fieldErrorMap.purchaseOrderId).toBeDefined()
    const trip = await http.post('/deployments', {
      companyId: company.id,
      vehicleId: vehicle.id,
      driverId: assignment.driverId,
      institution: lpo.institution,
      purchaseOrderId: lpo.id,
      effectiveDays: 3,
      tariffId: d.tariffs[0].id,
      owner: vehicle.owner,
      startLocation: 'Depot',
      destination: 'Airport',
      scheduledStartAt: new Date(Date.now() + 10 * 3600_000).toISOString(),
      purpose: 'Test',
      passengers: 2,
    })
    expect(trip.status).toBe('PLANNED')
    // Numbered per company and series: GSL1/00001/2026 style, with the LPO date and amount coming from the linked order.
    expect(trip.deploymentNumber).toMatch(
      new RegExp(`^GSL${vehicle.owner === 'SUBCONTRACTOR' ? 2 : 1}/\\d{5}/${new Date().getFullYear()}$`),
    )
    expect(trip.lpoNumber).toBe(lpo.lpoNumber)
    expect(trip.lpoDate).toBe(lpo.receivedOn)
    expect(trip.amount).toBe(d.tariffs[0].dailyRate * 3)
    if (vehicle.owner !== 'SUBCONTRACTOR') expect(trip.driverMission).toBe(5_000 + 2 * 15_000)
    await http.patch(`/deployments/${trip.id}/status`, { status: 'DISPATCHED' })
    const started = await http.patch(`/deployments/${trip.id}/status`, { status: 'IN_PROGRESS' })
    expect(started.startOdometer).toBe(vehicle.odometerKm)
    expect(getDb().vehicles.find((v) => v.id === vehicle.id).status).toBe('ON_TRIP')
    const badOdo = await fail(http.patch(`/deployments/${trip.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer - 5 }))
    expect(badOdo.status).toBe(400)
    const done = await http.patch(`/deployments/${trip.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer + 42 })
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
    expect(driver.permissions.sort()).toEqual(['DEPLOYMENT_START', 'FUEL_SUBMIT', 'MAINTENANCE_REPORT'])
    expect(driver.driverId).toBe(getDb().drivers[0].id)
    expect(driver.driverName).toBe(getDb().drivers[0].fullName)
    const dashboard = await fail(http.get('/dashboard/summary'))
    expect(dashboard.status).toBe(403)
    const ws = await http.get('/me/workspace')
    expect(ws.driver.id).toBe(driver.driverId)
    expect(ws.vehicle).not.toBeNull()
    expect(ws.deployments.upcoming.some((t) => t.status === 'DISPATCHED')).toBe(true)
    expect(ws.fuelAllocations.some((a) => a.status === 'PENDING')).toBe(true)
    for (const t of [...ws.deployments.upcoming, ...ws.deployments.recent]) expect(t.driverId).toBe(driver.driverId)
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
    expect(d.notifications[0]).toMatchObject({ link: '/my-trips' })
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
    const own = d.deployments.find((t) => t.driverId === driver.driverId && t.status === 'DISPATCHED')
    const others = d.deployments.find((t) => t.driverId !== driver.driverId && t.status === 'DISPATCHED')
    const list = await http.get('/deployments', { params: { size: 100 } })
    expect(list.content.every((t) => t.driverId === driver.driverId)).toBe(true)
    const peek = await fail(http.get(`/deployments/${others.id}`))
    expect(peek.status).toBe(403)
    const startOthers = await fail(http.patch(`/deployments/${others.id}/status`, { status: 'IN_PROGRESS' }))
    expect(startOthers.status).toBe(403)
    const cancel = await fail(http.patch(`/deployments/${own.id}/status`, { status: 'CANCELLED', reason: 'Nope' }))
    expect(cancel.status).toBe(403)
    const plan = await fail(http.post('/deployments', {}))
    expect(plan.status).toBe(403)

    const started = await http.patch(`/deployments/${own.id}/status`, { status: 'IN_PROGRESS' })
    expect(started.status).toBe('IN_PROGRESS')
    expect(d.vehicles.find((v) => v.id === own.vehicleId).status).toBe('ON_TRIP')
    const ws = await http.get('/me/workspace')
    expect(ws.deployments.active.id).toBe(own.id)
    expect(started.departureRecordedBy).toMatchObject({ id: driver.id })
    const done = await http.patch(`/deployments/${own.id}/status`, { status: 'COMPLETED', endOdometer: started.startOdometer + 18 })
    expect(done.distanceKm).toBe(18)
    expect(d.audit[0]).toMatchObject({ action: 'STATUS_CHANGE', entityType: 'DEPLOYMENT', userId: driver.id })
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

describe('reference data is editable by administrators and feeds every dropdown', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  it('lists every dropdown source, adds a station and an incident type, and forms pick them up', async () => {
    await signIn('it@limoz.rw')
    const lists = await http.get('/lookups')
    const keys = lists.map((l) => l.key)
    for (const k of [
      'fuelStations',
      'workshops',
      'technicians',
      'locations',
      'incidentTypes',
      'documentTypes',
      'employmentStatuses',
      'deploymentStatuses',
    ])
      expect(keys).toContain(k)
    const station = await http.post('/lookups/fuelStations/items', { label: 'Kobil Nyamirambo' })
    expect(station).toMatchObject({ value: 'Kobil Nyamirambo', active: true, usageCount: 0 })
    const dup = await fail(http.post('/lookups/fuelStations/items', { label: 'kobil nyamirambo' }))
    expect(dup.status).toBe(409)
    const type = await http.post('/lookups/incidentTypes/items', { label: 'Near miss', tone: 'warning' })
    expect(type.value).toBe('NEAR_MISS')
    const ref = await http.get('/reference')
    expect(ref.fuelStations.map((s) => s.label)).toContain('Kobil Nyamirambo')
    expect(ref.incidentTypes.find((t) => t.value === 'NEAR_MISS')).toMatchObject({ label: 'Near miss', tone: 'warning' })

    // The new type is immediately valid on the incident form.
    useAuthStore.getState().clearSession()
    await signIn('dispatch@limoz.rw')
    const d = getDb()
    const incident = await http.post('/incidents', {
      vehicleId: d.vehicles[0].id,
      occurredAt: new Date(Date.now() - 3600_000).toISOString(),
      location: 'Kacyiru',
      type: 'NEAR_MISS',
      severity: 'LOW',
      description: 'Pedestrian stepped out at the roundabout.',
      departmentId: d.departments[0].id,
    })
    expect(incident.type).toBe('NEAR_MISS')
    const forbidden = await fail(http.get('/lookups'))
    expect(forbidden.status).toBe(403)
  })

  it('protects values in use and those business rules depend on, but lets them be renamed', async () => {
    await signIn('admin@limoz.rw')
    const fuel = await http.get('/lookups/fuelTypes')
    const diesel = fuel.items.find((i) => i.value === 'DIESEL')
    expect(diesel.system).toBe(true)
    expect(diesel.usageCount).toBeGreaterThan(0)
    const locked = await fail(http.delete(`/lookups/fuelTypes/items/${diesel.id}`))
    expect(locked.status).toBe(422)
    const renamed = await http.put(`/lookups/fuelTypes/items/${diesel.id}`, { label: 'Diesel (AGO)', tone: 'info' })
    expect(renamed).toMatchObject({ value: 'DIESEL', label: 'Diesel (AGO)', tone: 'info' })
    expect((await http.get('/reference')).fuelTypes.find((f) => f.value === 'DIESEL').label).toBe('Diesel (AGO)')

    const types = await http.get('/lookups/incidentTypes')
    const theft = types.items.find((i) => i.value === 'THEFT')
    if (theft.usageCount) {
      const inUse = await fail(http.delete(`/lookups/incidentTypes/items/${theft.id}`))
      expect(inUse.status).toBe(409)
    }
    const retired = await http.patch(`/lookups/incidentTypes/items/${theft.id}/status`, { active: false })
    expect(retired.active).toBe(false)
    expect((await http.get('/reference')).incidentTypes.some((t) => t.value === 'THEFT')).toBe(false)
    expect(getDb().lookups.some((r) => r.list === 'incidentTypes' && r.value === 'THEFT')).toBe(true)

    const statuses = await http.get('/lookups/deploymentStatuses')
    const noAdd = await fail(http.post('/lookups/deploymentStatuses/items', { label: 'Paused' }))
    expect(noAdd.status).toBe(422)
    const noRetire = await fail(http.patch(`/lookups/deploymentStatuses/items/${statuses.items[0].id}/status`, { active: false }))
    expect(noRetire.status).toBe(422)

    const order = await http.put('/lookups/fuelStations/order', {
      ids: (await http.get('/lookups/fuelStations')).items.map((i) => i.id).reverse(),
    })
    expect(order.items[0].label).toBe('Depot bowser (Gikondo)')
    expect(getDb().audit[0]).toMatchObject({ entityType: 'REFERENCE_LIST' })
  })
})

describe('commerce, deployments, gate and company stock (fleet operations changes)', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  it('an account manager registers LPOs; duplicates per institution are refused and amendments are audited', async () => {
    const me = await signIn('accounts@limoz.rw')
    expect(me.permissions).toContain('ORDER_MANAGE')
    const managers = await http.get('/purchase-orders/account-managers')
    expect(managers.some((m) => m.id === me.id)).toBe(true)
    const body = {
      lpoNumber: 'NO.102/F.Y.25.27',
      institution: 'Bank of Kigali',
      accountManagerId: me.id,
      receivedOn: '2026-10-01',
      durationDays: 30,
      description: 'Vehicle for the Gakenke mission',
      amount: 463_500,
      currency: 'RWF',
    }
    const created = await http.post('/purchase-orders', body)
    expect(created.status).toBe('OPEN')
    expect(created.expiresOn).toBe('2026-10-31')
    expect(created.originalAmount).toBe(463_500)
    const dup = await fail(http.post('/purchase-orders', body))
    expect(dup.status).toBe(409)
    const other = await http.post('/purchase-orders', { ...body, institution: 'MTN Rwanda' })
    expect(other.id).not.toBe(created.id)
    const amended = await http.put(`/purchase-orders/${created.id}`, { ...body, amount: 600_000 })
    expect(amended.amount).toBe(600_000)
    expect(amended.originalAmount).toBe(463_500)
    expect(getDb().audit[0]).toMatchObject({ entityType: 'PURCHASE_ORDER', action: 'UPDATE' })
    expect(getDb().audit[0].changes.some((c) => c.field === 'amount' && c.from === 463_500 && c.to === 600_000)).toBe(true)
    // Account managers cannot register deployments or touch stock.
    const forbidden = await fail(http.post('/deployments', {}))
    expect(forbidden.status).toBe(403)
  })

  it('deployments are numbered per company and series, replace keeps history, and road maps are recorded', async () => {
    await signIn('fleet@limoz.rw')
    const d = getDb()
    const gorilland = d.companies.find((c) => c.code === 'GORILLAND')
    const lpo = d.purchaseOrders.find((o) => !o.closedAt)
    const freeVehicles = d.vehicles.filter(
      (v) =>
        !v.archived &&
        v.status === 'AVAILABLE' &&
        v.owner !== 'SUBCONTRACTOR' &&
        !d.assignments.some((a) => a.vehicleId === v.id && a.status === 'ACTIVE'),
    )
    const freeDrivers = d.drivers.filter(
      (x) => !x.archived && x.status === 'AVAILABLE' && !d.assignments.some((a) => a.driverId === x.id && a.status === 'ACTIVE'),
    )
    const [v1, v2] = freeVehicles
    const [dr1] = freeDrivers
    // Clear whatever the seed planned for these resources so the new deployments cannot clash.
    for (const t of d.deployments.filter(
      (t) => ['PLANNED', 'DISPATCHED'].includes(t.status) && ([v1.id, v2.id].includes(t.vehicleId) || t.driverId === dr1.id),
    ))
      await http.patch(`/deployments/${t.id}/status`, { status: 'CANCELLED', reason: 'test fixture' })
    const start = new Date(Date.now() + 2 * 3600_000).toISOString()
    const make = (vehicle, driver, extra = {}) =>
      http.post('/deployments', {
        companyId: gorilland.id,
        vehicleId: vehicle.id,
        driverId: driver.id,
        institution: lpo.institution,
        purchaseOrderId: lpo.id,
        effectiveDays: 4,
        tariffId: d.tariffs[1].id,
        owner: vehicle.owner,
        startLocation: 'Kacyiru office',
        destination: 'Gakenke',
        scheduledStartAt: start,
        purpose: 'Field mission',
        passengers: 3,
        ...extra,
      })
    const a = await make(v1, dr1)
    expect(a.deploymentNumber).toMatch(/^GSL1\/\d{5}\/\d{4}$/)
    expect(a.scheduledEndAt.slice(0, 10)).toBe(new Date(new Date(start).getTime() + 4 * 86_400_000).toISOString().slice(0, 10))
    // A second deployment of the same vehicle inside the period is refused.
    const clash = await fail(make(v1, freeDrivers[1], { scheduledStartAt: new Date(Date.now() + 26 * 3600_000).toISOString() }))
    expect(clash.status).toBe(422)
    // The LPO shows the committed amount.
    const order = await http.get(`/purchase-orders/${lpo.id}`)
    expect(order.committedAmount).toBeGreaterThanOrEqual(a.amount)
    // Road maps need a dispatched deployment and are recorded as revisions.
    const early = await fail(http.post(`/deployments/${a.id}/road-map`))
    expect(early.status).toBe(422)
    await http.patch(`/deployments/${a.id}/status`, { status: 'DISPATCHED' })
    const rm = await http.post(`/deployments/${a.id}/road-map`)
    expect(rm.revision).toBe(1)
    const payload = await http.get(`/deployments/${a.id}/road-map`)
    expect(payload.company.numberPrefix).toBe('GSL')
    expect(payload.rows.length).toBeGreaterThanOrEqual(4)
    expect(payload.rows[0].date).toBe(start.slice(0, 10))
    expect(payload.history).toHaveLength(1)
    // Replacing swaps the vehicle: the original is REPLACED, the replacement is dispatched under the same LPO.
    const r = await http.post(`/deployments/${a.id}/replace`, { vehicleId: v2.id, reason: 'Brake warning light' })
    expect(r.original.status).toBe('REPLACED')
    expect(r.original.replacedById).toBe(r.replacement.id)
    expect(r.replacement.status).toBe('DISPATCHED')
    expect(r.replacement.purchaseOrderId).toBe(lpo.id)
    expect(r.replacement.replacesNumber).toBe(a.deploymentNumber)
    expect(d.vehicles.find((v) => v.id === v1.id).status).toBe('AVAILABLE')
    const again = await fail(http.post(`/deployments/${a.id}/replace`, { vehicleId: v1.id, reason: 'x' }))
    expect(again.status).toBe(422)
  })

  it('the gatekeeper records departures and returns but cannot dispatch or cancel', async () => {
    const gate = await signIn('gate@limoz.rw')
    expect(gate.permissions).toContain('GATE_RECORD')
    const board = await http.get('/gate/board')
    expect(board.departures.length).toBeGreaterThan(0)
    const t = board.departures[0]
    const nope = await fail(http.patch(`/deployments/${t.id}/status`, { status: 'CANCELLED', reason: 'x' }))
    expect(nope.status).toBe(403)
    const vehicle = getDb().vehicles.find((v) => v.id === t.vehicleId)
    const low = await fail(http.patch(`/deployments/${t.id}/status`, { status: 'IN_PROGRESS', startOdometer: vehicle.odometerKm - 10 }))
    expect(low.status).toBe(400)
    const out = await http.patch(`/deployments/${t.id}/status`, { status: 'IN_PROGRESS', startOdometer: vehicle.odometerKm + 3 })
    expect(out.status).toBe('IN_PROGRESS')
    expect(out.departureRecordedBy).toMatchObject({ id: gate.id })
    const lower = await fail(http.patch(`/deployments/${t.id}/status`, { status: 'COMPLETED', endOdometer: out.startOdometer - 1 }))
    expect(lower.status).toBe(400)
    const back = await http.patch(`/deployments/${t.id}/status`, { status: 'COMPLETED', endOdometer: out.startOdometer + 120 })
    expect(back.distanceKm).toBe(120)
    expect(back.returnRecordedBy).toMatchObject({ id: gate.id })
    expect(getDb().audit[0]).toMatchObject({ entityType: 'DEPLOYMENT', action: 'STATUS_CHANGE', userId: gate.id })
  })

  it('the driver mission report lists internal deployments per driver with the mission due amount', async () => {
    await signIn('management@limoz.rw')
    const d = getDb()
    const gsl = d.companies.find((c) => c.code === 'GORILLAND')
    const report = await http.get('/reports/driver-missions', { params: { from: '2026-09-01', to: '2026-12-31', companyId: gsl.id } })
    expect(report.title).toMatch(/^GSL DRIVERS MISSION FROM/)
    expect(report.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['deploymentNumber', 'effectiveDays', 'missionDue']))
    expect(report.rows.length).toBeGreaterThan(0)
    for (const r of report.rows) {
      expect(r.deploymentNumber.startsWith('GSL1/')).toBe(true)
      expect(r.missionDue).toBe(5_000 + (r.effectiveDays - 1) * 15_000)
    }
    expect(report.totals.missionDue).toBe(report.rows.reduce((s, r) => s + r.missionDue, 0))
    expect(report.summary.kpis.some((k) => k.key === 'due')).toBe(true)
    const driverId = report.rows[0] && d.deployments.find((t) => t.deploymentNumber === report.rows[0].deploymentNumber).driverId
    const one = await http.get('/reports/driver-missions', {
      params: { from: '2026-09-01', to: '2026-12-31', companyId: gsl.id, driverId },
    })
    expect(one.rows.every((r) => r.driver === report.rows[0].driver)).toBe(true)
  })

  it('stock is kept per company: receipts and issues are movements, transfers are approved and land on both sides', async () => {
    await signIn('workshop@limoz.rw')
    const d = getDb()
    const limoz = d.companies.find((c) => c.code === 'LIMOZ')
    const gsl = d.companies.find((c) => c.code === 'GORILLAND')
    const created = await http.post('/spare-parts', {
      companyId: limoz.id,
      partNumber: 'BP-TEST-001',
      name: 'Brake pads (test)',
      category: 'Brakes',
      unit: 'set',
      supplier: 'CFAO Motors',
      unitCost: 85_000,
      minimumStock: 2,
      currentStock: 5,
      reference: 'GRN-1',
    })
    expect(created.companyName).toBe('LIMOZ')
    expect(created.currentStock).toBe(5)
    const dup = await fail(http.post('/spare-parts', { ...created, currentStock: 1 }))
    expect(dup.status).toBe(409)
    // The same number is fine in another company's stock.
    const other = await http.post('/spare-parts', { ...created, companyId: gsl.id, currentStock: 0 })
    expect(other.companyName).toBe('Gorilland')
    const issued = await http.post(`/spare-parts/${created.id}/movements`, { type: 'ISSUE', quantity: 2, reference: 'WO-1' })
    expect(issued.part.currentStock).toBe(3)
    expect(issued.movement.quantity).toBe(-2)
    const noNote = await fail(http.post(`/spare-parts/${created.id}/transfer`, { toCompanyId: gsl.id, quantity: 1 }))
    expect(noNote.status).toBe(400)
    const tooMany = await fail(http.post(`/spare-parts/${created.id}/transfer`, { toCompanyId: gsl.id, quantity: 10, note: 'ok' }))
    expect(tooMany.status).toBe(422)
    const transfer = await http.post(`/spare-parts/${created.id}/transfer`, {
      toCompanyId: gsl.id,
      quantity: 2,
      note: 'Approved by workshop manager',
    })
    expect(transfer.source.currentStock).toBe(1)
    expect(transfer.destination.id).toBe(other.id)
    expect(transfer.destination.currentStock).toBe(2)
    expect(transfer.movements.map((m) => m.type).sort()).toEqual(['TRANSFER_IN', 'TRANSFER_OUT'])
    const movements = await http.get('/stock-movements', { params: { partId: created.id, size: 50 } })
    expect(movements.content.map((m) => m.type)).toEqual(['TRANSFER_OUT', 'ISSUE', 'RECEIPT'])
    // A company-scoped account only sees its own stock.
    useAuthStore.getState().clearSession()
    await signIn('admin@limoz.rw')
    const admin = getDb().users.find((u) => u.email === 'admin@limoz.rw')
    const tech = getDb().users.find((u) => u.email === 'technician@limoz.rw')
    await http.put(`/users/${tech.id}`, { ...tech, roleId: tech.roleId, departmentId: tech.departmentId, companyId: gsl.id })
    void admin
    useAuthStore.getState().clearSession()
    const scoped = await signIn('technician@limoz.rw')
    expect(scoped.companyId).toBe(gsl.id)
    const list = await http.get('/spare-parts', { params: { size: 100 } })
    expect(list.content.every((p) => p.companyId === gsl.id)).toBe(true)
    const peek = await fail(http.get(`/spare-parts/${created.id}`))
    expect(peek.status).toBe(403)
  })
})
