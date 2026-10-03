export type Parameters = {
  temperature: number; top_p: number; top_k: number; max_new_tokens: number; seed: number | null;
};
export const DEFAULTS: Parameters = { temperature: 0.7, top_p: 0.9, top_k: 50, max_new_tokens: 512, seed: 42 };
export type Health = {
  state: 'loading' | 'ready' | 'missing' | 'error' | 'offline'; error: string | null;
  model_id: string; revision: string | null; pending_jobs: number; registration_available: boolean;
};
export type Voice = { name: string; label: string; reference_text: string; duration: number; created_at: string };
export type Job = {
  id: string; kind: 'registration' | 'generation';
  status: 'queued' | 'running' | 'decoding' | 'completed' | 'failed' | 'cancelled';
  created_at: string; started_at?: number; error: string | null; elapsed_seconds?: number;
  generated_frames: number; token_budget?: number;
  payload: { text: string; voice_id: string; parameters: Parameters };
  result: null | {
    audio_url: string; duration: number; voice_label: string; sample_rate: number;
    parameters: Parameters; truncated: boolean; model_id: string; model_revision: string;
  };
};
export const isActive = (job: Job) => ['queued', 'running', 'decoding'].includes(job.status);
