import { Download, FileJson, Headphones, LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { Job } from '../types';
import { isActive } from '../types';

type Props = { recordings: Job[]; onReuse: (job: Job) => void; onDelete: (id: string) => void; onCancel: (id: string) => void; canReuse: boolean };
export function ResultsPanel({ recordings, onReuse, onDelete, onCancel, canReuse }: Props) {
  return <section className="panel results-panel" aria-labelledby="results-title">
    <div className="results-heading"><h2 id="results-title"><span className="step">03</span> Vos enregistrements</h2>{recordings.length ? <span className="hint">{recordings.length} essai{recordings.length > 1 ? 's' : ''}</span> : null}</div>
    {recordings.length === 0 ? <div className="empty-results"><Headphones size={42} strokeWidth={1.8} /><strong>Votre prochain enregistrement commence ici.</strong><p>Les résultats et leurs réglages apparaîtront dans cet espace.</p></div> : <div className="recordings">{recordings.map(job => {
      const p = job.result?.parameters || job.payload.parameters;
      return <article className="recording-row" key={job.id}>
        <div className="recording-info"><div className="recording-title"><strong>{job.result?.voice_label || 'Essai vocal'}</strong><time dateTime={job.created_at}>{new Date(job.created_at).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>
          <p className="recording-text">{job.payload.text}</p>
          <p className="recording-settings">Temp. {p.temperature} · P {p.top_p} · K {p.top_k} · {p.max_new_tokens} tokens · Seed {p.seed ?? 'aléatoire'}{job.elapsed_seconds !== undefined ? ` · Calcul ${job.elapsed_seconds.toFixed(1)} s` : ''}{job.result ? ` · Audio ${job.result.duration.toFixed(1)} s` : ''}</p>
          {job.result?.truncated ? <p className="feedback warning">Plafond de tokens atteint : la phrase peut être coupée. Augmentez la limite ou raccourcissez le texte.</p> : null}
          {job.error ? <p className="feedback error">{job.error}</p> : null}
          {job.status === 'cancelled' ? <p className="hint">Génération annulée.</p> : null}
        </div>
        <div className="recording-media">
          {job.result && job.status === 'completed' ? <audio controls preload="metadata" src={job.result.audio_url} aria-label={`Écouter ${job.result.voice_label}`} /> : isActive(job) ? <div className="job-progress"><LoaderCircle size={18} className="spin" /><span>{job.status === 'queued' ? 'En attente' : job.status === 'decoding' ? 'Décodage audio' : `${job.generated_frames} frames générées`}</span><button type="button" className="text-button" onClick={() => onCancel(job.id)}>Annuler</button></div> : null}
          <div className="recording-actions">
            {job.result ? <><a className="text-button" href={job.result.audio_url} download><Download size={15} />WAV</a><a className="icon-button" href={`/api/recordings/${job.id}/metadata`} title="Télécharger les paramètres JSON" aria-label="Télécharger les paramètres JSON"><FileJson size={16} /></a></> : null}
            <button className="text-button" type="button" disabled={!canReuse} onClick={() => onReuse(job)}><RotateCcw size={14} />Réutiliser</button>
            {!isActive(job) ? <button className="icon-button delete-button" type="button" title="Supprimer cet essai" aria-label="Supprimer cet essai" onClick={() => onDelete(job.id)}><Trash2 size={16} /></button> : null}
          </div>
        </div>
      </article>;
    })}</div>}
  </section>;
}
