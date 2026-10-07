import { format } from 'date-fns'
import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, inDateRange, matchesText, notFound, paginate } from '../core'
import { diff, documentStatus, recordAudit, toBooking } from '../mappers'

const auditBooking = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'BOOKING',
    entityId: row.id,
    entityLabel: row.bookingNumber,
    changes,
  })

const findBooking = (id) => {
  const b = getDb().bookings.find((x) => x.id === Number(id))
  if (!b) throw notFound('Booking')
  return b
}

function validateBooking(input) {
  const errors = []
  if (!input.customerName?.trim()) errors.push({ field: 'customerName', message: 'Customer name is required.' })
  if (!/^\+?[0-9 ]{9,15}$/.test(input.contactPhone ?? '')) errors.push({ field: 'contactPhone', message: 'Enter a valid phone number.' })
  if (input.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail))
    errors.push({ field: 'contactEmail', message: 'Enter a valid email address.' })
  if (!getDb().categories.some((c) => c.id === Number(input.requestedCategoryId)))
    errors.push({ field: 'requestedCategoryId', message: 'Choose a vehicle category.' })
  if (!input.pickupLocation?.trim()) errors.push({ field: 'pickupLocation', message: 'Pickup location is required.' })
  if (!input.dropoffLocation?.trim()) errors.push({ field: 'dropoffLocation', message: 'Drop-off location is required.' })
  if (!input.pickupAt) errors.push({ field: 'pickupAt', message: 'Pickup time is required.' })
  if (!input.returnAt) errors.push({ field: 'returnAt', message: 'Return time is required.' })
  else if (input.pickupAt && new Date(input.returnAt) <= new Date(input.pickupAt))
    errors.push({ field: 'returnAt', message: 'Return must be after pickup.' })
  if (!input.serviceType?.trim()) errors.push({ field: 'serviceType', message: 'Choose a service type.' })
  const pax = Number(input.passengers)
  if (!Number.isInteger(pax) || pax < 1) errors.push({ field: 'passengers', message: 'At least one passenger.' })
  if (input.quotedAmount != null && input.quotedAmount !== '' && Number(input.quotedAmount) < 0)
    errors.push({ field: 'quotedAmount', message: 'Amount cannot be negative.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

const normalise = (input) => ({
  customerName: input.customerName.trim(),
  company: input.company?.trim() || null,
  contactPhone: input.contactPhone.replace(/\s/g, ''),
  contactEmail: input.contactEmail?.trim().toLowerCase() || null,
  requestedCategoryId: Number(input.requestedCategoryId),
  pickupLocation: input.pickupLocation.trim(),
  dropoffLocation: input.dropoffLocation.trim(),
  pickupAt: new Date(input.pickupAt).toISOString(),
  returnAt: new Date(input.returnAt).toISOString(),
  serviceType: input.serviceType.trim(),
  passengers: Number(input.passengers),
  notes: input.notes?.trim() || null,
  quotedAmount: input.quotedAmount === '' || input.quotedAmount == null ? null : Number(input.quotedAmount),
})

const overlaps = (aStart, aEnd, bStart, bEnd) => new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd)

/** Prevents double-booking a vehicle or driver across overlapping booking windows. */
function assertNoBookingConflict(booking, vehicleId, driverId) {
  const d = getDb()
  const clash = d.bookings.find(
    (b) =>
      b.id !== booking.id &&
      ['ASSIGNED', 'IN_PROGRESS'].includes(b.status) &&
      (b.vehicleId === vehicleId || b.driverId === driverId) &&
      overlaps(booking.pickupAt, booking.returnAt, b.pickupAt, b.returnAt),
  )
  if (clash)
    throw businessRule(
      `${clash.vehicleId === vehicleId ? 'That vehicle' : 'That driver'} is already booked on ${clash.bookingNumber} (${format(new Date(clash.pickupAt), 'd MMM HH:mm')} – ${format(new Date(clash.returnAt), 'd MMM HH:mm')}).`,
    )
}

get(
  '/bookings',
  ({ query }) => {
    const list = getDb()
      .bookings.map(toBooking)
      .filter((b) =>
        matchesText(
          [b.bookingNumber, b.customerName, b.company, b.contactPhone, b.pickupLocation, b.dropoffLocation, b.vehiclePlate, b.driverName],
          query.q,
        ),
      )
      .filter((b) => !query.status || query.status.split(',').includes(b.status))
      .filter((b) => !query.categoryId || b.requestedCategoryId === Number(query.categoryId))
      .filter((b) => !query.vehicleId || b.vehicleId === Number(query.vehicleId))
      .filter((b) => inDateRange(b.pickupAt, query.from, query.to))
      .filter((b) => query.upcoming !== 'true' || (new Date(b.pickupAt) >= new Date() && !['COMPLETED', 'CANCELLED'].includes(b.status)))
    return paginate(list, query, 'pickupAt,desc')
  },
  { permission: 'BOOKING_READ' },
)

get('/bookings/:id', ({ params }) => toBooking(findBooking(params.id)), { permission: 'BOOKING_READ' })

post(
  '/bookings',
  ({ body, user }) => {
    validateBooking(body)
    const now = new Date().toISOString()
    const id = nextId('booking')
    const data = normalise(body)
    const row = {
      id,
      bookingNumber: `BK-${format(new Date(data.pickupAt), 'yyMM')}-${String(id).padStart(4, '0')}`,
      ...data,
      vehicleId: null,
      driverId: null,
      status: 'REQUESTED',
      createdAt: now,
      updatedAt: now,
    }
    getDb().bookings.push(row)
    auditBooking(user, 'CREATE', row)
    persist()
    return toBooking(row)
  },
  { permission: 'BOOKING_MANAGE' },
)

put(
  '/bookings/:id',
  ({ params, body, user }) => {
    const row = findBooking(params.id)
    if (['COMPLETED', 'CANCELLED', 'IN_PROGRESS'].includes(row.status)) throw businessRule('This booking can no longer be edited.')
    validateBooking(body)
    const before = { ...row }
    Object.assign(row, normalise(body), { updatedAt: new Date().toISOString() })
    if (row.vehicleId && row.driverId) assertNoBookingConflict(row, row.vehicleId, row.driverId)
    auditBooking(user, 'UPDATE', row, diff(before, row))
    persist()
    return toBooking(row)
  },
  { permission: 'BOOKING_MANAGE' },
)

patch(
  '/bookings/:id/confirm',
  ({ params, user }) => {
    const row = findBooking(params.id)
    if (row.status !== 'REQUESTED') throw businessRule('Only requested bookings can be confirmed.')
    row.status = 'CONFIRMED'
    row.updatedAt = new Date().toISOString()
    auditBooking(user, 'STATUS_CHANGE', row, [{ field: 'status', from: 'REQUESTED', to: 'CONFIRMED' }])
    persist()
    return toBooking(row)
  },
  { permission: 'BOOKING_MANAGE' },
)

patch(
  '/bookings/:id/assign',
  ({ params, body, user }) => {
    const row = findBooking(params.id)
    if (!['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(row.status))
      throw businessRule('This booking cannot be assigned in its current state.')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(body?.vehicleId) && !v.archived)
    const driver = d.drivers.find((x) => x.id === Number(body?.driverId) && !x.archived)
    const errors = []
    if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
    if (!driver) errors.push({ field: 'driverId', message: 'Choose a driver.' })
    if (errors.length) throw badRequest('Choose both a vehicle and a driver.', errors)
    if (['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE'].includes(vehicle.status))
      throw businessRule(`${vehicle.plateNumber} is ${vehicle.status.replace(/_/g, ' ').toLowerCase()}.`)
    if (vehicle.seatingCapacity < row.passengers)
      throw businessRule(`${vehicle.plateNumber} seats ${vehicle.seatingCapacity}; this booking has ${row.passengers} passengers.`)
    const expired = d.documents.filter(
      (x) =>
        x.ownerType === 'VEHICLE' &&
        x.ownerId === vehicle.id &&
        ['INSURANCE', 'INSPECTION', 'ROAD_LICENCE'].includes(x.type) &&
        documentStatus(x.expiryDate).status === 'EXPIRED',
    )
    if (expired.length)
      throw businessRule(`${vehicle.plateNumber} has expired ${expired.map((x) => x.type.replace(/_/g, ' ').toLowerCase()).join(', ')}.`)
    if (['ON_LEAVE', 'SUSPENDED', 'INACTIVE', 'OFF_DUTY'].includes(driver.status))
      throw businessRule(`${driver.fullName} is ${driver.status.replace(/_/g, ' ').toLowerCase()}.`)
    if (documentStatus(driver.licenseExpiry).status === 'EXPIRED') throw businessRule(`${driver.fullName}'s licence has expired.`)
    if (new Date(driver.licenseExpiry) < new Date(row.returnAt))
      throw businessRule(`${driver.fullName}'s licence expires before the booking returns (${driver.licenseExpiry}).`)
    assertNoBookingConflict(row, vehicle.id, driver.id)
    const from = row.status
    const now = new Date().toISOString()
    Object.assign(row, { vehicleId: vehicle.id, driverId: driver.id, status: 'ASSIGNED', updatedAt: now })
    // Create the planned trip that will carry this booking.
    const existingTrip = d.trips.find((t) => t.bookingId === row.id && !['CANCELLED', 'COMPLETED'].includes(t.status))
    if (existingTrip) Object.assign(existingTrip, { vehicleId: vehicle.id, driverId: driver.id, updatedAt: now })
    else {
      const tid = nextId('trip')
      d.trips.push({
        id: tid,
        tripNumber: `TR-${format(new Date(row.pickupAt), 'yyMMdd')}-${String(tid).padStart(4, '0')}`,
        vehicleId: vehicle.id,
        driverId: driver.id,
        customerName: row.company ?? row.customerName,
        bookingId: row.id,
        startLocation: row.pickupLocation,
        destination: row.dropoffLocation,
        scheduledStartAt: row.pickupAt,
        startedAt: null,
        endedAt: null,
        startOdometer: null,
        endOdometer: null,
        fuelUsedLitres: null,
        maxSpeedKph: null,
        purpose: row.serviceType,
        passengers: row.passengers,
        status: 'PLANNED',
        notes: row.notes,
        createdAt: now,
        updatedAt: now,
      })
    }
    if (vehicle.status === 'AVAILABLE' && new Date(row.pickupAt) - new Date() < 24 * 3600 * 1000) {
      vehicle.status = 'RESERVED'
      vehicle.updatedAt = now
    }
    auditBooking(user, 'ASSIGN', row, [
      { field: 'status', from, to: 'ASSIGNED' },
      { field: 'vehicle', from: null, to: vehicle.plateNumber },
      { field: 'driver', from: null, to: driver.fullName },
    ])
    persist()
    return toBooking(row)
  },
  { permission: 'BOOKING_MANAGE' },
)

patch(
  '/bookings/:id/cancel',
  ({ params, body, user }) => {
    const row = findBooking(params.id)
    if (['COMPLETED', 'CANCELLED'].includes(row.status)) throw businessRule('This booking is already closed.')
    if (row.status === 'IN_PROGRESS') throw businessRule('A booking in progress cannot be cancelled. Complete the trip instead.')
    const d = getDb()
    const now = new Date().toISOString()
    const from = row.status
    const reason = body?.reason?.trim()
    if (!reason) throw badRequest('A cancellation reason is required.', [{ field: 'reason', message: 'Required.' }])
    row.status = 'CANCELLED'
    row.notes = `${row.notes ? row.notes + ' · ' : ''}Cancelled: ${reason}`
    row.updatedAt = now
    for (const t of d.trips.filter((t) => t.bookingId === row.id && ['PLANNED', 'DISPATCHED'].includes(t.status))) {
      t.status = 'CANCELLED'
      t.notes = `Booking cancelled: ${reason}`
      t.updatedAt = now
    }
    const vehicle = row.vehicleId ? d.vehicles.find((v) => v.id === row.vehicleId) : null
    if (vehicle?.status === 'RESERVED') {
      vehicle.status = 'AVAILABLE'
      vehicle.updatedAt = now
    }
    auditBooking(user, 'STATUS_CHANGE', row, [
      { field: 'status', from, to: 'CANCELLED' },
      { field: 'reason', from: null, to: reason },
    ])
    persist()
    return toBooking(row)
  },
  { permission: 'BOOKING_MANAGE' },
)

get(
  '/customers',
  ({ query }) => {
    const d = getDb()
    const map = new Map()
    for (const b of d.bookings) {
      const key = b.company ?? b.customerName
      const c = map.get(key) ?? {
        name: key,
        bookings: 0,
        completed: 0,
        lastBookingAt: null,
        contactPhone: b.contactPhone,
        contactEmail: b.contactEmail,
        revenue: 0,
      }
      c.bookings += 1
      if (b.status === 'COMPLETED') {
        c.completed += 1
        c.revenue += b.quotedAmount ?? 0
      }
      if (!c.lastBookingAt || b.pickupAt > c.lastBookingAt) c.lastBookingAt = b.pickupAt
      map.set(key, c)
    }
    const list = [...map.values()].filter((c) => matchesText([c.name, c.contactPhone, c.contactEmail], query.q))
    return paginate(list, query, 'bookings,desc')
  },
  { permission: 'BOOKING_READ' },
)
