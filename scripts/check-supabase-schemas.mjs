#!/usr/bin/env node
/**
 * Lints frontend code for `supabase.from('<table>')` calls that target
 * tables in the `core` or `attendance` schema without explicit
 * `.schema('core')` / `.schema('attendance')`. Those calls 404 against
 * PostgREST because the JS client defaults to `public`.
 *
 * Run from CI; exits non-zero on the first violation.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('..', import.meta.url).pathname
const srcRoot = join(repoRoot, 'src')

// Tables that live in `core.` schema and must be addressed via .schema('core')
const CORE_TABLES = new Set([
  'employees',
  'shifts',
  'employee_shifts',
  'roster_entries',
  'leave_types',
  'leave_balances',
  'leave_requests',
  'user_roles',
  'audit_log',
  'app_settings',
  'designations',
  'outlet_monthly_sales',
])

// Tables in `attendance.` schema (frontend writes go through RPCs, but if
// somebody adds a direct table call, flag it).
const ATTENDANCE_TABLES = new Set(['logs', 'regularisations'])

const violations = []

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walk(full)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) yield full
  }
}

const callRe = /supabase(?:\s*\.\s*\w+\([^)]*\))?\s*\.\s*from\(\s*['"`]([^'"`]+)['"`]\s*\)/g

for (const file of walk(srcRoot)) {
  const text = readFileSync(file, 'utf8')
  let m
  while ((m = callRe.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 80), m.index)
    const table = m[1]
    const callSite = m[0]
    // Accept .schema('core'), .schema("core"), .schema(`core`),
    // and .schema('core' as never) (legacy TS workaround).
    const coreSchemaRe = /\.schema\(\s*['"`]core['"`](?:\s+as\s+\w+)?\s*\)/
    const attSchemaRe = /\.schema\(\s*['"`]attendance['"`](?:\s+as\s+\w+)?\s*\)/
    const isSchemaCore = coreSchemaRe.test(callSite) || coreSchemaRe.test(before)
    const isSchemaAttendance = attSchemaRe.test(callSite) || attSchemaRe.test(before)
    if (CORE_TABLES.has(table) && !isSchemaCore) {
      violations.push({
        file: relative(repoRoot, file),
        table,
        expected: "supabase.schema('core').from('" + table + "')",
        snippet: callSite,
      })
    }
    if (ATTENDANCE_TABLES.has(table) && !isSchemaAttendance) {
      violations.push({
        file: relative(repoRoot, file),
        table,
        expected: "supabase.schema('attendance').from('" + table + "')",
        snippet: callSite,
      })
    }
  }
}

if (violations.length > 0) {
  console.error('[31mschema-usage lint failed[0m\n')
  for (const v of violations) {
    console.error(`  ${v.file}: ${v.snippet}`)
    console.error(`    table '${v.table}' lives in a non-public schema`)
    console.error(`    use: ${v.expected}\n`)
  }
  process.exit(1)
}

console.log('schema-usage lint: ok')
