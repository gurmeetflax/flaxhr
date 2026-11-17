import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// Training: modules (brand intro, onboarding, recipes, SOPs) with lessons
// and a quiz. Everything goes through public.training_* functions; quiz
// answers never reach the employee's browser before they pass.

export type ModuleKind = 'brand' | 'onboarding' | 'recipe' | 'sop' | 'service' | 'hygiene' | 'other'
export type LessonKind = 'slide' | 'text' | 'video' | 'image' | 'pdf' | 'recipe' | 'steps'
export type AssignmentStatus = 'assigned' | 'in_progress' | 'passed' | 'failed'

export const KIND_LABEL: Record<ModuleKind, string> = {
  brand: 'Brand',
  onboarding: 'Onboarding',
  recipe: 'Recipe',
  sop: 'SOP',
  service: 'Service',
  hygiene: 'Hygiene & safety',
  other: 'Other',
}

export const LESSON_KIND_LABEL: Record<LessonKind, string> = {
  slide: 'Slide',
  text: 'Text',
  steps: 'Steps (SOP)',
  recipe: 'Recipe card',
  video: 'Video',
  image: 'Image',
  pdf: 'PDF',
}

export const STATUS_LABEL: Record<AssignmentStatus, string> = {
  assigned: 'Not started',
  in_progress: 'In progress',
  passed: 'Passed',
  failed: 'Not passed yet',
}

export interface SlideData {
  theme?: 'paper' | 'yellow' | 'navy' | 'teal' | 'pink' | 'sky'
  leaf?: 'navy' | 'orange' | 'periwinkle' | null
  eyebrow?: string
  headline?: string
  body?: string
}

export interface StepItem {
  title: string
  body?: string
  target?: string
  ccp?: boolean
}

export interface RecipeIngredient {
  name: string
  qty_s?: string
  qty_l?: string
}

export interface LessonData extends SlideData {
  steps?: StepItem[]
  ingredients?: RecipeIngredient[]
  plating?: string
}

export interface Lesson {
  id?: string
  kind: LessonKind
  title?: string | null
  body?: string | null
  media_url?: string | null
  data: LessonData
}

export interface PublicQuestion {
  id: string
  prompt: string
  kind: 'single' | 'multi'
  options: string[]
}

export interface AdminQuestion {
  id?: string
  prompt: string
  kind: 'single' | 'multi'
  options: string[]
  correct: number[]
  explanation?: string | null
  points?: number
}

export interface MyModuleRow {
  assignment_id: string
  module_id: string
  title: string
  summary: string | null
  kind: ModuleKind
  cover_url: string | null
  est_minutes: number
  pass_mark: number
  due_on: string | null
  status: AssignmentStatus
  attempts: number
  best_score: number | null
  lessons: number
  viewed: number
  questions: number
}

export interface PlayerModule {
  id: string
  title: string
  summary: string | null
  kind: ModuleKind
  source_url: string | null
  recipe_card_key: string | null
  est_minutes: number
  pass_mark: number
  assignment: {
    id: string
    status: AssignmentStatus
    due_on: string | null
    attempts: number
    best_score: number | null
  } | null
  viewed: string[]
  lessons: (Lesson & { id: string })[]
  questions: PublicQuestion[]
}

export interface SubmitResult {
  score: number
  passed: boolean
  correct: number
  total: number
  pass_mark: number
  results: { question_id: string; correct: boolean; explanation: string | null; answer?: number[] }[]
}

export interface AdminModuleRow {
  id: string
  code: string | null
  title: string
  summary: string | null
  kind: ModuleKind
  is_active: boolean
  est_minutes: number
  pass_mark: number
  recipe_card_key: string | null
  updated_at: string
  lessons: number
  questions: number
  assigned: number
  passed: number
  avg_score: number | null
}

export interface ModuleDoc {
  id?: string
  code?: string | null
  title: string
  summary?: string | null
  kind: ModuleKind
  cover_url?: string | null
  source_url?: string | null
  recipe_card_key?: string | null
  est_minutes: number
  pass_mark: number
  is_active: boolean
  sort_order?: number
  lessons: Lesson[]
  questions: AdminQuestion[]
}

export interface PathRow {
  id?: string
  name: string
  description?: string | null
  roster_groups: string[] | null
  designation_codes: string[] | null
  outlet_ids: string[] | null
  due_days: number
  is_active: boolean
  module_ids: string[]
}

export interface OverviewRow {
  employee_id: string
  employee_code: string
  name: string
  outlet_id: string | null
  outlet: string | null
  designation: string | null
  hired_on: string | null
  assigned: number
  passed: number
  overdue: number
  in_progress: number
  avg_first: number | null
  score: number | null
  last_activity: string | null
}

export interface EmployeeDetail {
  summary: {
    assigned: number
    passed: number
    overdue: number
    score: number | null
    avg_first: number | null
  } | null
  assignments: {
    id: string
    module_id: string
    title: string
    kind: ModuleKind
    status: AssignmentStatus
    due_on: string | null
    attempts: number
    first_score: number | null
    best_score: number | null
    passed_at: string | null
    source: 'path' | 'manual'
    lessons: number
    viewed: number
    history: { at: string; score: number; passed: boolean }[]
  }[]
}

const MESSAGES: Record<string, string> = {
  FORBIDDEN: 'You do not have access to this.',
  NOT_FOUND: 'This module no longer exists.',
  NOT_ASSIGNED: 'This module is not assigned to you.',
  NO_QUESTIONS: 'This module has no quiz yet.',
}

function friendly(error: { message: string }): Error {
  const key = Object.keys(MESSAGES).find((k) => error.message.includes(k))
  return new Error(key ? MESSAGES[key] : error.message)
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw friendly(error)
  return data as T
}

// Score bands used everywhere scores are shown.
export function scoreTone(score: number | null | undefined): 'good' | 'ok' | 'low' | 'none' {
  if (score == null) return 'none'
  if (score >= 85) return 'good'
  if (score >= 60) return 'ok'
  return 'low'
}

export const TONE_CLASS: Record<ReturnType<typeof scoreTone>, string> = {
  good: 'bg-emerald-500/10 text-emerald-700',
  ok: 'bg-amber-500/10 text-amber-700',
  low: 'bg-destructive/10 text-destructive',
  none: 'bg-muted text-muted-foreground',
}

// ---------------------------------------------------------------- employee

export function useMyTraining() {
  return useQuery({
    queryKey: ['training', 'mine'],
    queryFn: () => rpc<MyModuleRow[]>('training_my_modules'),
  })
}

export function usePlayerModule(id: string | undefined) {
  return useQuery({
    queryKey: ['training', 'module', id],
    enabled: !!id,
    queryFn: () => rpc<PlayerModule>('training_module_for_me', { p_module: id }),
  })
}

export function useViewLesson() {
  return useMutation({
    mutationFn: (v: { module: string; lesson: string }) =>
      rpc<null>('training_view_lesson', { p_module: v.module, p_lesson: v.lesson }),
  })
}

export function useSubmitQuiz() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { module: string; answers: Record<string, number[]> }) =>
      rpc<SubmitResult>('training_submit', { p_module: v.module, p_answers: v.answers }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

// ------------------------------------------------------------------- admin

export function useAdminModules() {
  return useQuery({
    queryKey: ['training', 'admin', 'modules'],
    queryFn: () => rpc<AdminModuleRow[]>('training_admin_modules'),
  })
}

export function useAdminModule(id: string | undefined) {
  return useQuery({
    queryKey: ['training', 'admin', 'module', id],
    enabled: !!id && id !== 'new',
    queryFn: () => rpc<ModuleDoc>('training_admin_module', { p_id: id }),
  })
}

export function useSaveModule() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: ModuleDoc) => rpc<string>('training_save_module', { p: doc }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

export function useAdminPaths() {
  return useQuery({
    queryKey: ['training', 'admin', 'paths'],
    queryFn: () => rpc<PathRow[]>('training_admin_paths'),
  })
}

export function useSavePath() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: PathRow) => rpc<string>('training_save_path', { p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

export function useDeletePath() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rpc<null>('training_delete_path', { p_id: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

export function useAssign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: { module: string; employees: string[]; due: string | null }) =>
      rpc<number>('training_assign', { p_module: v.module, p_employee_ids: v.employees, p_due: v.due }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

export function useUnassign() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => rpc<null>('training_unassign', { p_assignment: id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training'] }),
  })
}

export function useTrainingOverview() {
  return useQuery({
    queryKey: ['training', 'admin', 'overview'],
    queryFn: () => rpc<OverviewRow[]>('training_admin_overview'),
  })
}

export function useEmployeeTraining(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['training', 'admin', 'employee', employeeId],
    enabled: !!employeeId,
    queryFn: () => rpc<EmployeeDetail>('training_employee_detail', { p_emp: employeeId }),
  })
}

export interface OutletScoreRow {
  outlet_id: string
  outlet: string | null
  staff: number
  trained_staff: number
  assigned: number
  passed: number
  completion: number | null
  overdue: number
  score: number | null
}

export interface Awards {
  month: string
  best_outlet: { outlet_id: string; outlet: string | null; score: number; completion: number } | null
  top_learners: {
    rk: number
    employee_id: string
    name: string
    employee_code: string
    outlet: string | null
    modules_passed: number
    first_try_score: number
  }[]
}

export function useOutletScores() {
  return useQuery({
    queryKey: ['training', 'admin', 'outlets'],
    queryFn: () => rpc<OutletScoreRow[]>('training_outlet_scores'),
  })
}

export function useAwards(month: string) {
  return useQuery({
    queryKey: ['training', 'admin', 'awards', month],
    queryFn: () => rpc<Awards>('training_awards', { p_month: `${month}-01` }),
  })
}
