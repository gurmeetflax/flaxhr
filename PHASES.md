# Flax HR — Phases

Self-contained plan so any session / machine can pick up without prior chat context.

Branch for ongoing work: `claude/show-last-progress-kv3EJ` (rename/merge when stable).

Stack: Vite + React 19 + TS + Tailwind 4, Supabase (Postgres + Auth + Storage), Cloudflare Workers hosting. Timezone convention: `Asia/Kolkata`.

Roles defined in `core.user_roles.role` check constraint (migration 001):
`admin`, `hr`, `manager`, `auditor`, `employee`, `service`.

---

## Done

### Phase 0 — Scaffold
Commit `91ff236`. Vite + React 19 + TS + Tailwind 4.

### Phase 1 — DB foundations
Commit `4efab8a`, migration `20260421000001_foundations.sql`.
- Schemas: `core`, `attendance`, `payroll` (reserved).
- `core.user_roles` + helpers `core.has_role(text)`, `core.is_admin()`, `core.has_outlet_access(text)`.
- `core.audit_log` + `core.log_audit()` trigger fn.
- `core.statutory_config` (empty; UI pending).
- `public.flax_outlets` reused as the outlet catalog (external).

### Phase 2 — Auth
Commits `e4f0a07`, `f20b963`, `3d68c2c`, `5772dc6`, `55e2ff1`.
- Admin: email+password + Google OAuth on `/login` (Admin/HR tab).
- Employee: code + PIN on `/login` (Employee tab).
- `public.handle_new_user()` trigger hardened.
- Role/employee lookups via `public` views, not schema switching.
- Admin session is preserved when creating an employee account.

### Phase 3 — Outlets admin
Commits `064fd06`, `30b119d`, `8269718` (partial).
- `/admin/outlets`, `/admin/outlets/new`, `/admin/outlets/:id`.
- Address, `lat/lng`, `geofence_radius_m` (default 200m), contact `emails[]`.

### Phase 4 — Employees admin
Commits `12572ae`, `8269718`, migrations `…000006/000008/000009`.
- `/admin/employees` (search, filter by outlet + active).
- `/admin/employees/new`, `/admin/employees/:id` (edit; `employee_code` read-only).
- `work_email` + phone unique indexes, dup-check on submit.
- View: `public.v_employees` joins outlet name + city.

### Phase 5a — Attendance DB (UI pending, see Phase 5 below)
Migration `20260421000007_attendance.sql`. **All server pieces in place, no UI yet.**
- `attendance.logs` (employee_id, outlet_id, type in/out, punched_at, selfie_path, lat, lng, `is_within_geofence`, `distance_m`, source, device_info).
- RPC `public.punch(type, lat, lng, selfie_path, user_agent)` — SECURITY DEFINER, computes haversine distance to outlet, sets `is_within_geofence` using `outlet.geofence_radius_m`.
- Views: `public.v_my_today_punches` (self), `public.v_today_punches` (admin/hr/manager/auditor).
- Storage bucket `attendance-selfies` (private, 2MB, image/*), RLS by `auth.uid()` folder + staff read-all.
- RLS on `attendance.logs`: admin/hr full; manager scoped by `has_outlet_access`; auditor select-all; employee select-self.

---

## Pending

### Phase 5 — Attendance / clock-in UI
Consumes migration 007. No new DB work unless noted.

**Employee (`/me`)**
- Add `/me/clock-in` (or inline on `MyDashboard`): capture selfie via `<input type="file" capture="user">` or `getUserMedia`, upload to `attendance-selfies/<uid>/<yyyy-mm-dd>/<uuid>.jpg`, read geolocation, call `public.punch()`.
- Show today's punches from `v_my_today_punches` with in/out chips, `distance_m`, and a green/red badge from `is_within_geofence`.
- Show a warning-but-allow flow when `is_within_geofence = false` (log still stored; RLS lets admin/HR see it).
- Handle geolocation denial / no-outlet cases gracefully.

**Admin/HR**
- `/admin/attendance/today` — grid from `v_today_punches`, filter by outlet, search by name/code. Click row → selfie lightbox (signed URL via `supabase.storage.from('attendance-selfies').createSignedUrl`).
- `/admin/attendance` — date-range report per employee / per outlet (see Phase 8).
- "Regularise" dialog: admin/HR inserts a `source='regularised'` row (direct INSERT under RLS) when an employee missed a punch.

**Later (not blocking Phase 5)**
- Selfie liveness / blur checks.
- Background push reminder near shift start (needs `shifts` table — defer).

### Phase 6 — HR (non-admin) role screens
Today only `admin` has gated screens. Reuse admin pages but drop the "destructive" ones.

**What HR can access** (based on `has_role('hr')`):
- Read/write `core.employees` and `public.flax_outlets` — same forms as admin.
- Read/write `attendance.logs` incl. regularise.
- Cannot write `core.user_roles` — so HR cannot grant roles. Keep role management admin-only.

**Plumbing to add**
- `src/lib/auth.tsx`: expose `isHr` alongside `isAdmin` (query `core.user_roles` via a view — follow the Phase 2 pattern: never schema-switch; add to `public.v_my_roles` if missing).
- `src/components/ProtectedRoute.tsx`: accept `roles: ('admin'|'hr'|…)[]` instead of only `requireAdmin`.
- `src/components/layout/AppShell.tsx`: show the same sidebar to admin+hr; hide "Roles / Users" section from HR.
- Routes: move `/admin/*` to `/staff/*`? Cleaner, but adds churn. Recommend: **keep `/admin/*` paths, just loosen the guard to `['admin','hr']`** on employees/outlets/attendance; leave a future `/admin/roles` admin-only.

### Phase 7 — Leave & holidays

**DB (new migration `…_leave_holidays.sql`)**
- `core.holidays (id, name, holiday_date, outlet_id null=global, created_at)` — RLS: anyone authenticated reads; admin/hr write.
- `core.leave_types (code, name, days_per_year, is_paid, carry_forward_max)` — seed CL/SL/EL/LOP.
- `core.leave_balances (employee_id, leave_type, year, allocated, used, carried)` — unique (employee_id, leave_type, year).
- `core.leave_requests (id, employee_id, leave_type, from_date, to_date, reason, status in ('pending','approved','rejected','cancelled'), decided_by, decided_at, note)`.
- Trigger: on `approved`, decrement balance and insert a sentinel `attendance.logs` row per day (source `leave`). Consider whether attendance.logs should gain a `source='leave'` variant — yes, extend check constraint.

**UI — employee (`/me`)**
- `/me/leaves` — list own requests, apply new, cancel pending. Show balances.

**UI — admin/hr**
- `/admin/holidays` — calendar + CRUD.
- `/admin/leaves` — inbox of pending, approve/reject with note. Filters: outlet, type, date range.
- `/admin/leaves/balances` — bulk view; year-end rollover action (admin only).

### Phase 8 — Reports / exports

**Views (new migration `…_report_views.sql`)**
- `public.v_attendance_daily` — per employee per day: first in, last out, total minutes, `is_within_geofence_all`, outlet.
- `public.v_attendance_monthly` — per employee per month: present days, absent days, late count, leave-by-type counts.
- `public.v_leave_ledger` — per employee per leave_type per year: allocated, used, balance.

**UI**
- `/admin/reports/attendance` — pick outlet + date range + employee (optional). Table + CSV export. Use `papaparse` or a tiny hand-rolled CSV writer — no new deps if avoidable.
- `/admin/reports/leaves` — per year. CSV export.
- `/admin/reports/payroll-inputs` — attendance + leave rolled up for a month, ready to feed payroll (no payroll calc in this phase).

**CSV export helper**
- Add `src/lib/csv.ts` — pure function `toCsv(rows, columns): string`, then trigger download via Blob. No deps.

### Deferred items (not their own phase)
- **Employee PIN reset** — admins can't reset a PIN today; needs an Edge Function with service-role key (can't be done from the client). Place at `supabase/functions/admin-reset-pin/`. Verify caller is admin via `supabase.auth.getUser()` + `core.is_admin()` RPC.
- **Employee soft-delete / deactivate** — schema supports `deleted_at`; add a "Deactivate" button on `EditEmployeePage` (separate from `is_active` toggle — soft-delete hides from list, deactivate keeps but blocks login).
- **`core.statutory_config`** UI — only needed when payroll work begins.
- **Manager / auditor** role screens — out of MVP scope; once Phase 6 lands, the same loosening pattern applies.

---

## Build order recommendation

1. **Phase 6 HR plumbing first** (auth + ProtectedRoute + sidebar). ~0.5 day. Unblocks Phase 5 UI for HR testers.
2. **Phase 5 employee clock-in** — smallest user-visible win, validates geofence end-to-end. ~1 day.
3. **Phase 5 admin today view** — trivial after employee flow. ~0.5 day.
4. **Phase 7 holidays** — easiest part of leave. ~0.5 day.
5. **Phase 7 leave requests + approvals**. ~1.5 days.
6. **Phase 8 reports** — views + CSV. ~1 day.

---

## Key anchors (for cold pickup)

| Concern | Path |
|---|---|
| Routes | `src/App.tsx` |
| Auth context / role flags | `src/lib/auth.tsx` |
| Supabase client | `src/lib/supabase.ts` |
| Route guard | `src/components/ProtectedRoute.tsx` |
| Sidebar | `src/components/layout/AppShell.tsx` |
| Identity helpers | `src/lib/identity.ts` |
| IST helpers | `src/lib/ist.ts` |
| Query client | `src/lib/query-client.ts` |
| Admin pages | `src/pages/admin/` |
| Self-service pages | `src/pages/me/` |
| Migrations | `supabase/migrations/` |

Migration numbering: keep the `YYYYMMDDNNNNNN_name.sql` pattern already established. Next free slot as of this doc: `20260422000001_…`.
