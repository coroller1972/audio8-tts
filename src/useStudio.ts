import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Health, Job, Voice } from './types';

export function useStudio() {
  const [health, setHealth] = useState<Health | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [recordings, setRecordings] = useState<Job[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);
  const refresh = useCallback(() => setRefreshToken(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const [nextHealth, nextVoices, nextRecordings] = await Promise.all([
          api<Health>('/health', { signal: controller.signal }),
          api<Voice[]>('/voices', { signal: controller.signal }),
          api<Job[]>('/recordings', { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          setHealth(nextHealth); setVoices(nextVoices); setRecordings(nextRecordings);
        }
      } catch {
        if (!controller.signal.aborted) setHealth({ state: 'offline', error: 'Le service local est inaccessible.',
          model_id: '', revision: null, pending_jobs: 0, registration_available: false });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(poll, 2500);
      }
    }
    void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [refreshToken]);
  return { health, voices, recordings, refresh };
}
