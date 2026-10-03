import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Upload, UserRound, X } from 'lucide-react';
import { api, waitForJob } from '../api';
import type { Job, Voice } from '../types';
import { Recorder, RECORDING_PHRASE } from './Recorder';

type Props = { voices: Voice[]; selected: string; onSelect: (id: string) => void; ready: boolean; refresh: () => void };

export function VoicePanel({ voices, selected, onSelect, ready, refresh }: Props) {
  const [mode, setMode] = useState<'upload' | 'record'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [transcript, setTranscript] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const objectUrl = URL.createObjectURL(file); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  function acceptFile(next: File) {
    setError(''); setMessage('');
    if (next.size > 50 * 1024 * 1024) { setError('Le fichier dépasse 50 Mo.'); return; }
    setFile(next);
    if (!label.trim()) setLabel(next.name.replace(/\.[^.]+$/, '').slice(0, 64));
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setError(''); setMessage('Préparation de l’audio…');
    try {
      const data = new FormData(); data.append('audio', file); data.append('label', label.trim()); data.append('reference_text', transcript.trim());
      const job = await api<Job>('/voices', { method: 'POST', body: data });
      await waitForJob(job.id, update => setMessage(update.status === 'queued' ? 'En attente du moteur…' : 'Encodage de votre voix…'));
      onSelect(job.payload.voice_id); refresh(); setFile(null); setLabel(''); setTranscript('');
      setMessage('Voix créée. Elle est prête à être utilisée.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Création impossible.'); setMessage(''); }
    finally { setBusy(false); }
  }

  return <section className="panel voice-panel" aria-labelledby="voice-title">
    <h2 id="voice-title"><span className="step">01</span> Votre voix</h2>
    <div className="tabs" role="tablist" aria-label="Source de la voix">
      <button type="button" role="tab" aria-selected={mode === 'upload'} aria-controls="voice-source" className={mode === 'upload' ? 'active' : ''} disabled={busy} onClick={() => setMode('upload')}>Importer</button>
      <button type="button" role="tab" aria-selected={mode === 'record'} aria-controls="voice-source" className={mode === 'record' ? 'active' : ''} disabled={busy} onClick={() => setMode('record')}>Enregistrer</button>
    </div>
    <form onSubmit={register}>
      <fieldset disabled={busy}>
        <div id="voice-source" role="tabpanel">
          {mode === 'upload' ? <label className={`dropzone ${dragging ? 'dragging' : ''}`} htmlFor="audio-file"
            onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)} onDrop={event => {
              event.preventDefault(); setDragging(false);
              const next = event.dataTransfer.files[0]; if (next && !busy) acceptFile(next);
            }}>
            <Upload size={27} strokeWidth={1.8} />
            <strong>Déposez votre audio</strong>
            <span>ou <span className="link-text">choisir un fichier</span></span>
            <small>WAV, MP3, M4A, WebM · 30 s maximum</small>
            <input id="audio-file" className="file-input" type="file" accept="audio/*,.m4a,.webm,.flac" onChange={event => {
              const next = event.target.files?.[0]; if (next) acceptFile(next); event.target.value = '';
            }} />
          </label> : <Recorder disabled={busy} onFile={acceptFile} onError={setError} onStart={() => {
            setFile(null); setTranscript(RECORDING_PHRASE); setError(''); setMessage('');
          }} />}
        </div>
        {file && <div className="reference-preview">
          <div className="file-summary"><span>{file.name}</span><button type="button" className="icon-button" title="Retirer l’extrait" aria-label="Retirer l’extrait" onClick={() => setFile(null)}><X size={16} /></button></div>
          <audio controls src={url || undefined} preload="metadata" aria-label="Écouter l’extrait de référence" />
        </div>}
        <label className="field">Nom de la voix
          <input value={label} onChange={event => setLabel(event.target.value)} maxLength={64} placeholder="Ex. Ma voix, Voix narration, etc." required />
        </label>
        <label className="field">Transcription exacte
          <textarea className="transcript" value={transcript} onChange={event => setTranscript(event.target.value)} maxLength={2000} placeholder="Saisissez ici la transcription exacte de l’audio déposé…" required />
        </label>
        <button className="button soft full-width" type="submit" disabled={!file || !label.trim() || !transcript.trim() || !ready || busy}>
          {busy ? <LoaderCircle size={17} className="spin" /> : null}{busy ? 'Création de la voix…' : 'Créer la voix'}
        </button>
      </fieldset>
    </form>
    {error ? <p role="alert" className="feedback error">{error}</p> : message ? <p role="status" className="feedback success">{message}</p> : null}
    <div className="voice-list">
      <h3>Voix enregistrées</h3>
      {voices.length ? <div className="voice-options">{voices.map(voice => <button key={voice.name} type="button" className={`voice-option ${selected === voice.name ? 'selected' : ''}`} onClick={() => onSelect(voice.name)} aria-pressed={selected === voice.name}>
        <UserRound size={18} /><span><strong>{voice.label || voice.name}</strong><small>{voice.duration?.toFixed(1)} s de référence</small></span>{selected === voice.name ? <Check size={18} /> : null}
      </button>)}</div> : <div className="empty-voices"><UserRound size={20} /><span>Aucune voix enregistrée.</span></div>}
    </div>
  </section>;
}
