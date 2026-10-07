import { post } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest } from '../core'
import { recordAudit } from '../mappers'
import { REFERENCE } from './reference'

/**
 * CSV import: the client parses the file and posts rows; the server validates each
 * one, imports the good ones and reports every rejection with its reason.
 */
const importers = {
  vehicles: {
    required: ['plateNumber', 'fleetNumber', 'make', 'model', 'year', 'category'],
    handle(row, d, now) {
      const errors = []
      const plate = String(row.plateNumber ?? '')
        .trim()
        .toUpperCase()
      if (d.vehicles.some((v) => v.plateNumber.replace(/\s/g, '') === plate.replace(/\s/g, ''))) return { duplicate: true }
      const cat = d.categories.find(
        (c) =>
          c.name.toLowerCase() ===
            String(row.category ?? '')
              .trim()
              .toLowerCase() ||
          c.code.toLowerCase() ===
            String(row.category ?? '')
              .trim()
              .toLowerCase(),
      )
      if (!cat) errors.push(`Unknown category "${row.category}"`)
      const year = Number(row.year)
      if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1) errors.push(`Invalid year "${row.year}"`)
      const fuelType = String(row.fuelType ?? 'DIESEL')
        .trim()
        .toUpperCase()
      if (!REFERENCE.fuelTypes.some((f) => f.value === fuelType)) errors.push(`Invalid fuel type "${row.fuelType}"`)
      const odo = Number(row.odometerKm ?? 0)
      if (!Number.isFinite(odo) || odo < 0) errors.push(`Invalid odometer "${row.odometerKm}"`)
      if (errors.length) return { errors }
      d.vehicles.push({
        id: nextId('vehicle'),
        plateNumber: plate,
        fleetNumber: String(row.fleetNumber).trim().toUpperCase(),
        make: String(row.make).trim(),
        model: String(row.model).trim(),
        year,
        categoryId: cat.id,
        bodyType: row.bodyType || null,
        fuelType,
        transmission: String(row.transmission ?? 'AUTOMATIC').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTOMATIC',
        engineNumber: row.engineNumber || null,
        vin: row.vin || null,
        color: row.color || 'Unspecified',
        odometerKm: Math.round(odo),
        seatingCapacity: Number(row.seatingCapacity) || cat.seatingCapacity || 5,
        purchaseDate: row.purchaseDate || null,
        acquisitionCost: row.acquisitionCost ? Number(row.acquisitionCost) : null,
        insurer: row.insurer || null,
        insurancePolicyNumber: null,
        insuranceExpiry: null,
        department: row.department || null,
        status: 'AVAILABLE',
        notes: 'Imported from CSV',
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      return {}
    },
  },
  drivers: {
    required: ['fullName', 'employeeNumber', 'phone', 'nationalId', 'licenseNumber', 'licenseExpiry'],
    handle(row, d, now) {
      const errors = []
      if (
        d.drivers.some(
          (x) =>
            x.employeeNumber.toLowerCase() === String(row.employeeNumber).trim().toLowerCase() ||
            x.licenseNumber.toLowerCase() === String(row.licenseNumber).trim().toLowerCase(),
        )
      )
        return { duplicate: true }
      if (!/^\d{16}$/.test(String(row.nationalId).trim())) errors.push('National ID must have 16 digits')
      if (!/^\+?[0-9 ]{9,15}$/.test(String(row.phone).trim())) errors.push(`Invalid phone "${row.phone}"`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.licenseExpiry))) errors.push('licenseExpiry must be YYYY-MM-DD')
      if (errors.length) return { errors }
      const id = nextId('driver')
      d.drivers.push({
        id,
        employeeNumber: String(row.employeeNumber).trim().toUpperCase(),
        fullName: String(row.fullName).trim(),
        phone: String(row.phone).replace(/\s/g, ''),
        email: row.email || null,
        nationalId: String(row.nationalId).trim(),
        licenseNumber: String(row.licenseNumber).trim().toUpperCase(),
        licenseCategory: row.licenseCategory || 'B',
        licenseIssueDate: row.licenseIssueDate || now.slice(0, 10),
        licenseExpiry: row.licenseExpiry,
        employmentStatus: ['FULL_TIME', 'CONTRACT', 'CASUAL'].includes(row.employmentStatus) ? row.employmentStatus : 'FULL_TIME',
        joiningDate: row.joiningDate || now.slice(0, 10),
        status: 'AVAILABLE',
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: 'Imported from CSV',
        rating: 0,
        archived: false,
        createdAt: now,
        updatedAt: now,
      })
      d.documents.push({
        id: nextId('document'),
        ownerType: 'DRIVER',
        ownerId: id,
        type: 'DRIVER_LICENCE',
        number: String(row.licenseNumber).trim().toUpperCase(),
        issueDate: row.licenseIssueDate || now.slice(0, 10),
        expiryDate: row.licenseExpiry,
        attachment: null,
        notes: null,
        createdAt: now,
        updatedAt: now,
      })
      return {}
    },
  },
  fuel: {
    required: ['plateNumber', 'transactedAt', 'litres', 'pricePerLitre', 'odometerKm', 'station'],
    handle(row, d, now, user) {
      const errors = []
      const v = d.vehicles.find(
        (x) => x.plateNumber.replace(/\s/g, '').toLowerCase() === String(row.plateNumber).replace(/\s/g, '').toLowerCase(),
      )
      if (!v) errors.push(`Unknown vehicle "${row.plateNumber}"`)
      const at = new Date(row.transactedAt)
      if (Number.isNaN(at.getTime())) errors.push(`Invalid date "${row.transactedAt}"`)
      const litres = Number(row.litres)
      if (!(litres > 0)) errors.push('Litres must be positive')
      const price = Number(row.pricePerLitre)
      if (!(price > 0)) errors.push('Price per litre must be positive')
      const odo = Number(row.odometerKm)
      if (!(odo >= 0)) errors.push('Invalid odometer')
      if (errors.length) return { errors }
      if (
        row.receiptNumber &&
        d.fuel.some((f) => f.receiptNumber === String(row.receiptNumber).trim() && f.station === String(row.station).trim())
      )
        return { duplicate: true }
      if (d.fuel.some((f) => f.vehicleId === v.id && Math.abs(new Date(f.transactedAt) - at) < 5 * 60000 && f.litres === litres))
        return { duplicate: true }
      d.fuel.push({
        id: nextId('fuel'),
        vehicleId: v.id,
        driverId: null,
        station: String(row.station).trim(),
        transactedAt: at.toISOString(),
        fuelType: v.fuelType,
        litres,
        pricePerLitre: price,
        odometerKm: Math.round(odo),
        receiptNumber: row.receiptNumber ? String(row.receiptNumber).trim() : null,
        enteredById: user.id,
        notes: 'Imported from CSV',
        createdAt: now,
        updatedAt: now,
      })
      if (odo > v.odometerKm) v.odometerKm = Math.round(odo)
      return {}
    },
  },
}

post(
  '/imports/:type',
  ({ params, body, user }) => {
    const importer = importers[params.type]
    if (!importer) throw badRequest(`Unknown import type "${params.type}".`)
    const rows = Array.isArray(body?.rows) ? body.rows : null
    if (!rows) throw badRequest('Provide rows to import.')
    if (rows.length === 0) throw badRequest('The file contains no data rows.')
    if (rows.length > 2000) throw badRequest('Import at most 2,000 rows per file.')
    const d = getDb()
    const now = new Date().toISOString()
    const result = { imported: 0, rejected: 0, duplicates: 0, errors: [] }
    const dryRun = body.dryRun === true
    const snapshot = dryRun
      ? JSON.stringify({ vehicles: d.vehicles, drivers: d.drivers, fuel: d.fuel, documents: d.documents, sequences: d.sequences })
      : null
    rows.forEach((row, index) => {
      const lineNumber = index + 2
      const missing = importer.required.filter((k) => row[k] === undefined || row[k] === null || String(row[k]).trim() === '')
      if (missing.length) {
        result.rejected += 1
        result.errors.push({ row: lineNumber, reason: `Missing ${missing.join(', ')}` })
        return
      }
      const out = importer.handle(row, d, now, user)
      if (out.duplicate) {
        result.duplicates += 1
        result.errors.push({ row: lineNumber, reason: 'Duplicate of an existing record' })
        return
      }
      if (out.errors) {
        result.rejected += 1
        result.errors.push({ row: lineNumber, reason: out.errors.join('; ') })
        return
      }
      result.imported += 1
    })
    if (dryRun) {
      Object.assign(d, JSON.parse(snapshot))
    } else {
      recordAudit({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        action: 'CREATE',
        entityType: 'IMPORT',
        entityId: null,
        entityLabel: `${params.type} import: ${result.imported} imported, ${result.rejected} rejected, ${result.duplicates} duplicates`,
        changes: null,
      })
      persist()
    }
    return result
  },
  { permission: ['VEHICLE_CREATE', 'DRIVER_MANAGE', 'FUEL_MANAGE'] },
)
