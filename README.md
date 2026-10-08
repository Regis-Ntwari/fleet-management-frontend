# LIMOZ Fleet — Operations Frontend

React frontend for the LIMOZ Rwanda Ltd Fleet Operations Management System. It covers the executive dashboard, vehicles, drivers, assignments, trips, bookings, dispatch, fuel, maintenance and spare parts, incidents, compliance documents, the alert centre, reports, user administration, the audit log, CSV imports and operational settings.

The app talks to the Spring Boot API under `/api/v1`. Until that backend is available it runs against an **in-browser mock API** that implements the same contract: paging, sorting, filtering, validation errors, business-rule violations, JWT-style auth with refresh, and role-based authorisation. Switching to the real backend is a two-line `.env` change.

## Stack

| Area | Choice |
| --- | --- |
| Framework | React 19, Vite 8, plain JavaScript with JSX |
| UI | MUI (Material UI) 9 with a custom theme: light `#fff` / dark `#000` surfaces, green accent, CSS-variable colour schemes |
| Icons / font | `@mui/icons-material`, Inter Variable |
| Routing | React Router 8 (`createBrowserRouter`, lazy routes, route-level error boundaries) |
| Auth state | Zustand store (`src/auth/authStore.js`) with persisted tokens and session revalidation |
| Server state | TanStack Query 5 |
| HTTP | Axios with auth/refresh interceptors and a normalised error shape |
| Forms & validation | react-hook-form + zod (form schemas, sign-in, password change, and build-time env validation) |
| Charts | Recharts, palette validated for colour-vision deficiency in both themes |
| Tests | Vitest, Testing Library, jsdom |
| Delivery | Multi-stage Dockerfile (Node build → nginx), GitHub Actions CI/CD |

## Getting started

Requirements: Node.js 24 (see `.nvmrc`); 22.22 or newer also works. The test runner (jsdom 30) does not start on Node 20.

```bash
npm install
cp .env.example .env   # defaults to the mock API
npm run dev            # http://localhost:5173
```

Sign in with any demo account; the password for all of them is `Limoz#2026`. The list is also shown on the sign-in page.

| Email | Role |
| --- | --- |
| admin@limoz.rw | Super admin |
| it@limoz.rw | IT admin |
| management@limoz.rw | Management |
| fleet@limoz.rw | Fleet manager |
| officer@limoz.rw | Fleet officer |
| dispatch@limoz.rw | Dispatcher |
| workshop@limoz.rw | Workshop manager |
| technician@limoz.rw | Technician |
| finance@limoz.rw | Finance |
| driver@limoz.rw | Driver |
| viewer@limoz.rw | Viewer (read-only) |

Other scripts:

```bash
npm run build      # production build to dist/
npm run preview    # serve the production build
npm run lint       # ESLint
npm run format     # Prettier (format:check only verifies)
npm test           # Vitest (unit + integration through the mock API)
npm run docker:build && npm run docker:run   # same image CI ships, on http://localhost:8080
```

## Environment

```
VITE_API_BASE_URL=            # e.g. https://fleet-api.limoz.rw — leave empty with the mock
VITE_USE_MOCK_API=true        # "false" to call VITE_API_BASE_URL/api/v1
VITE_MOCK_LATENCY_MIN=120     # simulated latency range for the mock, ms
VITE_MOCK_LATENCY_MAX=420
```

Values are validated with zod at startup (`src/config/env.js`); a malformed value fails fast instead of silently defaulting. No secrets live in this repository. `.env` is git-ignored; commit changes to `.env.example` only.

## Project layout

```
src/
├── api/
│   ├── client.js          Axios instance, auth header, token refresh, error normalisation
│   └── mock/              In-browser backend: seed data, store, router, handlers, adapter
├── app/                   Providers: query client, MUI theme (theme.js), auth bootstrap, reference data
├── auth/                  Zustand auth store (tokens, user, login/logout/revalidate) and zod schemas
├── config/                Validated build-time environment
├── components/
│   ├── ui/                Design system on MUI: buttons, fields, tables, dialogs, charts, …
│   └── layout/            App shell, sidebar drawer, app bar, command palette, notifications
├── features/              One folder per module (dashboard, vehicles, drivers, trips, …)
│   └── common/            Shared list/form page scaffolds and data hooks
├── hooks/                 URL search state, debounce, media query, online status
├── pages/                 Sign-in, 404, 403, error boundary
├── routes/                Router, guards, navigation config
├── styles/index.css       Base styles and chart rules on top of the MUI CSS variables
├── utils/                 Formatting (Africa/Kigali, RWF), CSV helpers
└── test/                  Vitest setup and tests
```

## How the pieces fit

**Auth and authorisation.** Session state lives in a Zustand store (`useAuthStore`): access/refresh tokens and the signed-in user persist to `localStorage`, everything else is in memory. `login`, `logout` and `revalidate` are store actions; `useAuth()` and `<Can permission="…">` are thin React wrappers over it. The Axios client is auth-agnostic: the store registers token getters through `configureAuth`, the interceptor attaches the token, refreshes once on a 401 and clears the session (with an "expired" notice) if that fails. Routes are gated with `RequirePermission`, but these only hide dead ends: the backend (and the mock) enforce every rule and return 403.

**Reference data.** Statuses, enum labels, badge tones and vehicle categories come from `GET /reference`, so nothing operational is hard-coded in components. `StatusBadge` and the select inputs read from it.

**Lists.** Every list keeps its search, filters, sort and page in the URL (`useSearchState`) and asks the server for one page at a time (`usePagedQuery`), e.g. `GET /vehicles?page=0&size=20&sort=plateNumber,asc&status=AVAILABLE`.

**Forms and validation.** Every form is react-hook-form with a zod schema (`zodResolver`), including sign-in and password change (`src/auth/schemas.js`). Server field errors (`fieldErrors[]` in the error body) are mapped back onto the same fields. Unsaved changes are guarded on navigation.

**Calculations stay on the server.** Trip distance and duration, fuel totals and L/100 km, maintenance cost, document expiry status, service-due state, dashboard KPIs and alerts are all computed by the API (mock or real). The UI only renders them.

**States.** Every data-driven view handles loading (skeletons), empty, error (with retry), unauthorised and success. Mutations toast their outcome. Destructive actions confirm first; operational records are archived or cancelled, never hard-deleted.

**Theming.** One MUI theme (`src/app/theme.js`) with two colour schemes: light uses pure white surfaces, dark pure black, with a green accent. MUI emits every palette value as a CSS variable (`--limoz-palette-*`) under `.light` / `.dark` classes on `<html>`, so plain CSS (charts, scrollbars) follows the scheme too. The class is set before first paint from `localStorage` (`limoz.theme`) and follows the OS by default. Chart colours were validated with a colour-vision simulator.

**Design system.** `src/components/ui` wraps MUI into the handful of primitives the screens use (`Button`, `Field`/`Input`/`Select`, `DataTable`, `Dialog`, `Badge`, `Stat`, …). Screens compose those plus `Box`/`Stack`/`Typography` with `sx`; there is no utility-class CSS.

## Working with the mock API

The mock lives in `src/api/mock/`. It is a small router (`router.js`) with handler modules per resource, a seeded in-memory database (`seed.js`, `db.js`) persisted to `localStorage`, and an Axios adapter (`index.js`) that converts requests to handler calls with simulated latency.

- Data is regenerated each calendar day so "today" figures stay meaningful. **Settings → System → Reset demo data** regenerates it on demand.
- **Settings → System → Go offline** makes every request fail with a network error so you can review error states.
- Handlers throw `badRequest`, `conflict`, `businessRule`, `forbidden`, `notFound` from `core.js`; the adapter turns those into the backend's error body: `{ timestamp, status, error, message, path, fieldErrors? }`.
- Role → permission mapping is in `core.js` (`ROLE_PERMISSIONS`) and should match the backend's seed.

The handler files double as a readable specification of the endpoints and rules the Spring Boot service must implement.

## API endpoints used

| Resource | Endpoints |
| --- | --- |
| Auth | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password` |
| Reference | `GET /reference`, `GET/POST/PUT/DELETE /vehicle-categories` |
| Dashboard | `GET /dashboard/{summary, fleet-status, distance-trend, utilization, fuel-trend, maintenance, cost-by-vehicle, availability-trend, alerts, daily-position}` |
| Vehicles | `GET/POST /vehicles`, `GET/PUT/DELETE /vehicles/{id}`, `PATCH /vehicles/{id}/status`, `GET /vehicles/{id}/{trips, fuel, maintenance, schedules, assignments, documents, incidents, alerts, costs, movements, activity}`, `GET /vehicles/options`, `GET /vehicles/departments` |
| Drivers | `GET/POST /drivers`, `GET/PUT/DELETE /drivers/{id}`, `PATCH /drivers/{id}/status`, `GET /drivers/{id}/{assignments, trips, incidents, documents, performance}`, `GET /drivers/options` |
| Assignments | `GET/POST /assignments`, `PATCH /assignments/{id}/{end, cancel}` |
| Trips | `GET/POST /trips`, `GET/PUT /trips/{id}`, `PATCH /trips/{id}/status`, `GET /dispatch/board` |
| Bookings | `GET/POST /bookings`, `GET/PUT /bookings/{id}`, `PATCH /bookings/{id}/{confirm, assign, cancel}`, `GET /customers` |
| Fuel | `GET/POST /fuel`, `GET/PUT/DELETE /fuel/{id}`, `GET /fuel/summary`, `GET /fuel/stations` |
| Maintenance | `GET/POST /maintenance`, `GET/PUT /maintenance/{id}`, `PATCH /maintenance/{id}/status`, `GET /maintenance/{summary, workshops}`, `GET/POST/PUT/DELETE /maintenance-schedules`, `GET/POST/PUT /spare-parts`, `PATCH /spare-parts/{id}/stock` |
| Incidents | `GET/POST /incidents`, `GET/PUT /incidents/{id}`, `PATCH /incidents/{id}/status`, `POST /incidents/{id}/attachments`, `GET /incidents/summary` |
| Documents | `GET/POST /documents`, `GET/PUT/DELETE /documents/{id}`, `GET /documents/summary` |
| Alerts & notifications | `GET /alerts`, `GET /alerts/summary`, `POST /alerts/{id}/acknowledge`, `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all` |
| Reports | `GET /reports`, `GET /reports/{key}?from&to&date&export` |
| Admin | `GET/POST /users`, `GET/PUT /users/{id}`, `PATCH /users/{id}/status`, `POST /users/{id}/reset-password`, `GET /audit-logs`, `POST /imports/{vehicles, drivers, fuel}`, `GET/PUT /settings`, `GET /search` |

## Connecting the Spring Boot backend

1. Set `VITE_USE_MOCK_API=false` and `VITE_API_BASE_URL` to the API origin.
2. Make sure the backend allows the frontend origin in CORS and returns the error body shape above.
3. Excel and PDF report exports are expected to be streamed by the backend; the mock downloads CSV for both.
4. File uploads (documents, incident photos) post metadata in the mock; the real client should switch `DocumentFormDialog` and the incident attachment upload to `multipart/form-data`.

## Deployment

`npm run build` produces a static bundle in `dist/`. Serve it from any static host or reverse proxy, with all unknown paths rewritten to `index.html` so client-side routing works.

### Docker (nginx)

The `Dockerfile` is a two-stage build: Node 24 builds the bundle, then `nginx:1.27-alpine` serves it on port 8080 with SPA fallback, gzip, immutable caching for hashed assets, security headers, a `/healthz` probe and an `/api/` reverse proxy to the backend.

```bash
# Demo image (in-browser mock API, no backend needed)
docker build -t limoz/fleet-frontend .
docker run --rm -p 8080:8080 limoz/fleet-frontend        # http://localhost:8080

# Production image: same-origin API proxied by nginx to the Spring Boot service
docker build -t limoz/fleet-frontend:prod \
  --build-arg VITE_USE_MOCK_API=false --build-arg VITE_API_BASE_URL= .
docker run --rm -p 8080:8080 -e API_UPSTREAM=http://fleet-api:8080 limoz/fleet-frontend:prod
```

`VITE_*` values are build arguments (Vite inlines them); `API_UPSTREAM` and `NGINX_PORT` are runtime environment variables rendered into `docker/default.conf.template` when the container starts. `docker compose up --build` runs the demo image locally.

### CI/CD

`.github/workflows/ci.yml` runs on every push and pull request to `main`:

1. **test** — `npm ci`, ESLint, Prettier check, Vitest (JUnit report uploaded as an artifact), production build (uploaded as `dist`).
2. **docker** — builds the image with Buildx (layer cache in GitHub Actions), pushes it to `ghcr.io/<owner>/<repo>` on `main` and on `v*` tags (pull requests only build), then starts the image and smoke-tests `/healthz`, `/` and a deep link.

The push uses the workflow's own `GITHUB_TOKEN`; no extra secrets are required. Point your deployment at the `ghcr.io` image tags (`main`, `sha-…`, or the semver tag).
