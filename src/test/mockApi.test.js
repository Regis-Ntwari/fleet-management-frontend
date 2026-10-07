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
