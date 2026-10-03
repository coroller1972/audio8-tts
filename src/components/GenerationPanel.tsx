import { HelpCircle, LoaderCircle, Play, RotateCcw } from 'lucide-react';
import type { Parameters } from '../types';
import { DEFAULTS } from '../types';

type Props = { text: string; setText: (value: string) => void; parameters: Parameters;
  setParameters: (value: Parameters) => void; ready: boolean; selected: string; busy: boolean;
  message: string; error: string; onGenerate: () => void; onCancel: () => void };

function Hint({ text }: { text: string }) {
  return <span className="help" tabIndex={0} aria-label={text} data-tooltip={text}><HelpCircle size={13} /></span>;
}

export function GenerationPanel({ text, setText, parameters, setParameters, ready, selected, busy, message, error, onGenerate, onCancel }: Props) {
  const sliders = [
    { key: 'temperature' as const, label: 'Température', min: 0.05, max: 2, step: 0.05, hint: 'Une valeur basse réduit la variabilité ; une valeur élevée peut rendre la voix moins stable.' },
    { key: 'top_p' as const, label: 'Top P', min: 0.05, max: 1, step: 0.05, hint: 'Limite les candidats en fonction de leur probabilité cumulée.' },
    { key: 'top_k' as const, label: 'Top K', min: 1, max: 200, step: 1, hint: 'Nombre de candidats conservés. Le champ numérique accepte jusqu’à 4096.' },
  ];
  return <section className="panel generation-panel" aria-labelledby="generation-title">
    <h2 id="generation-title"><span className="step">02</span> Texte à prononcer</h2>
    <form onSubmit={event => { event.preventDefault(); onGenerate(); }}>
      <fieldset disabled={busy}>
        <label className="sr-only" htmlFor="target-text">Texte à prononcer</label>
        <textarea id="target-text" className="target-text" value={text} onChange={event => setText(event.target.value)} maxLength={4000} required />
        <div className="text-meta"><span>{text.length.toLocaleString('fr-FR')} / 4 000 caractères</span></div>
        <div className="parameters-heading"><h3>Paramètres de génération</h3><button type="button" className="text-button" onClick={() => setParameters({ ...DEFAULTS })} title="Réinitialiser les paramètres"><RotateCcw size={14} />Réinitialiser</button></div>
        <div className="sliders">
          {sliders.map(slider => <div className="parameter" key={slider.key}>
            <div className="parameter-label"><label htmlFor={`range-${slider.key}`}>{slider.label}</label><Hint text={slider.hint} />
              <input className="parameter-value" type="number" aria-label={`Valeur ${slider.label}`} min={slider.min} max={slider.key === 'top_k' ? 4096 : slider.max} step={slider.step} value={parameters[slider.key]} required onChange={event => setParameters({ ...parameters, [slider.key]: Number(event.target.value) })} />
            </div>
            <input id={`range-${slider.key}`} type="range" min={slider.min} max={slider.max} step={slider.step} value={Math.min(parameters[slider.key], slider.max)} onChange={event => setParameters({ ...parameters, [slider.key]: Number(event.target.value) })} />
            <div className="range-bounds"><span>{slider.min}</span><span>{slider.max}</span></div>
          </div>)}
        </div>
        <div className="advanced-parameters">
          <label className="field"><span>Tokens maximum <Hint text="Une frame audio correspond à environ 46 ms. Le contexte partagé avec le texte et la référence limite la génération ; un plafond trop bas peut couper la phrase." /></span>
            <input type="number" min={1} max={2048} step={1} required value={parameters.max_new_tokens} onChange={event => setParameters({ ...parameters, max_new_tokens: Number(event.target.value) })} />
          </label>
          <label className="field"><span>Seed <Hint text="Une même seed aide à reproduire un essai dans le même environnement. Laissez vide pour une valeur aléatoire, conservée dans le résultat." /></span>
            <input type="number" min={0} max={4294967295} step={1} placeholder="Aléatoire" value={parameters.seed ?? ''} onChange={event => setParameters({ ...parameters, seed: event.target.value === '' ? null : Number(event.target.value) })} />
          </label>
          <div className="sampling-info"><span>Échantillonnage <Hint text="Ce runtime ONNX utilise toujours l’échantillonnage. Le mode déterministe do_sample=false n’est pas disponible." /></span><p><span className="status-dot" />Activé par le modèle</p></div>
        </div>
        <button type="submit" className="button primary full-width generate-button" disabled={!ready || !selected || !text.trim() || busy}>
          {busy ? <LoaderCircle className="spin" size={21} /> : <Play size={21} />}{busy ? 'Génération en cours…' : 'Générer l’audio'}
        </button>
      </fieldset>
    </form>
    <div className="generation-feedback" aria-live="polite">
      {error ? <p className="feedback error" role="alert">{error}</p> : busy ? <div className="progress-line"><span>{message}</span><button className="text-button" type="button" onClick={onCancel}>Annuler</button></div> : <p className="hint">{message || (!selected ? 'Créez ou sélectionnez une voix pour commencer.' : 'Votre voix est prête. Lancez votre prochain essai.')}</p>}
    </div>
  </section>;
}
