import {
  addDays,
  addHours,
  addMinutes,
  differenceInCalendarDays,
  format,
  setHours,
  setMinutes,
  startOfDay,
  subDays,
  subMonths,
} from 'date-fns'
import { Rng } from './rng'
import {
  CATEGORIES,
  CITY_LOCATIONS,
  COLORS,
  COMPANIES,
  COMPLAINTS,
  DEPARTMENTS,
  DOCUMENT_TYPES_VEHICLE,
  FIRST_NAMES,
  INCIDENT_DESCRIPTIONS,
  INCIDENT_TYPES,
  LAST_NAMES,
  MAINTENANCE_TYPES,
  MODELS,
  PARTS,
  SERVICE_TYPES,
  STATIONS,
  TECHNICIANS,
  TRIP_PURPOSES,
  UPCOUNTRY_LOCATIONS,
  WORKSHOPS,
} from './data'
export const SEED_VERSION = 7
export const DEMO_PASSWORD = 'Limoz#2026'
const HISTORY_DAYS = 90
const FUTURE_DAYS = 10
const iso = (d) => d.toISOString()
const day = (d) => format(d, 'yyyy-MM-dd')
export const DEMO_USERS = [
  { firstName: 'Regis', lastName: 'Ngabo', email: 'admin@limoz.rw', role: 'SUPER_ADMIN' },
  { firstName: 'Eric', lastName: 'Mugisha', email: 'it@limoz.rw', role: 'IT_ADMIN' },
  { firstName: 'Diane', lastName: 'Ingabire', email: 'management@limoz.rw', role: 'MANAGEMENT' },
  { firstName: 'Patrick', lastName: 'Nsengimana', email: 'fleet@limoz.rw', role: 'FLEET_MANAGER' },
  { firstName: 'Olive', lastName: 'Umutoni', email: 'officer@limoz.rw', role: 'FLEET_OFFICER' },
  { firstName: 'Samuel', lastName: 'Rukundo', email: 'dispatch@limoz.rw', role: 'DISPATCHER' },
  { firstName: 'Claude', lastName: 'Hakizimana', email: 'workshop@limoz.rw', role: 'WORKSHOP_MANAGER' },
  { firstName: 'Theogene', lastName: 'Munyaneza', email: 'technician@limoz.rw', role: 'TECHNICIAN' },
  { firstName: 'Josiane', lastName: 'Mukeshimana', email: 'finance@limoz.rw', role: 'FINANCE' },
  { firstName: 'Jean Bosco', lastName: 'Habimana', email: 'driver@limoz.rw', role: 'DRIVER' },
  { firstName: 'Grace', lastName: 'Uwimana', email: 'viewer@limoz.rw', role: 'VIEWER' },
]
export const DEFAULT_SETTINGS = {
  nightDrivingStart: '22:00',
  nightDrivingEnd: '05:00',
  excessiveDailyDrivingHours: 6,
  highDailyDistanceKm: 500,
  fuelVarianceTolerancePercent: 8,
  documentExpiryWarningDays: [30, 15, 7],
  maintenanceDueSoonKm: 500,
  maintenanceDueSoonDays: 14,
  gpsOfflineThresholdMinutes: 120,
  idleVehicleDays: 3,
  timezone: 'Africa/Kigali',
  currency: 'RWF',
}
export function buildSeed(now = new Date()) {
  const rng = new Rng(20260407)
  const today = startOfDay(now)
  const seq = {}
  const nextId = (key) => (seq[key] = (seq[key] ?? 0) + 1)
  const ts = (d) => ({ createdAt: iso(d), updatedAt: iso(d) })
  const phone = () => `+25078${rng.int(1_000_000, 9_999_999)}`
  const personName = () => `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`
  // ---------- users ----------
  const users = DEMO_USERS.map((u) => ({
    id: nextId('user'),
    ...u,
    phone: phone(),
    password: DEMO_PASSWORD,
    active: true,
    lastLoginAt: iso(subDays(now, rng.int(0, 6))),
    ...ts(subMonths(now, 8)),
  }))
  users.push({
    id: nextId('user'),
    firstName: 'Fabrice',
    lastName: 'Ndayisaba',
    email: 'fabrice.n@limoz.rw',
    role: 'FLEET_OFFICER',
    phone: phone(),
    password: DEMO_PASSWORD,
    active: false,
    lastLoginAt: iso(subMonths(now, 2)),
    ...ts(subMonths(now, 7)),
  })
  const userByRole = (role) => users.find((u) => u.role === role)
  // ---------- categories ----------
  const categories = CATEGORIES.map((c) => ({
    id: nextId('category'),
    name: c.name,
    code: c.code,
    description: c.description,
    seatingCapacity: c.seats,
    active: true,
    ...ts(subMonths(now, 10)),
  }))
  const categoryByCode = (code) => categories.find((c) => c.code === code)
  // ---------- vehicles ----------
  const plateSeries = ['RAD', 'RAE', 'RAF', 'RAG']
  const vehicleSpecs = [0, 0, 1, 2, 3, 3, 3, 4, 4, 5, 6, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 15, 15, 16, 17, 18, 19].map((i) => MODELS[i])
  const vehicles = vehicleSpecs.map((spec, index) => {
    const year = rng.int(2017, 2025)
    const purchase = new Date(year, rng.int(0, 11), rng.int(1, 28))
    const ageYears = Math.max(0.3, (now.getTime() - purchase.getTime()) / (365 * 86_400_000))
    const odometer = Math.round((ageYears * rng.int(18_000, 42_000)) / 100) * 100
    const cat = categoryByCode(spec.category)
    const plate = `${rng.pick(plateSeries)} ${rng.int(100, 999)} ${String.fromCharCode(65 + rng.int(0, 25))}`
    return {
      id: nextId('vehicle'),
      plateNumber: plate,
      fleetNumber: `LMZ-${String(index + 1).padStart(3, '0')}`,
      make: spec.make,
      model: spec.model,
      year,
      categoryId: cat.id,
      bodyType: spec.body,
      fuelType: spec.fuel,
      transmission: spec.transmission,
      engineNumber: `${spec.make.slice(0, 2).toUpperCase()}${rng.int(100000, 999999)}`,
      vin: `JT${rng.int(100000000, 999999999)}${rng.int(10000000, 99999999)}`.slice(0, 17),
      color: rng.pick(COLORS),
      odometerKm: odometer,
      seatingCapacity: spec.seats ?? cat.seatingCapacity ?? 5,
      purchaseDate: day(purchase),
      acquisitionCost: Math.round(rng.float(spec.cost[0], spec.cost[1], 0) / 100_000) * 100_000,
      insurer: rng.pick(['SONARWA', 'Radiant Insurance', 'Prime Insurance', 'Old Mutual Rwanda']),
      insurancePolicyNumber: `POL-${rng.int(100000, 999999)}`,
      insuranceExpiry: null,
      department: rng.pick(DEPARTMENTS),
      status: 'AVAILABLE',
      notes: null,
      archived: false,
      ...ts(purchase),
    }
  })
  // Vehicle status decisions (kept consistent with the records generated below).
  const inWorkshop = new Set([vehicles[5].id, vehicles[13].id, vehicles[21].id])
  const outOfService = new Set([vehicles[24].id])
  const inactive = new Set([vehicles[26].id])
  // ---------- drivers ----------
  const usedNames = new Set()
  const drivers = Array.from({ length: 21 }, (_, i) => {
    let name = i === 0 ? 'Jean Bosco Habimana' : personName()
    while (usedNames.has(name)) name = personName()
    usedNames.add(name)
    const joined = subMonths(now, rng.int(4, 84))
    const licenseIssue = subMonths(joined, rng.int(12, 96))
    const expiryOffset = i === 3 ? -12 : i === 7 ? 9 : i === 11 ? 21 : rng.int(60, 1400)
    return {
      id: nextId('driver'),
      employeeNumber: `DRV-${String(i + 1).padStart(3, '0')}`,
      fullName: name,
      phone: phone(),
      email: rng.chance(0.7) ? `${name.toLowerCase().replace(/\s+/g, '.')}@limoz.rw` : null,
      nationalId: `1${rng.int(1980, 2000)}8${rng.int(1000000, 9999999)}0${rng.int(10, 99)}`,
      licenseNumber: `RW${rng.int(100000, 999999)}`,
      licenseCategory: rng.pick(['B', 'B, C', 'B, D', 'B, C, D', 'C, D, E']),
      licenseIssueDate: day(licenseIssue),
      licenseExpiry: day(addDays(today, expiryOffset)),
      employmentStatus: rng.pick(['FULL_TIME', 'FULL_TIME', 'FULL_TIME', 'CONTRACT', 'CASUAL']),
      joiningDate: day(joined),
      status: 'AVAILABLE',
      emergencyContactName: personName(),
      emergencyContactPhone: phone(),
      notes: null,
      rating: rng.float(3.6, 4.9, 1),
      archived: false,
      ...ts(joined),
    }
  })
  drivers[16].status = 'ON_LEAVE'
  drivers[17].status = 'OFF_DUTY'
  drivers[18].status = 'SUSPENDED'
  drivers[19].status = 'INACTIVE'
  drivers[19].archived = false
  // ---------- assignments (history + current) ----------
  const assignments = []
  const fleetManager = userByRole('FLEET_MANAGER')
  const dispatcher = userByRole('DISPATCHER')
  const currentDriverOf = new Map()
  const activeDrivers = drivers.filter((d) => d.status === 'AVAILABLE')
  const assignableVehicles = vehicles.filter((v) => !inactive.has(v.id) && !outOfService.has(v.id))
  const shuffledDrivers = rng.shuffle(activeDrivers)
  assignableVehicles.forEach((v, idx) => {
    // historical assignments
    let cursor = subDays(today, HISTORY_DAYS + rng.int(30, 120))
    const historyCount = rng.int(1, 3)
    let odo = Math.max(1000, v.odometerKm - rng.int(9000, 16000))
    for (let i = 0; i < historyCount; i++) {
      const d = rng.pick(drivers)
      const start = cursor
      const end = addDays(start, rng.int(20, 70))
      const used = rng.int(800, 3200)
      assignments.push({
        id: nextId('assignment'),
        vehicleId: v.id,
        driverId: d.id,
        startAt: iso(setHours(start, 8)),
        endAt: iso(setHours(end, 17)),
        assignedById: fleetManager.id,
        purpose: rng.pick(['Pool assignment', 'Dedicated client driver', 'Seasonal tour driver', 'Depot shuttle']),
        odometerAtStart: odo,
        odometerAtEnd: odo + used,
        status: 'ENDED',
        comments: null,
        ...ts(start),
      })
      odo += used
      cursor = addDays(end, rng.int(1, 6))
    }
    // current assignment for ~80% of the fleet
    if (idx < shuffledDrivers.length && rng.chance(0.82)) {
      const d = shuffledDrivers[idx]
      const start = subDays(today, rng.int(3, 60))
      assignments.push({
        id: nextId('assignment'),
        vehicleId: v.id,
        driverId: d.id,
        startAt: iso(setHours(start, 8)),
        endAt: null,
        assignedById: rng.chance(0.5) ? fleetManager.id : dispatcher.id,
        purpose: rng.pick(['Pool assignment', 'Dedicated client driver', 'VIP protocol driver', 'Safari season']),
        odometerAtStart: v.odometerKm - rng.int(300, 2500),
        odometerAtEnd: null,
        status: 'ACTIVE',
        comments: null,
        ...ts(start),
      })
      currentDriverOf.set(v.id, d.id)
    }
  })
  // ---------- trips, fuel, movements (chronological per vehicle) ----------
  const trips = []
  const fuel = []
  const movements = []
  const bookings = []
  const priceFor = (fuelType, d) => {
    const base = fuelType === 'PETROL' ? 1_790 : fuelType === 'DIESEL' ? 1_720 : 1_790
    const drift = Math.round(Math.sin(d.getTime() / 8.64e9) * 25)
    return base + drift
  }
  const fuelEfficiency = (v) => {
    const cat = categories.find((c) => c.id === v.categoryId).code
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
    return base[cat] ?? 12 // litres per 100 km
  }
  const tripVehicles = vehicles.filter((v) => !inactive.has(v.id) && !outOfService.has(v.id))
  // Rewind odometers so that generated trips bring them back to the current value.
  const odoCursor = new Map()
  const plannedKm = new Map()
  for (const v of tripVehicles) {
    plannedKm.set(v.id, 0)
    odoCursor.set(v.id, 0)
  }
  const tripsPerDay = (d) => {
    const weekday = d.getDay()
    return weekday === 0 ? rng.int(2, 4) : weekday === 6 ? rng.int(3, 6) : rng.int(6, 11)
  }
  const pending = []
  const lastFuelOdo = new Map()
  const busyToday = new Map()
  for (let offset = -HISTORY_DAYS; offset <= FUTURE_DAYS; offset++) {
    const d = addDays(today, offset)
    const count = tripsPerDay(d)
    const dayVehicles = rng.shuffle(tripVehicles.filter((v) => offset > 0 || !inWorkshop.has(v.id) || offset < -3))
    for (let i = 0; i < count && i < dayVehicles.length; i++) {
      const v = dayVehicles[i]
      const driverId = currentDriverOf.get(v.id) ?? rng.pick(activeDrivers).id
      const upcountry = rng.chance(0.22)
      const from = rng.pick(CITY_LOCATIONS)
      const to = upcountry ? rng.pick(UPCOUNTRY_LOCATIONS) : rng.pick(CITY_LOCATIONS.filter((l) => l !== from))
      const distance = upcountry ? rng.int(90, 420) : rng.int(6, 48)
      const durationMin = upcountry ? Math.round(distance * rng.float(1.3, 1.8)) : Math.round(distance * rng.float(2.2, 3.4))
      const startHour = rng.chance(0.08) ? rng.int(20, 23) : rng.int(5, 18)
      const start = setMinutes(setHours(d, startHour), rng.pick([0, 15, 30, 45]))
      const endAt = addMinutes(start, durationMin)
      let status
      if (endAt < now) status = rng.chance(0.94) ? 'COMPLETED' : 'CANCELLED'
      else if (start <= now && endAt > now) status = 'IN_PROGRESS'
      else if (offset === 0) status = rng.chance(0.6) ? 'DISPATCHED' : 'PLANNED'
      else status = offset <= 2 && rng.chance(0.5) ? 'DISPATCHED' : 'PLANNED'
      if (status === 'IN_PROGRESS' && busyToday.has(v.id)) status = 'PLANNED'
      if (status === 'IN_PROGRESS') busyToday.set(v.id, start)
      pending.push({
        vehicle: v,
        driverId,
        start,
        distance,
        durationMin,
        from,
        to,
        purpose: rng.pick(TRIP_PURPOSES),
        passengers: rng.int(1, Math.min(v.seatingCapacity, 12)),
        customer: rng.chance(0.65) ? rng.pick(COMPANIES) : null,
        status,
        upcountry,
      })
    }
  }
  pending.sort((a, b) => a.start.getTime() - b.start.getTime())
  for (const p of pending) if (p.status === 'COMPLETED') plannedKm.set(p.vehicle.id, (plannedKm.get(p.vehicle.id) ?? 0) + p.distance)
  for (const v of tripVehicles) odoCursor.set(v.id, v.odometerKm - (plannedKm.get(v.id) ?? 0) - rng.int(0, 150))
  const movementMap = new Map()
  const bumpMovement = (vehicleId, start, end, distance, maxSpeed) => {
    const key = `${vehicleId}:${day(start)}`
    const m = movementMap.get(key) ?? {
      vehicleId,
      date: day(start),
      distanceKm: 0,
      firstMovementAt: null,
      lastMovementAt: null,
      drivingMinutes: 0,
      idleMinutes: 0,
      maxSpeedKph: 0,
      tripCount: 0,
      nightDriving: false,
    }
    m.distanceKm += distance
    m.tripCount += 1
    m.drivingMinutes += Math.round((end.getTime() - start.getTime()) / 60000)
    m.maxSpeedKph = Math.max(m.maxSpeedKph, maxSpeed)
    if (!m.firstMovementAt || start < new Date(m.firstMovementAt)) m.firstMovementAt = iso(start)
    if (!m.lastMovementAt || end > new Date(m.lastMovementAt)) m.lastMovementAt = iso(end)
    const h = start.getHours()
    if (h >= 22 || h < 5 || end.getHours() < 5) m.nightDriving = true
    movementMap.set(key, m)
  }
  for (const p of pending) {
    const v = p.vehicle
    const id = nextId('trip')
    const endAt = addMinutes(p.start, p.durationMin)
    const completed = p.status === 'COMPLETED'
    const inProgress = p.status === 'IN_PROGRESS'
    const startOdo = completed || inProgress ? odoCursor.get(v.id) : null
    const endOdo = completed ? startOdo + p.distance : null
    if (completed) odoCursor.set(v.id, endOdo)
    const eff = fuelEfficiency(v)
    const maxSpeed = completed || inProgress ? (p.upcountry ? rng.int(78, 112) : rng.int(42, 68)) : null
    let bookingId = null
    let customer = p.customer
    if (customer && rng.chance(0.55)) {
      const bId = nextId('booking')
      bookingId = bId
      const bookingStatus =
        p.status === 'COMPLETED'
          ? 'COMPLETED'
          : p.status === 'CANCELLED'
            ? 'CANCELLED'
            : p.status === 'IN_PROGRESS'
              ? 'IN_PROGRESS'
              : 'ASSIGNED'
      bookings.push({
        id: bId,
        bookingNumber: `BK-${format(p.start, 'yyMM')}-${String(bId).padStart(4, '0')}`,
        customerName: personName(),
        company: customer,
        contactPhone: phone(),
        contactEmail: rng.chance(0.6) ? `bookings@${customer.toLowerCase().replace(/[^a-z]/g, '')}.rw` : null,
        requestedCategoryId: v.categoryId,
        vehicleId: v.id,
        driverId: p.driverId,
        pickupLocation: p.from,
        dropoffLocation: p.to,
        pickupAt: iso(p.start),
        returnAt: iso(endAt),
        serviceType: p.upcountry ? rng.pick(['Daily hire', 'Safari tour']) : rng.pick(SERVICE_TYPES.slice(0, 6)),
        passengers: p.passengers,
        status: bookingStatus,
        notes: null,
        quotedAmount: Math.round((p.upcountry ? rng.int(180_000, 650_000) : rng.int(35_000, 120_000)) / 5000) * 5000,
        ...ts(subDays(p.start, rng.int(1, 12))),
      })
    }
    trips.push({
      id,
      tripNumber: `TR-${format(p.start, 'yyMMdd')}-${String(id).padStart(4, '0')}`,
      vehicleId: v.id,
      driverId: p.driverId,
      customerName: customer,
      bookingId,
      startLocation: p.from,
      destination: p.to,
      scheduledStartAt: iso(p.start),
      startedAt: completed || inProgress ? iso(addMinutes(p.start, rng.int(-5, 20))) : null,
      endedAt: completed ? iso(addMinutes(endAt, rng.int(-10, 25))) : null,
      startOdometer: startOdo,
      endOdometer: endOdo,
      fuelUsedLitres: completed ? Math.round(((p.distance * eff) / 100) * 10) / 10 : null,
      maxSpeedKph: maxSpeed,
      purpose: p.purpose,
      passengers: p.passengers,
      status: p.status,
      notes: p.status === 'CANCELLED' ? rng.pick(['Client cancelled', 'Vehicle reallocated', 'Flight delayed to next day']) : null,
      ...ts(subDays(p.start, rng.int(0, 5))),
    })
    if (completed) {
      bumpMovement(v.id, new Date(trips[trips.length - 1].startedAt), new Date(trips[trips.length - 1].endedAt), p.distance, maxSpeed)
      // refuel roughly every 350–650 km
      const last = lastFuelOdo.get(v.id) ?? startOdo - rng.int(50, 300)
      const threshold = rng.int(350, 650)
      if (endOdo - last >= threshold) {
        const fid = nextId('fuel')
        const at = addMinutes(endAt, rng.int(10, 90))
        const distanceSince = endOdo - last
        let litres = Math.round(((distanceSince * eff) / 100) * rng.float(0.92, 1.08) * 10) / 10
        let notes = null
        if (fid % 23 === 0) {
          litres = Math.round(litres * 1.45 * 10) / 10
          notes = 'Litres well above expected consumption; flagged for review.'
        }
        fuel.push({
          id: fid,
          vehicleId: v.id,
          driverId: p.driverId,
          station: p.upcountry ? rng.pick(STATIONS.slice(6, 8)) : rng.pick(STATIONS.slice(0, 6).concat(STATIONS[8])),
          transactedAt: iso(at),
          fuelType: v.fuelType,
          litres,
          pricePerLitre: priceFor(v.fuelType, at),
          odometerKm: endOdo,
          receiptNumber: `R${format(at, 'yyMMdd')}-${rng.int(1000, 9999)}`,
          enteredById: rng.pick([userByRole('FLEET_OFFICER').id, userByRole('FINANCE').id, userByRole('DISPATCHER').id]),
          notes,
          ...ts(at),
        })
        lastFuelOdo.set(v.id, endOdo)
      }
    }
  }
  movements.push(...movementMap.values())
  // Stand-alone bookings (requested/confirmed/cancelled) not yet tied to trips
  for (let i = 0; i < 16; i++) {
    const inFuture = i < 11
    const pickup = inFuture
      ? setMinutes(setHours(addDays(today, rng.int(0, 14)), rng.int(5, 19)), rng.pick([0, 30]))
      : setMinutes(setHours(subDays(today, rng.int(2, 60)), rng.int(5, 19)), rng.pick([0, 30]))
    const upcountry = rng.chance(0.3)
    const company = rng.pick(COMPANIES)
    const cat = rng.pick(categories.slice(0, 7))
    const bId = nextId('booking')
    bookings.push({
      id: bId,
      bookingNumber: `BK-${format(pickup, 'yyMM')}-${String(bId).padStart(4, '0')}`,
      customerName: personName(),
      company,
      contactPhone: phone(),
      contactEmail: `${company.toLowerCase().replace(/[^a-z]/g, '')}@example.rw`,
      requestedCategoryId: cat.id,
      vehicleId: null,
      driverId: null,
      pickupLocation: rng.pick(CITY_LOCATIONS),
      dropoffLocation: upcountry ? rng.pick(UPCOUNTRY_LOCATIONS) : rng.pick(CITY_LOCATIONS),
      pickupAt: iso(pickup),
      returnAt: iso(addHours(pickup, upcountry ? rng.int(8, 48) : rng.int(1, 6))),
      serviceType: rng.pick(SERVICE_TYPES),
      passengers: rng.int(1, cat.seatingCapacity ?? 4),
      status: inFuture ? (rng.chance(0.5) ? 'REQUESTED' : 'CONFIRMED') : 'CANCELLED',
      notes: rng.chance(0.4)
        ? rng.pick([
            'Client requests English-speaking driver.',
            'Flight RW 401 arriving 14:20.',
            'Child seat required.',
            'Invoice to company account.',
          ])
        : null,
      quotedAmount: Math.round((upcountry ? rng.int(180_000, 650_000) : rng.int(35_000, 120_000)) / 5000) * 5000,
      ...ts(subDays(pickup, rng.int(1, 10))),
    })
  }
  // ---------- spare parts ----------
  const parts = PARTS.map((p) => ({
    id: nextId('part'),
    partNumber: p.partNumber,
    name: p.name,
    category: p.category,
    unitCost: p.unitCost,
    supplier: p.supplier,
    minimumStock: p.min,
    currentStock: rng.chance(0.2) ? rng.int(0, p.min - 1) : rng.int(p.min, p.min * 4),
    ...ts(subMonths(now, 6)),
  }))
  // ---------- maintenance ----------
  const maintenance = []
  const makeMaintenance = (v, reportedAt, status, type) => {
    const t = type ?? rng.pick(MAINTENANCE_TYPES)
    const id = nextId('maintenance')
    const partCount = t === 'INSPECTION' ? 0 : rng.int(0, 3)
    const chosen = rng
      .shuffle(parts)
      .slice(0, partCount)
      .map((p) => ({ partId: p.id, quantity: rng.int(1, 4), unitCost: p.unitCost }))
    const started = ['REPORTED', 'INSPECTION'].includes(status) ? null : addHours(reportedAt, rng.int(2, 30))
    const expected = started ? addDays(started, rng.int(1, 5)) : addDays(reportedAt, rng.int(2, 6))
    const completed = status === 'COMPLETED' ? addHours(expected, rng.int(-30, 20)) : null
    const terminal = status === 'COMPLETED' || status === 'CANCELLED'
    return {
      id,
      maintenanceNumber: `MT-${format(reportedAt, 'yyMM')}-${String(id).padStart(4, '0')}`,
      vehicleId: v.id,
      reportedAt: iso(reportedAt),
      reportedById: rng.pick([userByRole('FLEET_OFFICER').id, userByRole('DISPATCHER').id, userByRole('FLEET_MANAGER').id]),
      complaint: rng.pick(COMPLAINTS[t]),
      type: t,
      technicianName: status === 'REPORTED' ? null : rng.pick(TECHNICIANS),
      workshop: rng.pick(WORKSHOPS),
      startedAt: started ? iso(started) : null,
      expectedCompletionAt: iso(expected),
      completedAt: completed ? iso(completed) : null,
      odometerKm: Math.max(0, v.odometerKm - rng.int(0, 6000)),
      diagnosis: ['REPORTED'].includes(status)
        ? null
        : rng.pick([
            'Worn components confirmed on inspection.',
            'Fault traced to sensor wiring.',
            'Within tolerance; preventive replacement advised.',
            'Requires OEM part; ordered from supplier.',
          ]),
      servicePerformed:
        status === 'COMPLETED'
          ? rng.pick([
              'Replaced parts, road-tested, cleared codes.',
              'Full service performed per schedule.',
              'Repaired and verified under load.',
            ])
          : null,
      parts: chosen,
      laborCost: terminal || started ? rng.int(25_000, 240_000) : 0,
      otherCost: rng.chance(0.3) ? rng.int(10_000, 80_000) : 0,
      status,
      comments: null,
      createdAt: iso(reportedAt),
      updatedAt: iso(completed ?? started ?? reportedAt),
    }
  }
  for (const v of vehicles) {
    const count = rng.int(1, 3)
    for (let i = 0; i < count; i++) {
      const reportedAt = subDays(today, rng.int(8, HISTORY_DAYS + 60))
      maintenance.push(makeMaintenance(v, setHours(reportedAt, rng.int(7, 16)), rng.chance(0.9) ? 'COMPLETED' : 'CANCELLED'))
    }
  }
  maintenance.push(makeMaintenance(vehicles[5], setHours(subDays(today, 2), 9), 'IN_PROGRESS', 'CORRECTIVE'))
  maintenance.push(makeMaintenance(vehicles[13], setHours(subDays(today, 4), 10), 'WAITING_FOR_PARTS', 'ELECTRICAL'))
  maintenance.push(makeMaintenance(vehicles[21], setHours(subDays(today, 1), 8), 'INSPECTION', 'TYRES'))
  maintenance.push(makeMaintenance(vehicles[2], setHours(today, 7), 'REPORTED', 'CORRECTIVE'))
  maintenance.push(makeMaintenance(vehicles[9], setHours(subDays(today, 1), 14), 'APPROVED', 'PREVENTIVE'))
  maintenance.push(makeMaintenance(vehicles[24], setHours(subDays(today, 20), 11), 'WAITING_FOR_PARTS', 'CORRECTIVE'))
  maintenance.sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))
  // ---------- preventive schedules ----------
  const schedules = []
  const scheduleTasks = [
    { task: 'Engine oil & filter', km: 5000, days: 180 },
    { task: 'Air filter', km: 15000, days: null },
    { task: 'Brake inspection', km: 10000, days: 180 },
    { task: 'Tyre rotation', km: 10000, days: null },
    { task: 'General service', km: 20000, days: 365 },
    { task: 'Transmission fluid', km: 60000, days: 730 },
  ]
  for (const v of vehicles) {
    if (inactive.has(v.id)) continue
    for (const t of rng.shuffle(scheduleTasks).slice(0, rng.int(3, 5))) {
      const sinceKm = rng.chance(0.18) ? (t.km ? t.km + rng.int(50, 900) : 0) : rng.int(0, (t.km ?? 10000) - 100)
      const lastKm = Math.max(0, v.odometerKm - sinceKm)
      const lastDate = subDays(today, Math.round(sinceKm / 55) + rng.int(0, 20))
      schedules.push({
        id: nextId('schedule'),
        vehicleId: v.id,
        task: t.task,
        intervalKm: t.km,
        intervalDays: t.days,
        lastServiceKm: lastKm,
        lastServiceDate: day(lastDate),
      })
    }
  }
  // ---------- incidents ----------
  const incidents = []
  const incidentPlan = [
    { daysAgo: 0, status: 'OPEN', severity: 'HIGH', type: 'ACCIDENT', vehicleIdx: 2 },
    { daysAgo: 1, status: 'OPEN', severity: 'MEDIUM', type: 'FUEL_ANOMALY', vehicleIdx: 15 },
    { daysAgo: 3, status: 'UNDER_INVESTIGATION', severity: 'CRITICAL', type: 'ACCIDENT', vehicleIdx: 24 },
    { daysAgo: 5, status: 'UNDER_INVESTIGATION', severity: 'LOW', type: 'TRAFFIC_VIOLATION' },
    { daysAgo: 9, status: 'RESOLVED', severity: 'MEDIUM', type: 'BREAKDOWN' },
    { daysAgo: 14, status: 'CLOSED', severity: 'LOW', type: 'CUSTOMER_COMPLAINT' },
    { daysAgo: 21, status: 'CLOSED', severity: 'MEDIUM', type: 'DAMAGE' },
    { daysAgo: 28, status: 'CLOSED', severity: 'LOW', type: 'TRAFFIC_VIOLATION' },
    { daysAgo: 35, status: 'CLOSED', severity: 'HIGH', type: 'THEFT' },
    { daysAgo: 44, status: 'CLOSED', severity: 'MEDIUM', type: 'BREAKDOWN' },
    { daysAgo: 51, status: 'RESOLVED', severity: 'LOW', type: 'CUSTOMER_COMPLAINT' },
    { daysAgo: 60, status: 'CLOSED', severity: 'MEDIUM', type: 'FUEL_ANOMALY' },
    { daysAgo: 72, status: 'CLOSED', severity: 'HIGH', type: 'ACCIDENT' },
    { daysAgo: 84, status: 'CLOSED', severity: 'LOW', type: 'DAMAGE' },
  ]
  for (const plan of incidentPlan) {
    const v = plan.vehicleIdx !== undefined ? vehicles[plan.vehicleIdx] : rng.pick(tripVehicles)
    const at = setMinutes(setHours(subDays(today, plan.daysAgo), rng.int(6, 21)), rng.pick([0, 10, 25, 40, 55]))
    const id = nextId('incident')
    const type = plan.type ?? rng.pick(INCIDENT_TYPES)
    const reporter = users[rng.int(3, 6)]
    const history = [
      {
        at: iso(addMinutes(at, rng.int(10, 120))),
        byName: `${reporter.firstName} ${reporter.lastName}`,
        action: 'Incident reported',
        note: null,
      },
    ]
    if (plan.status !== 'OPEN')
      history.push({
        at: iso(addHours(at, rng.int(3, 30))),
        byName: `${fleetManager.firstName} ${fleetManager.lastName}`,
        action: 'Investigation opened',
        note: 'Driver statement and photos requested.',
      })
    if (plan.status === 'RESOLVED' || plan.status === 'CLOSED')
      history.push({
        at: iso(addDays(at, rng.int(2, 8))),
        byName: `${fleetManager.firstName} ${fleetManager.lastName}`,
        action: 'Marked resolved',
        note: 'Corrective action completed.',
      })
    if (plan.status === 'CLOSED')
      history.push({ at: iso(addDays(at, rng.int(9, 14))), byName: 'Diane Ingabire', action: 'Closed', note: null })
    incidents.push({
      id,
      incidentNumber: `INC-${format(at, 'yyMM')}-${String(id).padStart(3, '0')}`,
      vehicleId: v.id,
      driverId: currentDriverOf.get(v.id) ?? rng.pick(drivers).id,
      occurredAt: iso(at),
      location: rng.pick(CITY_LOCATIONS.concat(UPCOUNTRY_LOCATIONS)),
      type,
      description: rng.pick(INCIDENT_DESCRIPTIONS[type]),
      severity: plan.severity,
      investigation:
        plan.status === 'OPEN'
          ? null
          : rng.pick([
              'Driver interviewed; dashcam footage reviewed.',
              'Police report obtained (RNP ref. KGL-' + rng.int(1000, 9999) + ').',
              'Workshop inspection carried out.',
            ]),
      correctiveAction:
        plan.status === 'RESOLVED' || plan.status === 'CLOSED'
          ? rng.pick([
              'Driver retrained on defensive driving.',
              'Repairs completed; insurer claim filed.',
              'Fuel card limits reduced; sensor recalibrated.',
              'Fine paid and deducted per policy.',
            ])
          : null,
      estimatedCost: ['ACCIDENT', 'DAMAGE', 'BREAKDOWN', 'THEFT'].includes(type)
        ? rng.int(80_000, 2_400_000)
        : ['TRAFFIC_VIOLATION'].includes(type)
          ? rng.int(25_000, 150_000)
          : null,
      status: plan.status,
      attachments: rng.chance(0.6)
        ? [
            {
              id: nextId('attachment'),
              fileName: `incident-${id}-photo.jpg`,
              contentType: 'image/jpeg',
              sizeBytes: rng.int(400_000, 2_400_000),
              uploadedAt: iso(addMinutes(at, 60)),
              url: '#',
            },
          ]
        : [],
      history,
      createdAt: iso(at),
      updatedAt: history[history.length - 1].at,
    })
  }
  // ---------- documents ----------
  const documents = []
  let docTweak = 0
  for (const v of vehicles) {
    for (const t of DOCUMENT_TYPES_VEHICLE) {
      docTweak++
      let expiryOffset = rng.int(40, 400)
      if (docTweak % 29 === 0) expiryOffset = -rng.int(3, 40)
      else if (docTweak % 11 === 0) expiryOffset = rng.int(2, 28)
      if (v.id === vehicles[24].id && t === 'INSURANCE') expiryOffset = -9
      const expiry = addDays(today, expiryOffset)
      const issue = subDays(expiry, t === 'INSPECTION' ? 182 : 365)
      const id = nextId('document')
      documents.push({
        id,
        ownerType: 'VEHICLE',
        ownerId: v.id,
        type: t,
        number: t === 'INSURANCE' ? v.insurancePolicyNumber : `${t.slice(0, 3)}-${rng.int(100000, 999999)}`,
        issueDate: day(issue),
        expiryDate: day(expiry),
        attachment: rng.chance(0.75)
          ? {
              id: nextId('attachment'),
              fileName: `${v.plateNumber.replace(/\s/g, '')}-${t.toLowerCase()}.pdf`,
              contentType: 'application/pdf',
              sizeBytes: rng.int(80_000, 900_000),
              uploadedAt: iso(issue),
              url: '#',
            }
          : null,
        notes: null,
        ...ts(issue),
      })
      if (t === 'INSURANCE') v.insuranceExpiry = day(expiry)
    }
  }
  for (const d of drivers) {
    documents.push({
      id: nextId('document'),
      ownerType: 'DRIVER',
      ownerId: d.id,
      type: 'DRIVER_LICENCE',
      number: d.licenseNumber,
      issueDate: d.licenseIssueDate,
      expiryDate: d.licenseExpiry,
      attachment: rng.chance(0.6)
        ? {
            id: nextId('attachment'),
            fileName: `${d.employeeNumber}-licence.pdf`,
            contentType: 'application/pdf',
            sizeBytes: rng.int(80_000, 400_000),
            uploadedAt: d.createdAt,
            url: '#',
          }
        : null,
      notes: null,
      ...ts(new Date(d.licenseIssueDate)),
    })
  }
  // ---------- vehicle statuses ----------
  const inProgressVehicleIds = new Set(trips.filter((t) => t.status === 'IN_PROGRESS').map((t) => t.vehicleId))
  for (const v of vehicles) {
    if (inactive.has(v.id)) v.status = 'INACTIVE'
    else if (outOfService.has(v.id)) v.status = 'OUT_OF_SERVICE'
    else if (inWorkshop.has(v.id)) v.status = 'IN_MAINTENANCE'
    else if (inProgressVehicleIds.has(v.id)) v.status = 'ON_TRIP'
    else if (currentDriverOf.has(v.id)) v.status = 'ASSIGNED'
    else v.status = 'AVAILABLE'
  }
  const reservedCandidate = vehicles.find((v) => v.status === 'AVAILABLE')
  if (reservedCandidate) reservedCandidate.status = 'RESERVED'
  for (const d of drivers) {
    if (!['AVAILABLE'].includes(d.status)) continue
    const vId = [...currentDriverOf.entries()].find(([, driverId]) => driverId === d.id)?.[0]
    if (vId && inProgressVehicleIds.has(vId)) d.status = 'ON_TRIP'
    else if (vId) d.status = 'ASSIGNED'
  }
  // ---------- telemetry ----------
  const telemetry = {}
  vehicles.forEach((v, i) => {
    let status = 'ONLINE'
    let lastComm = addMinutes(now, -rng.int(1, 25))
    if (i === 7 || i === 18) {
      status = 'OFFLINE'
      lastComm = addHours(now, -rng.int(5, 40))
    }
    if (i === 12) {
      status = 'NO_SIGNAL'
      lastComm = addMinutes(now, -rng.int(130, 400))
    }
    if (v.status === 'INACTIVE') {
      status = 'DISCONNECTED'
      lastComm = subDays(now, 40)
    }
    if (v.status === 'OUT_OF_SERVICE') {
      status = 'OFFLINE'
      lastComm = subDays(now, 6)
    }
    const onTrip = v.status === 'ON_TRIP'
    telemetry[v.id] = {
      deviceId: status === 'DISCONNECTED' ? null : `TLT-${rng.int(100000, 999999)}`,
      status,
      lastCommunicationAt: iso(lastComm),
      latitude: -1.95 + rng.float(-0.25, 0.25, 4),
      longitude: 30.06 + rng.float(-0.3, 0.3, 4),
      speedKph: status === 'ONLINE' && onTrip ? rng.int(25, 95) : 0,
      ignitionOn: status === 'ONLINE' ? onTrip : null,
      batteryPercent: status === 'DISCONNECTED' ? null : rng.int(55, 100),
      fuelSensorOk: i === 15 || i === 3 ? false : status === 'DISCONNECTED' ? null : true,
      moving: status === 'ONLINE' ? onTrip : null,
    }
  })
  // ---------- notifications ----------
  const notifications = []
  const notifTemplates = [
    {
      title: 'Insurance expired',
      body: `${vehicles[24].plateNumber} insurance expired 9 days ago. Vehicle is blocked from dispatch.`,
      link: `/vehicles/${vehicles[24].id}?tab=documents`,
      kind: 'ALERT',
    },
    {
      title: 'GPS offline',
      body: `${vehicles[7].plateNumber} has not reported for more than 5 hours.`,
      link: `/vehicles/${vehicles[7].id}`,
      kind: 'ALERT',
    },
    {
      title: 'Maintenance waiting for parts',
      body: `${vehicles[13].plateNumber}: alternator ordered from supplier, ETA 2 days.`,
      link: `/maintenance`,
      kind: 'WORKFLOW',
    },
    {
      title: 'New booking request',
      body: `${bookings[bookings.length - 1].company} requested a ${categories.find((c) => c.id === bookings[bookings.length - 1].requestedCategoryId).name}.`,
      link: `/bookings/${bookings[bookings.length - 1].id}`,
      kind: 'WORKFLOW',
    },
    {
      title: 'Driver licence expiring',
      body: `${drivers[7].fullName}'s licence expires in 9 days.`,
      link: `/drivers/${drivers[7].id}`,
      kind: 'ALERT',
    },
    {
      title: 'Fuel anomaly flagged',
      body: 'A fuel transaction exceeded expected consumption by more than 40%.',
      link: '/fuel',
      kind: 'ALERT',
    },
    {
      title: 'Weekly fleet report ready',
      body: 'The weekly fleet availability report has been generated.',
      link: '/reports/fleet-availability',
      kind: 'SYSTEM',
    },
    {
      title: 'Incident reported',
      body: `${incidents[0].incidentNumber}: ${incidents[0].description}`,
      link: `/incidents/${incidents[0].id}`,
      kind: 'ALERT',
    },
  ]
  for (const u of users) {
    notifTemplates.forEach((t, i) => {
      const at = addMinutes(now, -(i * 97 + rng.int(5, 60)))
      notifications.push({
        id: nextId('notification'),
        userId: u.id,
        title: t.title,
        body: t.body,
        createdAt: iso(at),
        readAt: i > 3 ? iso(addMinutes(at, 30)) : null,
        link: t.link,
        kind: t.kind,
      })
    })
  }
  // ---------- audit ----------
  const audit = []
  const auditActions = ['CREATE', 'UPDATE', 'STATUS_CHANGE', 'ASSIGN', 'LOGIN', 'EXPORT', 'DELETE']
  for (let i = 0; i < 140; i++) {
    const u = rng.pick(users.filter((x) => x.active))
    const action = rng.pick(auditActions)
    const at = addMinutes(now, -rng.int(5, 60 * 24 * 45))
    const entityPool = [
      {
        type: 'VEHICLE',
        pick: () => {
          const v = rng.pick(vehicles)
          return { id: v.id, label: v.plateNumber }
        },
      },
      {
        type: 'TRIP',
        pick: () => {
          const t = rng.pick(trips)
          return { id: t.id, label: t.tripNumber }
        },
      },
      {
        type: 'MAINTENANCE',
        pick: () => {
          const m = rng.pick(maintenance)
          return { id: m.id, label: m.maintenanceNumber }
        },
      },
      {
        type: 'FUEL_TRANSACTION',
        pick: () => {
          const f = rng.pick(fuel)
          return { id: f.id, label: `Fuel #${f.id}` }
        },
      },
      {
        type: 'DRIVER',
        pick: () => {
          const d = rng.pick(drivers)
          return { id: d.id, label: d.fullName }
        },
      },
      {
        type: 'BOOKING',
        pick: () => {
          const b = rng.pick(bookings)
          return { id: b.id, label: b.bookingNumber }
        },
      },
      {
        type: 'USER',
        pick: () => {
          const x = rng.pick(users)
          return { id: x.id, label: x.email }
        },
      },
    ]
    const e = action === 'LOGIN' ? null : rng.pick(entityPool)
    const picked = e?.pick()
    const changes =
      action === 'UPDATE' || action === 'STATUS_CHANGE'
        ? [
            rng.pick([
              { field: 'status', from: 'AVAILABLE', to: 'ASSIGNED' },
              { field: 'odometerKm', from: 120450, to: 120980 },
              { field: 'notes', from: null, to: 'Updated after inspection' },
              { field: 'role', from: 'VIEWER', to: 'FLEET_OFFICER' },
              { field: 'status', from: 'IN_PROGRESS', to: 'COMPLETED' },
            ]),
          ]
        : null
    audit.push({
      id: nextId('audit'),
      at: iso(at),
      userName: `${u.firstName} ${u.lastName}`,
      userId: u.id,
      action,
      entityType: e?.type ?? 'SESSION',
      entityId: picked?.id ?? null,
      entityLabel: picked?.label ?? null,
      changes,
      ipAddress: `197.243.${rng.int(1, 254)}.${rng.int(1, 254)}`,
    })
  }
  audit.sort((a, b) => b.at.localeCompare(a.at))
  // Final odometer reconciliation: ensure stored odometer >= last recorded trip odometer.
  for (const v of tripVehicles) {
    const last = odoCursor.get(v.id)
    if (last && last > v.odometerKm) v.odometerKm = last
  }
  return {
    version: SEED_VERSION,
    seededOn: day(today),
    settings: { ...DEFAULT_SETTINGS },
    users,
    categories,
    vehicles,
    drivers,
    assignments,
    trips,
    bookings,
    fuel,
    maintenance,
    schedules,
    parts,
    incidents,
    documents,
    telemetry,
    movements,
    alertAcks: {},
    notifications,
    audit,
    sequences: seq,
  }
}
export const daysBetween = (a, b) => differenceInCalendarDays(a, b)
