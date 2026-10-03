import type { Job } from './types';

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  if (!response.ok) {
    let message = `Erreur du service (${response.status}).`;
    try {
      const body = await response.json();
      message = typeof body.detail === 'string' ? body.detail :
        'Vérifiez les champs et les limites des paramètres.';
    } catch { /* retain readable fallback */ }
    throw new Error(message);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export async function waitForJob(id: string, onUpdate: (job: Job) => void): Promise<Job> {
  for (;;) {
    const job = await api<Job>(`/jobs/${id}`);
    onUpdate(job);
    if (['completed', 'failed', 'cancelled'].includes(job.status)) {
      if (job.status === 'failed') throw new Error(job.error || 'Ce travail a échoué.');
      return job;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
