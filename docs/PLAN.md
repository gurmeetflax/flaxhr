# Flax HR — Living Plan

Living plan of every feature and hotfix, with file paths and verification
steps. Update this file in the same PR as the code change. Each phase is
self-contained: it should ship without breaking earlier phases.

Conventions:
- Migrations land in `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql`.
- Server-side logic stays in Postgres (RPCs, RLS, views). Client only calls
  views and `public.*` RPCs — never the underlying tables across schemas.
- Hooks and queries live in `src/lib/<feature>.ts`.
- Admin pages in `src/pages/admin/`, employee pages in `src/pages/me/`.
- New nav entries are wired in `src/App.tsx` (`adminNav` / `employeeNav`).

## Status legend
- [x] shipped
- [~] in progress
- [ ] pending

---

## Shipped (phases 1–7)

- [x] **Phase 1 — Punch in/out**: geofence + selfie, PWA shell.
  - `src/pages/me/PunchPage.tsx`, `src/lib/attendance.ts`,
    `supabase/migrations/20260421000007_attendance.sql`,
    `…20260503000001_punch_hard_block.sql`.
- [x] **Phase 2 — My attendance history**: day grouping + status pills.
  - `src/pages/me/MyAttendancePage.tsx`.
- [x] **Phase 3 — Admin attendance dashboard**: filters, signed-URL selfies,
  CSV export. View `public.v_attendance` (security_invoker).
  - `src/pages/admin/AttendancePage.tsx`,
    `…20260503000002_v_attendance.sql`.
- [x] **Phase 4 — Regularisations**: `attendance.regularisations`,
  `submit_regularisation` / `decide_regularisation` RPCs.
  - `src/pages/me/RegularisePage.tsx`,
    `src/pages/admin/RegularisationsPage.tsx`,
    `…20260503000003_attendance_regularisations.sql`.
- [x] **Phase 5 — Shifts**: outlet-agnostic templates, grace minutes,
  days_of_week. Views `v_today_shift`, `v_my_today_shift`,
  `v_employee_shifts`.
  - `src/pages/admin/ShiftsPage.tsx`,
    `…20260503000004_shifts.sql`,
    `…20260504000004_universal_shifts.sql`.
- [x] **Phase 6 — Roster**: per-outlet pills + all-outlets view, week-grid
  editor, publish-week. `core.roster_entries` unique on `(employee, work_date)`.
  - `src/pages/admin/RosterPage.tsx`, `src/pages/me/MyRosterPage.tsx`,
    `…20260503000005_roster.sql`, `…20260504000005_roster_shift_set_null.sql`.
- [x] **Phase 7 — Leave**: types, balances, requests with min_notice_days
  + balance enforcement; approval debits balance.
  - `src/pages/me/LeavePage.tsx`, `src/pages/admin/LeaveApprovalsPage.tsx`,
    `src/pages/admin/LeavePoliciesPage.tsx`,
    `…20260503000006_leave.sql`.

---

## Pending

### Phase 8 — HR & Employee dashboards (with roster/attendance cross-check, manpower-cost %, sales input, attrition %, apply-for-leave)
- [x] DB: `core.employees.monthly_salary`, `exit_date`, `exit_reason` (+
  trigger that auto-deactivates on exit_date set);
  `core.outlet_monthly_sales(outlet_id, period_month, amount)` with RLS;
  `public.v_outlet_monthly_sales`;
  `public.upsert_outlet_sales(outlet_id, period_month, amount)` RPC;
  `public.admin_dashboard_summary(period_month, outlet_id)` RPC;
  `public.roster_vs_attendance(date, outlet_id)` RPC;
  `public.v_my_dashboard_summary` (security_invoker);
  refreshed `public.v_employees` exposing the new columns.
- [x] Hooks: `src/lib/dashboards.ts`
  (`useAdminDashboardSummary`, `useRosterVsAttendance`,
  `useOutletMonthlySales`, `useUpsertOutletSales`,
  `useMyDashboardSummary`).
- [x] Admin UI: `src/pages/admin/AdminDashboard.tsx` rewritten with
  outlet pills + month picker, KPI strip (Headcount, Manpower cost,
  Sales, Manpower cost %, Attrition %, Present/Late/On-leave today),
  Sales input card, Roster-vs-attendance table.
- [x] Employee UI: `src/pages/me/MyDashboard.tsx` rewritten with Today,
  This-month, Leave (with **Apply for leave** button →
  `/me/leave?apply=1`), Upcoming roster cards.
- [x] `src/pages/me/LeavePage.tsx` reads `?apply=1` and scrolls/focuses
  the apply form.
- [x] `src/pages/admin/EditEmployeePage.tsx` adds `monthly_salary`,
  `exit_date`, `exit_reason` inputs.
- Migration: `supabase/migrations/20260504000006_dashboards_and_sales.sql`.
- Verification:
  - `npm run lint && npm run typecheck && npm run build` must pass.
  - As admin/HR: set `monthly_salary` for a few employees; enter sales
    for the active outlet; KPIs show non-zero manpower-cost and
    manpower-cost %.
  - Set `exit_date=today-15d` on one employee; attrition % > 0.
  - Create a published roster for today; missing punch shows `missed`,
    late punch (after grace) shows `late` with `+N min`.
  - As employee: open `/me/overview`; today/this-month/leave/upcoming
    cards render; **Apply for leave** lands on `/me/leave` with the
    apply form focused.
  - RLS: as employee, RPC `admin_dashboard_summary` returns FORBIDDEN;
    `v_my_dashboard_summary` returns the calling user's row only.

### Phase 9 — Holidays & company calendar
Public/optional/restricted holiday calendar, per-outlet (or global) lists.
Roster + leave should read from this; punch should treat a published holiday
as a "non-working day" rather than absent.

- DB: `core.holidays(id, outlet_id null=global, holiday_date, name, type
  enum: public|optional|restricted, created_by, created_at)`. RLS: read for
  authenticated (scoped via `v_holidays`), write for admin/hr.
- Migration: `supabase/migrations/<ts>_holidays.sql` with view
  `public.v_holidays` (security_invoker), RPC
  `public.upsert_holiday(p_holiday)`.
- Hooks: `src/lib/holidays.ts` (`useHolidays(range)`, `useUpsertHoliday`).
- Admin UI: `src/pages/admin/HolidaysPage.tsx` + nav entry under "Leave".
- Employee surfacing: render holidays in `MyRosterPage.tsx` and `LeavePage.tsx`
  date pickers (disable/highlight).
- Roster integration: `RosterPage.tsx` shades holiday columns and disables
  shift assignment unless explicitly overridden.
- Verification:
  - `npm run lint && npm run typecheck && npm run build`.
  - Insert a holiday for today; confirm it shows in employee roster and
    blocks shift drop on admin roster.
  - RLS: as employee, `select * from core.holidays` is denied; via
    `public.v_holidays` it's allowed.

### Phase 10 — Payroll (cycle 1: monthly run, slips, statutory)
`core.statutory_config` exists from foundations — wire it.

- DB:
  - `payroll.salary_components(id, code, name, type enum: earning|deduction,
    is_statutory, taxable, formula jsonb)`.
  - `payroll.employee_salary(employee_id, effective_from, ctc_monthly,
    components jsonb)` — versioned.
  - `payroll.runs(id, period_month date, status enum: draft|locked|paid,
    created_by, locked_at)`.
  - `payroll.run_lines(run_id, employee_id, gross, deductions, net,
    components jsonb, days_present, days_paid, leave_loss)`.
  - RPCs: `public.compute_payroll_run(p_period date)` (idempotent draft),
    `public.lock_payroll_run(p_run_id)`, `public.mark_paid(p_run_id)`.
  - View: `public.v_my_payslips` (employee sees own, admin/hr sees all).
- Logic:
  - Days present = attendance + approved leaves – LOP.
  - PF/ESI/PT pulled from `core.statutory_config`.
- Hooks: `src/lib/payroll.ts`.
- Admin UI: `src/pages/admin/PayrollRunsPage.tsx`,
  `…/SalaryStructurePage.tsx`, `…/PayslipsPage.tsx` (with PDF export).
- Employee UI: `src/pages/me/PayslipsPage.tsx` (download as PDF).
- Verification:
  - Create salary structure for a test employee; run draft for current month;
    lock; confirm payslip visible on `/me/payslips`.
  - LOP: mark a working day as absent, recompute, confirm net drops.
  - Statutory: confirm PF/ESI line items match `statutory_config` rates.

### Phase 11 — Notifications (in-app + email)
Today everything is silent — approvers don't know a request exists, employees
don't know decisions.

- DB: `core.notifications(id, user_id, kind, payload jsonb, read_at,
  created_at)`. Triggers on:
  - `attendance.regularisations` insert/update → notify approver/requester.
  - `core.leave_requests` insert/update → same.
  - `payroll.runs` lock → notify all employees in the run.
- View: `public.v_my_notifications`.
- RPC: `public.mark_notification_read(p_id)`.
- Email: Supabase edge function `notify-email` triggered by DB webhook on
  `core.notifications` insert (filter by kind). Skip if user has no email.
- Client: `src/lib/notifications.ts` + a bell in `AppShell.tsx` with unread
  badge (poll via React Query, 60s).
- Verification:
  - Submit a leave request as employee; admin sees in-app notification and
    receives email within ~30s.
  - Approve/reject; employee sees notification; bell badge clears on click.

### Phase 12 — Reports & exports
Beyond the existing attendance CSV.

- Reports: monthly attendance summary, leave ledger, headcount by outlet,
  late-mark register, overtime register.
- DB: report views in `public.v_report_*` (security_invoker, RLS-scoped).
- Hook: `src/lib/reports.ts` with `useReport(name, params)` returning rows.
- UI: `src/pages/admin/ReportsPage.tsx` — picker, filters, table preview,
  CSV + XLSX download.
- XLSX: lazy-load `xlsx` package only on the Reports page (bundle guard).
- Verification:
  - Each report renders with realistic data; CSV byte-identical to table.
  - As HR (non-admin), only own outlets visible.

### Phase 13 — Documents
Storage of offer letters, ID proofs, contracts; signed URL access.

- Supabase Storage bucket `employee-documents` (private).
- DB: `core.documents(id, employee_id, kind enum, storage_path, uploaded_by,
  uploaded_at, expires_at null)`. RLS: employee sees own, admin/hr sees
  outlet-scoped.
- RPC: `public.create_document(...)` returns signed upload URL;
  `public.get_document_url(p_id)` returns signed download URL.
- Admin UI: documents tab on `EditEmployeePage.tsx`.
- Employee UI: documents card on `MyDashboard.tsx`.
- Verification:
  - Upload a PDF as admin, download as the owning employee, denied as
    another employee.
  - Storage policies: direct path access without signed URL is denied.

### Phase 14 — Onboarding / offboarding
Checklist-driven workflows tied to employees.

- DB: `core.onboarding_templates(id, name, items jsonb[])`,
  `core.onboarding_runs(id, employee_id, template_id, status,
  started_at, completed_at)`,
  `core.onboarding_items(run_id, label, owner_role, due_at, done_at,
  done_by)`.
- Trigger: on `core.employees` insert with `is_active=true`, auto-start the
  default template.
- UI:
  - Admin: `src/pages/admin/OnboardingPage.tsx` with active runs and
    overdue items.
  - Employee: onboarding card on `MyDashboard.tsx`.
- Offboarding: same shape with `core.offboarding_*` tables; triggered by
  setting `core.employees.is_active=false` (revokes login on completion via
  trigger that disables the auth user).
- Verification:
  - Create a new employee → onboarding run appears with seed items.
  - Mark all items done → run status `completed`.
  - Set employee inactive → offboarding run appears; final item disables
    auth user (login fails afterwards).

### Phase 15 — Performance & appraisals
Lightweight v1 — quarterly self + manager review.

- DB: `core.review_cycles(id, name, period_start, period_end, status)`,
  `core.review_forms(cycle_id, employee_id, manager_id,
  self_payload jsonb, manager_payload jsonb, rating, status)`.
- RPCs: `public.submit_self_review`, `public.submit_manager_review`,
  `public.finalize_review_cycle`.
- UI:
  - Admin: `src/pages/admin/ReviewCyclesPage.tsx` (open/close cycle).
  - Employee: `src/pages/me/MyReviewsPage.tsx`.
- Verification:
  - Open a cycle; employee submits self review; manager submits with
    rating; cycle close locks editing.

### Phase 16 — Audit log UI & settings
The `audit.*` schema exists from foundations — surface it.

- View: `public.v_audit_log` (admin only).
- UI:
  - `src/pages/admin/AuditLogPage.tsx` with actor, table, action, diff.
  - `src/pages/admin/SettingsPage.tsx` — statutory rates editor (PF/ESI/PT),
    geofence defaults, working-week config.
- Verification:
  - Edit a statutory rate; row appears in audit log within 5s.
  - As HR (non-admin), `/admin/audit` returns 403.

---

## Cross-cutting follow-ups (not phases, but tracked)

- [ ] **Test harness.** No app-level tests today. Add Vitest + React Testing
  Library smoke tests for `auth.tsx`, `attendance.ts`, `leave.ts` happy
  paths. Target: `npm run test` green in CI.
- [ ] **pgTAP coverage** for RPCs already shipped (regularise, leave,
  payroll). `supabase/tests/*.sql`.
- [ ] **PWA offline punch queue.** Currently the punch page fails silently
  if offline. Queue in IndexedDB, replay on reconnect.
- [ ] **Error boundary + Sentry.** Wrap routes; capture 5xx from PostgREST.
- [ ] **i18n scaffolding** — strings are hardcoded; extract to a single
  catalogue before phase 9 lands so payslips can be localised.

---

## Recurring hotfix patterns to avoid

These have bitten us repeatedly. The CI guardrails in
`scripts/check-supabase-schemas.mjs` (added in `9cc1d18`) catch some.

- **Wrong default schema.** Client must call `public.*` views/RPCs only.
  Direct `core.*` / `attendance.*` reads break under RLS.
- **RLS recursion** when a policy on table A queries table B whose policy
  queries A. Use `security definer` views or `v_my_*` helpers.
- **Service worker stuck on old build** after deploy. Bump `vite-plugin-pwa`
  precache hash; verify with `wrangler dev` before pushing.
- **Foreign-key ON DELETE.** Default `RESTRICT` blocks admin actions
  (e.g. shift delete). Decide deliberately per FK; prefer `SET NULL` for
  optional links.
