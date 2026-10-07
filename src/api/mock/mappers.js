import { differenceInCalendarDays, differenceInMinutes, parseISO } from 'date-fns'
import { getDb } from './db'
const db = () => getDb()
export const userName = (id) => {
  if (id == null) return 'System'
  const u = db().users.find((x) => x.id === id)
  return u ? `${u.firstName} ${u.lastName}` : 'Unknown user'
}
export const vehicleById = (id) => db().vehicles.find((v) => v.id === id)
export const driverById = (id) => db().drivers.find((d) => d.id === id)
export const categoryById = (id) => db().categories.find((c) => c.id === id)
export const plateOf = (id) => (id == null ? null : (vehicleById(id)?.plateNumber ?? 'Unknown'))
export const driverNameOf = (id) => (id == null ? null : (driverById(id)?.fullName ?? 'Unknown'))
// ---------- Users ----------
export function toUser(u) {
  const { password: _password, ...rest } = u
  return rest
}
// ---------- Categories ----------
export function toCategory(c) {
  return { ...c, vehicleCount: db().vehicles.filter((v) => v.categoryId === c.id && !v.archived).length }
}
// ---------- Vehicles ----------
export function currentAssignmentOf(vehicleId) {
  return db().assignments.find((a) => a.vehicleId === vehicleId && a.status === 'ACTIVE')
}
export function currentAssignmentOfDriver(driverId) {
  return db().assignments.find((a) => a.driverId === driverId && a.status === 'ACTIVE')
}
export function toVehicleSummary(v) {
  return {
    id: v.id,
    plateNumber: v.plateNumber,
    fleetNumber: v.fleetNumber,
    make: v.make,
    model: v.model,
    year: v.year,
    categoryId: v.categoryId,
    categoryName: categoryById(v.categoryId)?.name ?? 'Uncategorised',
    status: v.status,
    color: v.color,
  }
}
export function toVehicle(v) {
  const assignment = currentAssignmentOf(v.id)
  const schedules = db()
    .schedules.filter((s) => s.vehicleId === v.id)
    .map((s) => toSchedule(s))
  const overdue = schedules.some((s) => s.state === 'OVERDUE')
  const dueSoon = schedules.some((s) => s.state === 'DUE_SOON')
  const next = schedules.filter((s) => s.nextServiceKm != null).sort((a, b) => (a.nextServiceKm ?? 0) - (b.nextServiceKm ?? 0))[0]
  const nextDate = schedules
    .filter((s) => s.nextServiceDate != null)
    .sort((a, b) => (a.nextServiceDate ?? '').localeCompare(b.nextServiceDate ?? ''))[0]
  return {
    ...toVehicleSummary(v),
    bodyType: v.bodyType,
    fuelType: v.fuelType,
    transmission: v.transmission,
    engineNumber: v.engineNumber,
    vin: v.vin,
    odometerKm: v.odometerKm,
    seatingCapacity: v.seatingCapacity,
    purchaseDate: v.purchaseDate,
    acquisitionCost: v.acquisitionCost,
    insurer: v.insurer,
    insurancePolicyNumber: v.insurancePolicyNumber,
    insuranceExpiry: v.insuranceExpiry,
    currentDriverId: assignment?.driverId ?? null,
    currentDriverName: assignment ? driverNameOf(assignment.driverId) : null,
    maintenanceStatus: overdue ? 'OVERDUE' : dueSoon ? 'DUE_SOON' : 'OK',
    nextServiceKm: next?.nextServiceKm ?? null,
    nextServiceDate: nextDate?.nextServiceDate ?? null,
    department: v.department,
    notes: v.notes,
    telematics: db().telemetry[v.id] ?? {
      deviceId: null,
      status: 'UNKNOWN',
      lastCommunicationAt: null,
      latitude: null,
      longitude: null,
      speedKph: null,
      ignitionOn: null,
      batteryPercent: null,
      fuelSensorOk: null,
      moving: null,
    },
    archived: v.archived,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  }
}
// ---------- Drivers ----------
export function toDriverSummary(d) {
  const a = currentAssignmentOfDriver(d.id)
  return {
    id: d.id,
    employeeNumber: d.employeeNumber,
    fullName: d.fullName,
    phone: d.phone,
    status: d.status,
    licenseExpiry: d.licenseExpiry,
    currentVehicleId: a?.vehicleId ?? null,
    currentVehiclePlate: a ? plateOf(a.vehicleId) : null,
  }
}
export function toDriver(d) {
  return {
    ...toDriverSummary(d),
    email: d.email,
    nationalId: d.nationalId,
    licenseNumber: d.licenseNumber,
    licenseCategory: d.licenseCategory,
    licenseIssueDate: d.licenseIssueDate,
    employmentStatus: d.employmentStatus,
    joiningDate: d.joiningDate,
    emergencyContactName: d.emergencyContactName,
    emergencyContactPhone: d.emergencyContactPhone,
    notes: d.notes,
    rating: d.rating,
    archived: d.archived,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}
// ---------- Assignments ----------
export function toAssignment(a) {
  return {
    id: a.id,
    vehicleId: a.vehicleId,
    vehiclePlate: plateOf(a.vehicleId) ?? '',
    driverId: a.driverId,
    driverName: driverNameOf(a.driverId) ?? '',
    startAt: a.startAt,
    endAt: a.endAt,
    assignedByName: userName(a.assignedById),
    purpose: a.purpose,
    odometerAtStart: a.odometerAtStart,
    odometerAtEnd: a.odometerAtEnd,
    status: a.status,
    comments: a.comments,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }
}
// ---------- Trips ----------
export function toTrip(t) {
  const booking = t.bookingId ? db().bookings.find((b) => b.id === t.bookingId) : null
  const distance = t.startOdometer != null && t.endOdometer != null ? t.endOdometer - t.startOdometer : null
  const duration = t.startedAt && t.endedAt ? differenceInMinutes(parseISO(t.endedAt), parseISO(t.startedAt)) : null
  return {
    id: t.id,
    tripNumber: t.tripNumber,
    vehicleId: t.vehicleId,
    vehiclePlate: plateOf(t.vehicleId) ?? '',
    driverId: t.driverId,
    driverName: driverNameOf(t.driverId) ?? '',
    customerName: t.customerName,
    bookingId: t.bookingId,
    bookingNumber: booking?.bookingNumber ?? null,
    startLocation: t.startLocation,
    destination: t.destination,
    scheduledStartAt: t.scheduledStartAt,
    startedAt: t.startedAt,
    endedAt: t.endedAt,
    startOdometer: t.startOdometer,
    endOdometer: t.endOdometer,
    distanceKm: distance,
    durationMinutes: duration,
    fuelUsedLitres: t.fuelUsedLitres,
    maxSpeedKph: t.maxSpeedKph,
    purpose: t.purpose,
    passengers: t.passengers,
    status: t.status,
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }
}
// ---------- Bookings ----------
export function toBooking(b) {
  return {
    id: b.id,
    bookingNumber: b.bookingNumber,
    customerName: b.customerName,
    company: b.company,
    contactPhone: b.contactPhone,
    contactEmail: b.contactEmail,
    requestedCategoryId: b.requestedCategoryId,
    requestedCategoryName: categoryById(b.requestedCategoryId)?.name ?? 'Any',
    vehicleId: b.vehicleId,
    vehiclePlate: plateOf(b.vehicleId),
    driverId: b.driverId,
    driverName: driverNameOf(b.driverId),
    pickupLocation: b.pickupLocation,
    dropoffLocation: b.dropoffLocation,
    pickupAt: b.pickupAt,
    returnAt: b.returnAt,
    serviceType: b.serviceType,
    passengers: b.passengers,
    status: b.status,
    notes: b.notes,
    quotedAmount: b.quotedAmount,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  }
}
// ---------- Fuel ----------
export function toFuel(f, previous) {
  const prev =
    previous === undefined
      ? (db()
          .fuel.filter((x) => x.vehicleId === f.vehicleId && x.transactedAt < f.transactedAt)
          .sort((a, b) => b.transactedAt.localeCompare(a.transactedAt))[0] ?? null)
      : previous
  const distance = prev ? f.odometerKm - prev.odometerKm : null
  const l100 = distance && distance > 0 ? Math.round((f.litres / distance) * 100 * 10) / 10 : null
  const kmPerL = distance && distance > 0 ? Math.round((distance / f.litres) * 100) / 100 : null
  const v = vehicleById(f.vehicleId)
  const expected = expectedL100(v?.categoryId)
  let anomaly = null
  if (l100 != null && expected && l100 > expected * (1 + db().settings.fuelVarianceTolerancePercent / 100) * 1.3) {
    anomaly = `Consumption ${l100} L/100 km is far above the ${expected} L/100 km expected for this class.`
  } else if (distance != null && distance <= 0) {
    anomaly = 'Odometer did not advance since the previous fill.'
  }
  return {
    id: f.id,
    vehicleId: f.vehicleId,
    vehiclePlate: plateOf(f.vehicleId) ?? '',
    driverId: f.driverId,
    driverName: driverNameOf(f.driverId),
    station: f.station,
    transactedAt: f.transactedAt,
    fuelType: f.fuelType,
    litres: f.litres,
    pricePerLitre: f.pricePerLitre,
    totalAmount: Math.round(f.litres * f.pricePerLitre),
    odometerKm: f.odometerKm,
    distanceSinceLastKm: distance,
    litresPer100Km: l100,
    kmPerLitre: kmPerL,
    receiptNumber: f.receiptNumber,
    enteredByName: userName(f.enteredById),
    notes: f.notes,
    anomaly,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }
}
export function expectedL100(categoryId) {
  const code = categoryId ? categoryById(categoryId)?.code : undefined
  const base = {
    LUX_SUV: 15,
    SUV: 11,
    SEDAN: 7.5,
    LUX_SEDAN: 9.5,
    LUX_VAN: 11,
    EXEC_BUS: 22,
    SAFARI: 14,
    TRUCK: 24,
    FLATBED: 26,
    TANKER: 38,
  }
  return code ? (base[code] ?? null) : null
}
// ---------- Maintenance ----------
export function toMaintenance(m) {
  const parts = m.parts.map((p) => {
    const part = db().parts.find((x) => x.id === p.partId)
    return {
      partId: p.partId,
      partNumber: part?.partNumber ?? '—',
      partName: part?.name ?? 'Unknown part',
      quantity: p.quantity,
      unitCost: p.unitCost,
    }
  })
  const partsCost = parts.reduce((s, p) => s + p.quantity * p.unitCost, 0)
  return {
    id: m.id,
    maintenanceNumber: m.maintenanceNumber,
    vehicleId: m.vehicleId,
    vehiclePlate: plateOf(m.vehicleId) ?? '',
    reportedAt: m.reportedAt,
    reportedByName: userName(m.reportedById),
    complaint: m.complaint,
    type: m.type,
    technicianName: m.technicianName,
    workshop: m.workshop,
    startedAt: m.startedAt,
    expectedCompletionAt: m.expectedCompletionAt,
    completedAt: m.completedAt,
    odometerKm: m.odometerKm,
    diagnosis: m.diagnosis,
    servicePerformed: m.servicePerformed,
    parts,
    laborCost: m.laborCost,
    partsCost,
    otherCost: m.otherCost,
    totalCost: partsCost + m.laborCost + m.otherCost,
    status: m.status,
    comments: m.comments,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  }
}
export function toSchedule(s) {
  const v = vehicleById(s.vehicleId)
  const odo = v?.odometerKm ?? 0
  const settings = db().settings
  const nextKm = s.intervalKm != null ? s.lastServiceKm + s.intervalKm : null
  const nextDate = s.intervalDays != null ? addDaysIso(s.lastServiceDate, s.intervalDays) : null
  const kmRemaining = nextKm != null ? nextKm - odo : null
  const daysRemaining = nextDate != null ? differenceInCalendarDays(parseISO(nextDate), new Date()) : null
  let state = 'OK'
  if ((kmRemaining != null && kmRemaining < 0) || (daysRemaining != null && daysRemaining < 0)) state = 'OVERDUE'
  else if (
    (kmRemaining != null && kmRemaining <= settings.maintenanceDueSoonKm) ||
    (daysRemaining != null && daysRemaining <= settings.maintenanceDueSoonDays)
  )
    state = 'DUE_SOON'
  return {
    id: s.id,
    vehicleId: s.vehicleId,
    vehiclePlate: v?.plateNumber ?? '',
    task: s.task,
    intervalKm: s.intervalKm,
    intervalDays: s.intervalDays,
    lastServiceKm: s.lastServiceKm,
    lastServiceDate: s.lastServiceDate,
    nextServiceKm: nextKm,
    nextServiceDate: nextDate,
    currentOdometerKm: odo,
    kmRemaining,
    daysRemaining,
    state,
  }
}
function addDaysIso(date, days) {
  const d = parseISO(date)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
// ---------- Incidents ----------
export function toIncident(i) {
  return {
    id: i.id,
    incidentNumber: i.incidentNumber,
    vehicleId: i.vehicleId,
    vehiclePlate: plateOf(i.vehicleId) ?? '',
    driverId: i.driverId,
    driverName: driverNameOf(i.driverId),
    occurredAt: i.occurredAt,
    location: i.location,
    type: i.type,
    description: i.description,
    severity: i.severity,
    investigation: i.investigation,
    correctiveAction: i.correctiveAction,
    estimatedCost: i.estimatedCost,
    status: i.status,
    attachments: i.attachments,
    history: i.history,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
  }
}
// ---------- Documents ----------
export function documentStatus(expiryDate) {
  const days = differenceInCalendarDays(parseISO(expiryDate), new Date())
  const warn = Math.max(...db().settings.documentExpiryWarningDays)
  return { status: days < 0 ? 'EXPIRED' : days <= warn ? 'EXPIRING_SOON' : 'VALID', days }
}
export function toDocument(d) {
  const { status, days } = documentStatus(d.expiryDate)
  const ownerLabel = d.ownerType === 'VEHICLE' ? (plateOf(d.ownerId) ?? '') : (driverNameOf(d.ownerId) ?? '')
  return {
    id: d.id,
    ownerType: d.ownerType,
    ownerId: d.ownerId,
    ownerLabel,
    type: d.type,
    number: d.number,
    issueDate: d.issueDate,
    expiryDate: d.expiryDate,
    status,
    daysToExpiry: days,
    attachment: d.attachment,
    notes: d.notes,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}
// ---------- Alerts (computed from live data) ----------
export function computeAlerts() {
  const d = db()
  const now = new Date()
  const alerts = []
  const push = ({ keySuffix, ...a }) => {
    const key = `${a.code}:${a.entityType}:${a.entityId}${keySuffix != null ? `:${keySuffix}` : ''}`
    const ack = d.alertAcks[key]
    alerts.push({
      id: hashId(key),
      ackKey: key,
      ...a,
      acknowledgedAt: ack?.at ?? null,
      acknowledgedByName: ack ? userName(ack.byId) : null,
    })
  }
  for (const v of d.vehicles) {
    if (v.archived || v.status === 'INACTIVE') continue
    const t = d.telemetry[v.id]
    if (t && t.lastCommunicationAt && ['OFFLINE', 'NO_SIGNAL'].includes(t.status)) {
      const mins = differenceInMinutes(now, parseISO(t.lastCommunicationAt))
      if (mins >= d.settings.gpsOfflineThresholdMinutes) {
        push({
          severity: 'CRITICAL',
          code: 'GPS_OFFLINE',
          title: 'GPS offline',
          message: `${v.plateNumber} has not reported for ${Math.round(mins / 60)} h.`,
          entityType: 'VEHICLE',
          entityId: v.id,
          entityLabel: v.plateNumber,
          raisedAt: t.lastCommunicationAt,
        })
      }
    }
    if (t && t.fuelSensorOk === false) {
      push({
        severity: 'WARNING',
        code: 'FUEL_SENSOR_FAULT',
        title: 'Fuel sensor fault',
        message: `${v.plateNumber} fuel level sensor is not reporting reliable data.`,
        entityType: 'VEHICLE',
        entityId: v.id,
        entityLabel: v.plateNumber,
        raisedAt: t.lastCommunicationAt ?? now.toISOString(),
      })
    }
    const lastMove = d.movements.filter((m) => m.vehicleId === v.id).sort((a, b) => b.date.localeCompare(a.date))[0]
    if (['AVAILABLE', 'ASSIGNED'].includes(v.status)) {
      const idleDays = lastMove ? differenceInCalendarDays(now, parseISO(lastMove.date)) : 99
      if (idleDays >= d.settings.idleVehicleDays) {
        push({
          severity: 'WARNING',
          code: 'VEHICLE_IDLE',
          title: 'Vehicle idle',
          message: `${v.plateNumber} has not moved for ${idleDays} days.`,
          entityType: 'VEHICLE',
          entityId: v.id,
          entityLabel: v.plateNumber,
          raisedAt: now.toISOString(),
        })
      }
    }
  }
  for (const doc of d.documents) {
    const { status, days } = documentStatus(doc.expiryDate)
    const label = doc.ownerType === 'VEHICLE' ? (plateOf(doc.ownerId) ?? '') : (driverNameOf(doc.ownerId) ?? '')
    const typeLabel = doc.type.replace(/_/g, ' ').toLowerCase()
    if (status === 'EXPIRED') {
      push({
        severity: 'CRITICAL',
        code: 'DOCUMENT_EXPIRED',
        title: `${capitalize(typeLabel)} expired`,
        message: `${label}: ${typeLabel} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago.`,
        entityType: 'DOCUMENT',
        entityId: doc.id,
        entityLabel: label,
        raisedAt: doc.expiryDate,
      })
    } else if (status === 'EXPIRING_SOON') {
      push({
        severity: 'WARNING',
        code: 'DOCUMENT_EXPIRING',
        title: `${capitalize(typeLabel)} expiring`,
        message: `${label}: ${typeLabel} expires in ${days} day${days === 1 ? '' : 's'}.`,
        entityType: 'DOCUMENT',
        entityId: doc.id,
        entityLabel: label,
        raisedAt: now.toISOString(),
      })
    }
  }
  for (const s of d.schedules) {
    const sch = toSchedule(s)
    if (sch.state === 'OVERDUE') {
      push({
        severity: 'CRITICAL',
        code: 'MAINTENANCE_OVERDUE',
        keySuffix: s.id,
        title: 'Maintenance overdue',
        message: `${sch.vehiclePlate}: ${sch.task} is overdue${sch.kmRemaining != null && sch.kmRemaining < 0 ? ` by ${Math.abs(sch.kmRemaining).toLocaleString()} km` : ''}.`,
        entityType: 'VEHICLE',
        entityId: s.vehicleId,
        entityLabel: sch.vehiclePlate,
        raisedAt: now.toISOString(),
      })
    } else if (sch.state === 'DUE_SOON') {
      push({
        severity: 'WARNING',
        code: 'MAINTENANCE_DUE',
        keySuffix: s.id,
        title: 'Maintenance approaching',
        message: `${sch.vehiclePlate}: ${sch.task} due${sch.kmRemaining != null ? ` in ${sch.kmRemaining.toLocaleString()} km` : ''}${sch.daysRemaining != null ? ` (${sch.daysRemaining} days)` : ''}.`,
        entityType: 'VEHICLE',
        entityId: s.vehicleId,
        entityLabel: sch.vehiclePlate,
        raisedAt: now.toISOString(),
      })
    }
  }
  for (const i of d.incidents) {
    if (['OPEN', 'UNDER_INVESTIGATION'].includes(i.status)) {
      push({
        severity: i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
        code: 'INCIDENT_OPEN',
        title: `${i.type.replace(/_/g, ' ').toLowerCase()} incident`,
        message: `${plateOf(i.vehicleId)}: ${i.description}`,
        entityType: 'INCIDENT',
        entityId: i.id,
        entityLabel: i.incidentNumber,
        raisedAt: i.occurredAt,
      })
    }
  }
  for (const f of d.fuel.slice(-80)) {
    const dto = toFuel(f)
    if (dto.anomaly) {
      push({
        severity: 'WARNING',
        code: 'FUEL_ANOMALY',
        title: 'Fuel anomaly',
        message: `${dto.vehiclePlate}: ${dto.anomaly}`,
        entityType: 'FUEL',
        entityId: f.id,
        entityLabel: dto.vehiclePlate,
        raisedAt: f.transactedAt,
      })
    }
  }
  for (const b of d.bookings) {
    if (['REQUESTED', 'CONFIRMED'].includes(b.status)) {
      const hours = differenceInMinutes(parseISO(b.pickupAt), now) / 60
      if (hours >= 0 && hours <= 24) {
        push({
          severity: 'WARNING',
          code: 'BOOKING_UNASSIGNED',
          title: 'Booking needs a vehicle',
          message: `${b.bookingNumber} for ${b.company ?? b.customerName} picks up in ${Math.round(hours)} h and has no vehicle.`,
          entityType: 'BOOKING',
          entityId: b.id,
          entityLabel: b.bookingNumber,
          raisedAt: b.createdAt,
        })
      }
    }
  }
  for (const m of d.maintenance.filter((x) => x.status === 'COMPLETED').slice(-6)) {
    push({
      severity: 'INFO',
      code: 'MAINTENANCE_COMPLETED',
      title: 'Maintenance completed',
      message: `${plateOf(m.vehicleId)}: ${m.complaint} (${m.maintenanceNumber}).`,
      entityType: 'MAINTENANCE',
      entityId: m.id,
      entityLabel: m.maintenanceNumber,
      raisedAt: m.completedAt ?? m.updatedAt,
    })
  }
  for (const b of d.bookings.filter((x) => x.status === 'ASSIGNED').slice(-4)) {
    push({
      severity: 'INFO',
      code: 'BOOKING_ASSIGNED',
      title: 'Booking assigned',
      message: `${b.bookingNumber} assigned to ${plateOf(b.vehicleId)} with ${driverNameOf(b.driverId)}.`,
      entityType: 'BOOKING',
      entityId: b.id,
      entityLabel: b.bookingNumber,
      raisedAt: b.updatedAt,
    })
  }
  const order = { CRITICAL: 0, WARNING: 1, INFO: 2 }
  return alerts.sort((a, b) => order[a.severity] - order[b.severity] || b.raisedAt.localeCompare(a.raisedAt))
}
function hashId(key) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0
  return Math.abs(h)
}
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
export function recordAudit(entry) {
  const d = db()
  d.audit.unshift({
    id: (d.sequences.audit = (d.sequences.audit ?? 0) + 1),
    at: new Date().toISOString(),
    ipAddress: '127.0.0.1',
    ...entry,
  })
}
export function diff(before, after, fields) {
  const keys = fields ?? Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  return keys
    .filter((k) => !['updatedAt', 'createdAt'].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ field: k, from: before[k], to: after[k] }))
}
