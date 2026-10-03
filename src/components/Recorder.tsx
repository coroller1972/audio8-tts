import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';

export const RECORDING_PHRASE = 'Bonjour, voici ma voix. Je prends quelques secondes pour parler naturellement, avec un ton calme et une articulation claire.';

type Props = { onFile: (file: File) => void; onStart: () => void; onError: (message: string) => void; disabled: boolean };

export function Recorder({ onFile, onStart, onError, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const alive = useRef(true);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (interval.current) clearInterval(interval.current);
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stream.current?.getTracks().forEach(track => track.stop());
    };
  }, []);

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError('L’enregistrement nécessite un navigateur récent sur localhost ou HTTPS.'); return;
    }
    setRequesting(true);
    try {
      const source = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!alive.current) { source.getTracks().forEach(track => track.stop()); return; }
      stream.current = source;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const media = new MediaRecorder(source, mimeType ? { mimeType } : undefined);
      recorder.current = media;
      const chunks: BlobPart[] = [];
      const startedAt = performance.now();
      media.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      media.onstop = () => {
        if (interval.current) clearInterval(interval.current);
        source.getTracks().forEach(track => track.stop());
        if (!alive.current) return;
        setRecording(false);
        const blob = new Blob(chunks, { type: media.mimeType });
        if ((performance.now() - startedAt) / 1000 < 0.5 || !blob.size) {
          onError('Enregistrez au moins une demi-seconde de parole.'); return;
        }
        const extension = media.mimeType.includes('mp4') ? 'm4a' : media.mimeType.includes('ogg') ? 'ogg' : 'webm';
        onFile(new File([blob], `ma-voix.${extension}`, { type: blob.type }));
      };
      media.onerror = () => {
        source.getTracks().forEach(track => track.stop());
        if (interval.current) clearInterval(interval.current);
        if (alive.current) { setRecording(false); onError('L’enregistrement a été interrompu. Réessayez.'); }
      };
      media.start(); onStart(); setSeconds(0); setRecording(true);
      interval.current = setInterval(() => {
        const elapsed = (performance.now() - startedAt) / 1000;
        setSeconds(elapsed);
        // Leave room for recorder flush so the server's 30 s bound is never exceeded.
        if (elapsed >= 29 && media.state === 'recording') media.stop();
      }, 100);
    } catch (error) {
      stream.current?.getTracks().forEach(track => track.stop());
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      onError(denied ? 'Autorisez l’accès au microphone dans votre navigateur.' : 'Le microphone est indisponible. Vous pouvez importer un fichier.');
    } finally { if (alive.current) setRequesting(false); }
  }

  return <div className={`recorder ${recording ? 'recording' : ''}`}>
    <p className="reading-guide">Lisez cette phrase naturellement :</p>
    <blockquote>{RECORDING_PHRASE}</blockquote>
    <button type="button" className={recording ? 'button stop-button' : 'button secondary'} disabled={disabled || requesting}
      onClick={() => recording ? recorder.current?.stop() : void start()}>
      {recording ? <Square size={16} /> : <Mic size={18} />}
      {recording ? `Arrêter · ${seconds.toFixed(1)} s` : requesting ? 'Accès au microphone…' : 'Enregistrer ma voix'}
    </button>
    <p className="hint">5 à 15 secondes conseillées · arrêt automatique avant 30 s</p>
  </div>;
}
