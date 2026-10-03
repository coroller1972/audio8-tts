# Audio8 Studio — design specification

Reference: design-concept.png, generated with the built-in Image Gen tool.
Brief: complete French local voice-cloning lab, white panels on cool pale gray,
navy Inter typography, blue controls, import/record, reference transcript, text,
sampling sliders and local audio history. All UI remains HTML/CSS.

Tokens: canvas #f7f9fc, surface #fff, ink #080e29, muted #66708a,
line #e3e7ef, accent #0875ff; 8px panels and controls, 24px panel padding.
Typography: Inter, title 46px/1.15 700, section titles 20px 700, body 14px/1.5,
labels 13px 500. Header 56px; main width 1480px, 28px gutters at reference size.
Layout: header, heading, two flat panels (voice 44%, synthesis 56%), full-width
result panel, footer. At <=900px stack panels; at <=560px stack parameter inputs.
Icons: Lucide outline, 20px, 1.8px stroke; blue waveform brand.
Components: VoicePanel, Recorder, GenerationPanel, ParameterField, ResultsPanel.

Functional deviations from concept, required by the official runtime:
- sampling is always enabled, so replace the sampling toggle with plain text.
- use nonnegative seed 42; accept blank seed for a server-generated random value.
- allow top K up to 4096 and tokens up to 2048, bounded by actual context remaining.
- derive model status from API, never hardcode “Modèle prêt”.
- add reset settings, context feedback, delete/reuse/download actions and error states.
- real records replace the empty state only after successful generation.

## Fidelity ledger

- Layout: preserve header, heading, two flat work panels and full-width results.
  Reduced header and top spacing after the first screenshot to match reference rhythm.
- Palette: true white panels, cool gray canvas, navy text and blue actions match the concept.
- Typography: bundled Inter; explicit sizes for headings, labels, inputs and toolbar actions.
- Controls: upload, two source tabs, reference fields, three sliders, tokens and seed match.
  Sampling toggle replaced with a truthful static state, as required by this runtime.
- Icons: Lucide outlines retain waveform, upload, user, play and headphones metaphors.
- Copy: headline, subtitle, steps, source tabs and empty-state copy retained. Added character
  count, reset, model-derived errors, context limit feedback, exports and retry by reuse
  as functional requirements. No decorative marketing content was added.
- Mobile: stack panels and sliders at 390x844, preserve input readability and prevent overflow.
- Dynamic state: native audio controls, files and selected voice profiles extend the same system.

Concept generated with built-in Image Gen; interface implemented in HTML/CSS, no raster UI.
Inspected concept and final browser render with view_image. Desktop reference viewport 1536x1024.
Browser path: IAB first; file chooser calls took 100–647 seconds, so verification continued
with Playwright Chromium. Microphone capture was simulated; physical microphone quality
and Safari permission behavior have not been tested.
