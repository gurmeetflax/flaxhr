import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type QuestionKind =
  | 'rating'
  | 'yes_no'
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multi_choice'

export const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  rating: 'Rating (1–N)',
  yes_no: 'Yes / No',
  short_text: 'Short text',
  long_text: 'Long text',
  single_choice: 'Single choice',
  multi_choice: 'Multiple choice',
}

export interface ChoiceOption {
  value: string
  label: string
}

export interface QuestionOptions {
  /** rating: scale (default 5). */
  scale?: number
  /** single_choice / multi_choice: list of options. */
  choices?: ChoiceOption[]
}

export interface Question {
  id: string
  questionnaire_id: string
  position: number
  text: string
  kind: QuestionKind
  options: QuestionOptions
  correct_answer: unknown
  required: boolean
  weight: number
}

export interface Questionnaire {
  id: string
  code: string
  title: string
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  question_count: number
  max_score: number
}

export type EvalStatus = 'draft' | 'submitted'

export interface Evaluation {
  id: string
  questionnaire_id: string
  questionnaire_code: string
  questionnaire_title: string
  employee_id: string
  employee_name: string
  employee_code: string
  outlet_id: string | null
  outlet_name: string | null
  evaluator_id: string | null
  evaluated_at: string
  status: EvalStatus
  total_score: number | null
  max_score: number | null
  score_pct: number | null
  notes: string | null
  submitted_at: string | null
  created_at: string
  updated_at: string
}

export interface EvalAnswer {
  evaluation_id: string
  question_id: string
  answer: unknown
  earned_score: number | null
}

// ===========================================================================
// Questionnaires
// ===========================================================================

export function useQuestionnaires(opts: { activeOnly?: boolean } = {}) {
  const { activeOnly = false } = opts
  return useQuery<Questionnaire[]>({
    queryKey: ['eval-questionnaires', activeOnly ? 'active' : 'all'],
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from('v_eval_questionnaires')
        .select('id, code, title, description, is_active, created_at, updated_at, question_count, max_score')
      if (activeOnly) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Questionnaire[]
    },
  })
}

export function useQuestionnaire(id: string | undefined) {
  return useQuery<Questionnaire | null>({
    queryKey: ['eval-questionnaire', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('v_eval_questionnaires')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as Questionnaire) ?? null
    },
  })
}

export function useUpsertQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      input: Partial<Questionnaire> & { code: string; title: string },
    ) => {
      const row: Record<string, unknown> = {
        code: input.code.trim().toLowerCase(),
        title: input.title.trim(),
        description: input.description ?? null,
        is_active: input.is_active ?? true,
      }
      if (input.id) row.id = input.id
      const { data, error } = await supabase
        .schema('core' as never)
        .from('eval_questionnaires')
        .upsert(row, { onConflict: 'id' })
        .select('id')
        .maybeSingle()
      if (error) throw error
      return (data?.id as string) ?? null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eval-questionnaires'] }),
  })
}

export function useDeleteQuestionnaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('eval_questionnaires')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['eval-questionnaires'] }),
  })
}

// ===========================================================================
// Questions
// ===========================================================================

export function useQuestions(questionnaireId: string | undefined) {
  return useQuery<Question[]>({
    queryKey: ['eval-questions', questionnaireId],
    enabled: !!questionnaireId,
    queryFn: async () => {
      if (!questionnaireId) return []
      const { data, error } = await supabase
        .schema('core' as never)
        .from('eval_questions')
        .select('id, questionnaire_id, position, text, kind, options, correct_answer, required, weight')
        .eq('questionnaire_id', questionnaireId)
        .order('position')
      if (error) throw error
      return (data ?? []) as Question[]
    },
  })
}

export function useUpsertQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Question> & { questionnaire_id: string; text: string; kind: QuestionKind }) => {
      const row = {
        ...(input.id ? { id: input.id } : {}),
        questionnaire_id: input.questionnaire_id,
        position: input.position ?? 0,
        text: input.text.trim(),
        kind: input.kind,
        options: input.options ?? {},
        correct_answer: input.correct_answer ?? null,
        required: input.required ?? false,
        weight: input.weight ?? 0,
      }
      const { error } = await supabase
        .schema('core' as never)
        .from('eval_questions')
        .upsert(row, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['eval-questions', vars.questionnaire_id] })
      qc.invalidateQueries({ queryKey: ['eval-questionnaires'] })
    },
  })
}

export function useDeleteQuestion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { id: string; questionnaire_id: string }) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('eval_questions')
        .delete()
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['eval-questions', vars.questionnaire_id] })
      qc.invalidateQueries({ queryKey: ['eval-questionnaires'] })
    },
  })
}

// ===========================================================================
// Evaluations
// ===========================================================================

export function useEvaluations(filter?: {
  status?: EvalStatus | null
  employeeId?: string | null
}) {
  return useQuery<Evaluation[]>({
    queryKey: ['evaluations', filter ?? {}],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase.from('v_evaluations').select('*')
      if (filter?.status) q = q.eq('status', filter.status)
      if (filter?.employeeId) q = q.eq('employee_id', filter.employeeId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Evaluation[]
    },
  })
}

export function useEvaluation(id: string | undefined) {
  return useQuery<Evaluation | null>({
    queryKey: ['evaluation', id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null
      const { data, error } = await supabase
        .from('v_evaluations')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as Evaluation) ?? null
    },
  })
}

export function useEvaluationAnswers(evaluationId: string | undefined) {
  return useQuery<EvalAnswer[]>({
    queryKey: ['evaluation-answers', evaluationId],
    enabled: !!evaluationId,
    queryFn: async () => {
      if (!evaluationId) return []
      const { data, error } = await supabase
        .schema('core' as never)
        .from('eval_answers')
        .select('evaluation_id, question_id, answer, earned_score')
        .eq('evaluation_id', evaluationId)
      if (error) throw error
      return (data ?? []) as EvalAnswer[]
    },
  })
}

export function useCreateEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      questionnaire_id: string
      employee_id: string
      evaluated_at?: string
      notes?: string
    }) => {
      const { data, error } = await supabase
        .schema('core' as never)
        .from('evaluations')
        .insert({
          questionnaire_id: input.questionnaire_id,
          employee_id: input.employee_id,
          evaluated_at: input.evaluated_at ?? new Date().toISOString().slice(0, 10),
          notes: input.notes ?? null,
        })
        .select('id')
        .maybeSingle()
      if (error) throw error
      return (data?.id as string) ?? null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluations'] }),
  })
}

export function useUpsertAnswer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      evaluation_id: string
      question_id: string
      answer: unknown
    }) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('eval_answers')
        .upsert(input, { onConflict: 'evaluation_id,question_id' })
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['evaluation-answers', vars.evaluation_id] })
    },
  })
}

export function useUpdateEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      id: string
      notes?: string | null
      evaluated_at?: string
    }) => {
      const patch: Record<string, unknown> = {}
      if (input.notes !== undefined) patch.notes = input.notes
      if (input.evaluated_at !== undefined) patch.evaluated_at = input.evaluated_at
      const { error } = await supabase
        .schema('core' as never)
        .from('evaluations')
        .update(patch)
        .eq('id', input.id)
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['evaluation', vars.id] })
      qc.invalidateQueries({ queryKey: ['evaluations'] })
    },
  })
}

export function useSubmitEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('submit_evaluation', { p_id: id })
      if (error) throw error
      return data as { total_score: number; max_score: number; score_pct: number | null }
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['evaluation', id] })
      qc.invalidateQueries({ queryKey: ['evaluations'] })
      qc.invalidateQueries({ queryKey: ['evaluation-answers', id] })
    },
  })
}

export function useDeleteEvaluation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .schema('core' as never)
        .from('evaluations')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evaluations'] }),
  })
}

export function useMyEvaluations() {
  return useQuery<Evaluation[]>({
    queryKey: ['my-evaluations'],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_my_evaluations')
        .select('*')
      if (error) throw error
      return (data ?? []) as Evaluation[]
    },
  })
}
