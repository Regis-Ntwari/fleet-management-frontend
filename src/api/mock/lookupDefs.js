import { REFERENCE } from './referenceData'
import { COMPANIES, LOCATIONS, STATIONS, TECHNICIANS, TRIP_PURPOSES, WORKSHOPS } from './data'

/**
 * Catalogue of the editable reference lists (Administration → Reference data).
 *
 * kind:
 *  - `coded`  items have a stable code stored on records plus a label and colour; the code never changes.
 *  - `text`   plain suggestions for free-text fields (stations, workshops…); the value is the label itself.
 *  - `status` workflow states driven by business rules: labels and colours can be edited, items cannot
 *             be added, removed or deactivated.
 *
 * `system` items are referenced by business rules (e.g. a HYBRID vehicle accepts petrol, PREVENTIVE work
 * resets schedules), so they can be renamed and recoloured but never deleted or deactivated.
 * `usage` names the record fields that hold the value; deleting an item still in use is refused.
 */
const text = (labels) => labels.map((label) => ({ value: label, label, tone: 'neutral' }))
const withSystem = (items, values) => items.map((i) => ({ ...i, system: values.includes(i.value) }))

export const LOOKUP_LISTS = [
  {
    key: 'fuelTypes',
    name: 'Fuel types',
    group: 'Fleet',
    kind: 'coded',
    description: 'Vehicle fuel types. A fuel entry must match the vehicle’s type (hybrids accept petrol).',
    usage: [
      ['vehicles', 'fuelType'],
      ['fuel', 'fuelType'],
    ],
    items: withSystem(REFERENCE.fuelTypes, ['DIESEL', 'PETROL', 'HYBRID', 'ELECTRIC']),
  },
  {
    key: 'transmissions',
    name: 'Transmissions',
    group: 'Fleet',
    kind: 'coded',
    description: 'Gearbox types offered on the vehicle form.',
    usage: [['vehicles', 'transmission']],
    items: REFERENCE.transmissions,
  },
  {
    key: 'employmentStatuses',
    name: 'Employment statuses',
    group: 'Fleet',
    kind: 'coded',
    description: 'How a driver is engaged. Shown on the driver form and as a filter.',
    usage: [['drivers', 'employmentStatus']],
    items: [
      { value: 'FULL_TIME', label: 'Full time', tone: 'success' },
      { value: 'CONTRACT', label: 'Contract', tone: 'info' },
      { value: 'CASUAL', label: 'Casual', tone: 'neutral' },
    ],
  },
  {
    key: 'documentTypes',
    name: 'Document types',
    group: 'Fleet',
    kind: 'coded',
    description:
      'Compliance documents tracked for vehicles and drivers. Insurance, inspection and road licence block dispatch when expired.',
    usage: [['documents', 'type']],
    items: withSystem(REFERENCE.documentTypes, ['INSURANCE', 'INSPECTION', 'ROAD_LICENCE', 'DRIVER_LICENCE', 'PERMIT', 'OTHER']),
  },
  {
    key: 'locations',
    name: 'Locations',
    group: 'Operations',
    kind: 'text',
    description: 'Suggested pick-up points and destinations for deployments, bookings and incidents.',
    usage: [
      ['deployments', 'startLocation'],
      ['deployments', 'destination'],
      ['bookings', 'pickupLocation'],
      ['bookings', 'dropoffLocation'],
      ['incidents', 'location'],
    ],
    items: text(LOCATIONS),
  },
  {
    key: 'tripPurposes',
    name: 'Deployment purposes',
    group: 'Operations',
    kind: 'text',
    description: 'Suggested purposes when registering a deployment.',
    usage: [['deployments', 'purpose']],
    items: text(TRIP_PURPOSES),
  },
  {
    key: 'vehicleOwners',
    name: 'Vehicle owners',
    group: 'Operations',
    kind: 'coded',
    description:
      'Who owns a vehicle: one of the group companies or a subcontractor. Subcontractor deployments take the “2” number series and carry an owner amount.',
    usage: [
      ['vehicles', 'owner'],
      ['deployments', 'owner'],
    ],
    items: withSystem(REFERENCE.vehicleOwners, ['SUBCONTRACTOR']),
  },
  {
    key: 'institutions',
    name: 'Institutions',
    group: 'Commerce',
    kind: 'text',
    description: 'Customer institutions that issue purchase orders (LPO). Offered on the LPO and deployment forms.',
    usage: [
      ['purchaseOrders', 'institution'],
      ['deployments', 'institution'],
    ],
    items: text(COMPANIES),
  },
  {
    key: 'currencies',
    name: 'Currencies',
    group: 'Commerce',
    kind: 'coded',
    description: 'Currencies an LPO amount can be recorded in.',
    usage: [['purchaseOrders', 'currency']],
    items: withSystem(REFERENCE.currencies, ['RWF']),
  },
  {
    key: 'serviceTypes',
    name: 'Booking service types',
    group: 'Operations',
    kind: 'coded',
    description: 'Services a customer can book.',
    usage: [['bookings', 'serviceType']],
    items: REFERENCE.serviceTypes,
  },
  {
    key: 'assignmentPurposes',
    name: 'Assignment purposes',
    group: 'Operations',
    kind: 'text',
    description: 'Why a driver is put on a vehicle.',
    usage: [['assignments', 'purpose']],
    items: text(['Pool assignment', 'Dedicated client driver', 'VIP protocol driver', 'Safari season', 'Depot shuttle', 'Temporary cover']),
  },
  {
    key: 'fuelStations',
    name: 'Fuel stations',
    group: 'Operations',
    kind: 'text',
    description: 'Stations offered when recording fuel or allocating it to a driver.',
    usage: [
      ['fuel', 'station'],
      ['fuelRequests', 'station'],
    ],
    items: text(STATIONS),
  },
  {
    key: 'incidentTypes',
    name: 'Incident types',
    group: 'Operations',
    kind: 'coded',
    description: 'Kinds of incident that can be reported.',
    usage: [['incidents', 'type']],
    items: withSystem(REFERENCE.incidentTypes, ['FUEL_ANOMALY']),
  },
  {
    key: 'incidentSeverities',
    name: 'Incident severities',
    group: 'Operations',
    kind: 'coded',
    description: 'Severity scale for incidents. Order matters: alerts escalate from the bottom up.',
    usage: [['incidents', 'severity']],
    items: withSystem(REFERENCE.incidentSeverities, ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  },
  {
    key: 'maintenanceTypes',
    name: 'Maintenance types',
    group: 'Workshop',
    kind: 'coded',
    description: 'Kinds of work order. Completed preventive work resets the matching service schedule.',
    usage: [['maintenance', 'type']],
    items: withSystem(REFERENCE.maintenanceTypes, ['PREVENTIVE']),
  },
  {
    key: 'workshops',
    name: 'Workshops',
    group: 'Workshop',
    kind: 'text',
    description: 'Garages and workshops that carry out maintenance.',
    usage: [['maintenance', 'workshop']],
    items: text(WORKSHOPS),
  },
  {
    key: 'technicians',
    name: 'Technicians',
    group: 'Workshop',
    kind: 'text',
    description: 'Technicians who can be assigned to a work order.',
    usage: [['maintenance', 'technicianName']],
    items: text(TECHNICIANS),
  },
  {
    key: 'stockUnits',
    name: 'Stock units',
    group: 'Workshop',
    kind: 'text',
    description: 'Units of measure for spare parts and consumables.',
    usage: [['parts', 'unit']],
    items: text(['pcs', 'set', 'litre', 'kg', 'metre', 'pair', 'box']),
  },
  {
    key: 'stockLocations',
    name: 'Stock locations',
    group: 'Workshop',
    kind: 'text',
    description: 'Stores and shelves where each company keeps its parts.',
    usage: [['parts', 'location']],
    items: text(['Kacyiru main store', 'Kacyiru workshop shelf', 'Remera store', 'Musanze depot', 'Vehicle kit']),
  },
  {
    key: 'stockUnits',
    name: 'Stock units',
    group: 'Workshop',
    kind: 'text',
    description: 'Units of measure for spare parts and consumables.',
    usage: [['parts', 'unit']],
    items: text(['pcs', 'set', 'litre', 'kg', 'metre', 'pair', 'box']),
  },
  {
    key: 'stockLocations',
    name: 'Stock locations',
    group: 'Workshop',
    kind: 'text',
    description: 'Stores and shelves where each company keeps its parts.',
    usage: [['parts', 'location']],
    items: text(['Kacyiru main store', 'Kacyiru workshop shelf', 'Remera store', 'Musanze depot', 'Vehicle kit']),
  },
  {
    key: 'serviceTasks',
    name: 'Service schedule tasks',
    group: 'Workshop',
    kind: 'text',
    description: 'Recurring tasks offered when creating a preventive schedule.',
    usage: [['schedules', 'task']],
    items: text([
      'Engine oil & filter',
      'Oil filter',
      'Air filter',
      'Fuel filter',
      'Brake inspection',
      'Tyre rotation',
      'Tyres',
      'Transmission fluid',
      'Coolant',
      'Technical inspection',
    ]),
  },
  ...[
    ['vehicleStatuses', 'Vehicle statuses', [['vehicles', 'status']]],
    ['driverStatuses', 'Driver statuses', [['drivers', 'status']]],
    ['assignmentStatuses', 'Assignment statuses', [['assignments', 'status']]],
    ['deploymentStatuses', 'Deployment statuses', [['deployments', 'status']]],
    ['purchaseOrderStatuses', 'LPO statuses', []],
    ['stockMovementTypes', 'Stock movement types', [['stockMovements', 'type']]],
    ['bookingStatuses', 'Booking statuses', [['bookings', 'status']]],
    ['fuelRequestStatuses', 'Fuel allocation statuses', [['fuelRequests', 'status']]],
    ['maintenanceStatuses', 'Maintenance statuses', [['maintenance', 'status']]],
    ['incidentStatuses', 'Incident statuses', [['incidents', 'status']]],
    ['documentStatuses', 'Document statuses', []],
    ['gpsStatuses', 'GPS statuses', []],
  ].map(([key, name, usage]) => ({
    key,
    name,
    group: 'Workflow states',
    kind: 'status',
    description: 'Workflow state driven by business rules. Rename or recolour the states; they cannot be added or removed.',
    usage,
    items: REFERENCE[key].map((i) => ({ ...i, system: true })),
  })),
]

export const LOOKUP_BY_KEY = Object.fromEntries(LOOKUP_LISTS.map((l) => [l.key, l]))
export const TONES = ['neutral', 'success', 'info', 'accent', 'warning', 'danger']
