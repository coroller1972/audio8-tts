import { useEffect, useRef, useState } from 'react';
import { AudioLines, LoaderCircle } from 'lucide-react';
import { api, waitForJob } from './api';
import { useStudio } from './useStudio';
import { DEFAULTS, type Job, type Parameters } from './types';
import { VoicePanel } from './components/VoicePanel';
import { GenerationPanel } from './components/GenerationPanel';
import { ResultsPanel } from './components/ResultsPanel';

const INITIAL_TEXT = 'Bonjour et bienvenue dans Audio8-TTS. Cette voix est une synthèse générée localement grâce à l’intelligence artificielle. Vous pouvez écrire ici n’importe quel texte en français pour l’écouter avec la voix que vous avez créée.';

export default function App() {
  const { health, voices, recordings, refresh } = useStudio();
  const [selected, setSelected] = useState('');
  const [text, setText] = useState(INITIAL_TEXT);
  const [parameters, setParameters] = useState<Parameters>({ ...DEFAULTS });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const jobId = useRef<string | null>(null);
  const ready = health?.state === 'ready';
  useEffect(() => { if (!selected && voices.length) setSelected(voices[0].name); }, [selected, voices]);

  async function generate() {
    if (busy || !ready || !selected || !text.trim()) return;
    setBusy(true); setError(''); setMessage('Envoi de votre texte…');
    try {
      const job = await api<Job>('/generations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice_id: selected, parameters }) });
      jobId.current = job.id; refresh();
      const result = await waitForJob(job.id, update => {
        setMessage(update.status === 'queued' ? 'Votre essai attend son tour…' : update.status === 'decoding' ? 'Décodage et création du WAV…' : `${update.generated_frames} frames audio générées${update.token_budget ? ` · plafond ${update.token_budget}` : ''}`);
      });
      setMessage(result.status === 'cancelled' ? 'Génération annulée.' : 'Enregistrement prêt. Retrouvez-le ci-dessous.');
    } catch (err) { setError(err instanceof Error ? err.message : 'La génération a échoué.'); }
    finally { jobId.current = null; setBusy(false); refresh(); }
  }

  async function cancel(id = jobId.current) {
    if (!id) return;
    try { await api(`/jobs/${id}/cancel`, { method: 'POST' }); setMessage('Annulation en cours…'); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Annulation impossible.'); }
  }

  function reuse(job: Job) {
    if (busy) return;
    setText(job.payload.text); setParameters({ ...(job.result?.parameters || job.payload.parameters) });
    setSelected(job.payload.voice_id); setError(''); setMessage('Texte et paramètres de cet essai restaurés.');
    document.getElementById('target-text')?.focus();
  }

  async function remove(id: string) {
    try { await api(`/recordings/${id}`, { method: 'DELETE' }); refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Suppression impossible.'); }
  }

  const statusLabel = ready ? 'Modèle prêt' : health?.state === 'missing' ? 'Modèle à installer' : health?.state === 'error' ? 'Erreur du modèle' : health?.state === 'offline' ? 'Service indisponible' : 'Chargement du modèle';
  return <>
    <header className="app-header"><div className="header-inner"><a className="brand" href="/" aria-label="Audio8 Studio, accueil"><AudioLines size={30} strokeWidth={2} /><span>Audio8 Studio</span></a><div className="header-status"><span className="engine-label">Local · ONNX INT4</span><span className={`model-status ${ready ? 'ready' : 'not-ready'}`} aria-live="polite">{!health || health.state === 'loading' ? <LoaderCircle size={14} className="spin" /> : <span className="status-dot" />}{statusLabel}</span></div></div></header>
    <main>
      <div className="intro"><h1>Une voix. Tous vos mots.</h1><p>Préparez une voix, écrivez votre texte et explorez Audio8-TTS.</p></div>
      {health?.error ? <div role="alert" className="service-error">{health.error}</div> : null}
      <div className="workspace">
        <VoicePanel voices={voices} selected={selected} onSelect={setSelected} ready={!!ready && !!health?.registration_available} refresh={refresh} />
        <GenerationPanel text={text} setText={setText} parameters={parameters} setParameters={setParameters} ready={!!ready} selected={selected} busy={busy} message={message} error={error} onGenerate={() => void generate()} onCancel={() => void cancel()} />
      </div>
      <ResultsPanel recordings={recordings} canReuse={!busy} onReuse={reuse} onDelete={id => void remove(id)} onCancel={id => void cancel(id)} />
      <footer><span>Audio8-TTS Preview 0.6B · Audio conservé sur cette machine</span><a href="https://huggingface.co/Edge0/Audio8-TTS-Preview-0.6B-ONNX-INT4" target="_blank" rel="noreferrer">Modèle sur Hugging Face</a></footer>
    </main>
  </>;
}
