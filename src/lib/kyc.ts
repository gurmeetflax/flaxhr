import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type KycKind = 'aadhaar' | 'pan'
export type KycStatus = 'pending' | 'submitted' | 'verified' | 'rejected'

const BUCKET = 'kyc-documents'

function mimeToExt(mime: string): string {
  if (mime === 'application/pdf') return 'pdf'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/webp') return 'webp'
  return 'bin'
}

/**
 * Upload a KYC file. Path scheme: `{employee_id}/{kind}/{epoch}.{ext}`.
 *
 * `viaAdmin=true` (default) uses admin_set_kyc_document(p_employee, …)
 * — required when admin/HR uploads on behalf of another employee.
 * `viaAdmin=false` uses set_kyc_document — for future self-uploads
 * from /me where the path's owner *is* the caller's employee.
 */
export async function uploadKycFile(
  employeeId: string,
  kind: KycKind,
  file: File,
  viaAdmin = true,
): Promise<string> {
  const ext = mimeToExt(file.type)
  const path = `${employeeId}/${kind}/${Date.now()}.${ext}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    })
  if (upErr) throw upErr

  if (viaAdmin) {
    const { error: rpcErr } = await supabase.rpc('admin_set_kyc_document', {
      p_employee: employeeId,
      p_kind: kind,
      p_path: path,
    })
    if (rpcErr) throw rpcErr
  } else {
    const { error: rpcErr } = await supabase.rpc('set_kyc_document', {
      p_kind: kind,
      p_path: path,
    })
    if (rpcErr) throw rpcErr
  }

  return path
}

export async function getSignedKycUrl(
  employeeId: string,
  kind: KycKind,
  expiresInSec = 60,
): Promise<string | null> {
  // Resolve the path via RPC (handles RLS + ownership checks).
  const { data: pathData, error: pathErr } = await supabase.rpc('signed_kyc_url', {
    p_employee: employeeId,
    p_kind: kind,
    p_expires: expiresInSec,
  })
  if (pathErr) throw pathErr
  const path = pathData as string | null
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSec)
  if (error) return null
  return data.signedUrl
}

export function useUploadKyc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      kind: KycKind
      file: File
      viaAdmin?: boolean
    }) => {
      return uploadKycFile(input.employee_id, input.kind, input.file, input.viaAdmin ?? true)
    },
    onSuccess: (_p, vars) => {
      qc.invalidateQueries({ queryKey: ['employee', vars.employee_id] })
      qc.invalidateQueries({ queryKey: ['my-employee'] })
    },
  })
}

export function useVerifyKyc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      status: KycStatus
      notes?: string
    }) => {
      const { error } = await supabase.rpc('verify_kyc', {
        p_employee: input.employee_id,
        p_status: input.status,
        p_notes: input.notes ?? null,
      })
      if (error) throw error
    },
    onSuccess: (_p, vars) => {
      qc.invalidateQueries({ queryKey: ['employee', vars.employee_id] })
      qc.invalidateQueries({ queryKey: ['employees-list'] })
    },
  })
}

export function useUpdateKycLast4() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      employee_id: string
      aadhaar_last4?: string | null
      pan_last4?: string | null
    }) => {
      const patch: Record<string, string | null> = {}
      if (input.aadhaar_last4 !== undefined) patch.aadhaar_last4 = input.aadhaar_last4 || null
      if (input.pan_last4 !== undefined) patch.pan_last4 = input.pan_last4 || null
      const { error } = await supabase
        .schema('core' as never)
        .from('employees')
        .update(patch)
        .eq('id', input.employee_id)
      if (error) throw error
    },
    onSuccess: (_p, vars) => {
      qc.invalidateQueries({ queryKey: ['employee', vars.employee_id] })
    },
  })
}
