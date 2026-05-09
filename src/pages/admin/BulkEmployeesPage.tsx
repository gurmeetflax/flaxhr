import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, Download, FileUp, Upload, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import {
  TEMPLATE_CSV,
  fetchValidationContext,
  importOne,
  parseCsv,
  resultsToCsv,
  validateRows,
  type ImportedRow,
  type ValidatedRow,
} from '@/lib/bulkEmployees'

type Stage = 'upload' | 'preview' | 'importing' | 'done'

export default function BulkEmployeesPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [stage, setStage] = useState<Stage>('upload')
  const [parseError, setParseError] = useState<string | null>(null)
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [results, setResults] = useState<ImportedRow[]>([])
  const [progress, setProgress] = useState(0)

  async function onFile(file: File) {
    setParseError(null)
    setRows([])
    setResults([])
    try {
      const text = await file.text()
      const raw = parseCsv(text)
      if (raw.length === 0) {
        setParseError('CSV has no data rows.')
        return
      }
      const ctx = await fetchValidationContext()
      const validated = validateRows(raw, ctx)
      setRows(validated)
      setStage('preview')
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not parse the CSV.')
    }
  }

  function downloadTemplate() {
    download(TEMPLATE_CSV, 'flaxhr-employees-template.csv')
  }

  async function runImport() {
    setStage('importing')
    setProgress(0)
    const collected: ImportedRow[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const result = await importOne(r)
      collected.push(result)
      setProgress(i + 1)
    }
    setResults(collected)
    setStage('done')
    qc.invalidateQueries({ queryKey: ['employees-list'] })
    qc.invalidateQueries({ queryKey: ['admin-dashboard-team'] })

    const ok = collected.filter((r) => r.status === 'success').length
    const fail = collected.length - ok
    if (fail === 0) toast.success(`Imported ${ok} employees`)
    else if (ok === 0) toast.error('All rows failed — see the table below')
    else toast.error(`${ok} imported, ${fail} failed`)
  }

  function downloadResults() {
    const csv = resultsToCsv(results)
    download(csv, `flaxhr-bulk-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length
  const invalidCount = rows.length - validCount

  return (
    <>
      <PageHeader
        title="Bulk upload employees"
        description="CSV upload — codes are auto-issued, PINs are auto-generated and shown after import."
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/employees')}>
            Back
          </Button>
        }
      />

      {stage === 'upload' ? (
        <UploadCard
          onFile={onFile}
          onDownloadTemplate={downloadTemplate}
          parseError={parseError}
        />
      ) : null}

      {stage === 'preview' || stage === 'importing' || stage === 'done' ? (
        <PreviewCard
          rows={rows}
          results={results}
          stage={stage}
          progress={progress}
          validCount={validCount}
          invalidCount={invalidCount}
          onCancel={() => {
            setStage('upload')
            setRows([])
            setResults([])
            setParseError(null)
          }}
          onImport={runImport}
          onDownloadResults={downloadResults}
        />
      ) : null}
    </>
  )
}

function UploadCard({
  onFile,
  onDownloadTemplate,
  parseError,
}: {
  onFile: (file: File) => void
  onDownloadTemplate: () => void
  parseError: string | null
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <CardTitle>Upload a CSV</CardTitle>
        <CardDescription>
          Required columns: <span className="font-mono">full_name</span>,{' '}
          <span className="font-mono">outlet_id</span>. Optional:{' '}
          <span className="font-mono">personal_email, phone, designation_code, hired_on, monthly_salary, date_of_birth</span>.
          Header row required; column order is flexible.
        </CardDescription>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={onDownloadTemplate}>
            <Download className="h-4 w-4" /> Download template
          </Button>
          <label className="inline-flex">
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
            <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <FileUp className="h-4 w-4" /> Choose CSV
            </span>
          </label>
        </div>

        {parseError ? (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {parseError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PreviewCard({
  rows,
  results,
  stage,
  progress,
  validCount,
  invalidCount,
  onCancel,
  onImport,
  onDownloadResults,
}: {
  rows: ValidatedRow[]
  results: ImportedRow[]
  stage: Stage
  progress: number
  validCount: number
  invalidCount: number
  onCancel: () => void
  onImport: () => void
  onDownloadResults: () => void
}) {
  // Index results by rowIndex so we can render them in the same table.
  const resultByIndex = useMemo(() => {
    const m = new Map<number, ImportedRow>()
    for (const r of results) m.set(r.rowIndex, r)
    return m
  }, [results])

  const successCount = results.filter((r) => r.status === 'success').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>
              {stage === 'preview'
                ? 'Preview & validate'
                : stage === 'importing'
                  ? 'Importing…'
                  : 'Results'}
            </CardTitle>
            <CardDescription className="mt-1">
              {stage === 'preview'
                ? `${rows.length} row${rows.length === 1 ? '' : 's'}: ${validCount} valid, ${invalidCount} invalid`
                : stage === 'importing'
                  ? `${progress} of ${rows.length} processed`
                  : `${successCount} imported, ${errorCount} failed`}
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {stage === 'preview' ? (
              <>
                <Button variant="ghost" onClick={onCancel}>
                  Choose different file
                </Button>
                <Button onClick={onImport} disabled={validCount === 0}>
                  <Upload className="h-4 w-4" />
                  Import {validCount} valid row{validCount === 1 ? '' : 's'}
                </Button>
              </>
            ) : null}
            {stage === 'done' ? (
              <>
                <Button variant="ghost" onClick={onCancel}>
                  Upload another
                </Button>
                <Button
                  onClick={onDownloadResults}
                  disabled={successCount === 0}
                  variant="secondary"
                >
                  <Download className="h-4 w-4" />
                  Download codes + PINs
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {stage === 'done' && successCount > 0 ? (
          <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700">
            <strong>Save the codes + PINs file.</strong> PINs are not stored in
            plaintext and won't be retrievable after you leave this page.
          </p>
        ) : null}

        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Row</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Outlet</th>
                <th className="px-2 py-2 font-medium">Designation</th>
                <th className="px-2 py-2 font-medium">Phone</th>
                <th className="px-2 py-2 font-medium">Email</th>
                <th className="px-2 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const result = resultByIndex.get(r.rowIndex)
                const hasErrors = r.errors.length > 0
                return (
                  <tr
                    key={r.rowIndex}
                    className={cn(
                      hasErrors && stage === 'preview' && 'bg-destructive/5',
                      result?.status === 'success' && 'bg-primary/5',
                      result?.status === 'error' && 'bg-destructive/5',
                    )}
                  >
                    <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                      {r.rowIndex}
                    </td>
                    <td className="px-2 py-2 font-medium">{r.full_name || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.outlet_id || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.designation_code || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.phone || '—'}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.personal_email || '—'}</td>
                    <td className="px-2 py-2">
                      <RowStatus row={r} result={result} stage={stage} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function RowStatus({
  row,
  result,
  stage,
}: {
  row: ValidatedRow
  result: ImportedRow | undefined
  stage: Stage
}) {
  if (result) {
    if (result.status === 'success') {
      return (
        <span className="inline-flex flex-col gap-0.5">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <CheckCircle2 className="h-3 w-3" /> {result.employee_code}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            PIN {result.pin}
          </span>
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <XCircle className="h-3 w-3" />
        {result.error?.slice(0, 80) ?? 'failed'}
      </span>
    )
  }
  if (row.errors.length > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-destructive">
        <AlertCircle className="h-3 w-3" />
        {row.errors[0]}
        {row.errors.length > 1 ? ` (+${row.errors.length - 1} more)` : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {stage === 'importing' ? '…' : 'Ready'}
    </span>
  )
}

function download(text: string, filename: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
