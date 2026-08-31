# Scene Weaver

Lovable Prompt — Pitch Bible UI/UX

Copy everything below the line into Lovable.

Design a web app called Pitch Bible — a tool that turns a screenplay into a visual pitch package. Focus entirely on UI/UX and visual design; use mock/placeholder data instead of real backend logic (placeholder images, lorem-ipsum-style dialogue, fake audio waveforms) since this is a design exploration, not the production build.

Concept

A screenwriter or producer uploads a script excerpt. The app processes it scene-by-scene and produces, for each scene: a storyboard image, a short mood/score description, and voiced dialogue lines — plus a visible "quality check" moment where the app flags and fixes a line whose voiced emotion didn't match the script's intent. The whole point of the UI is to make an AI agent's multi-step process feel transparent and cinematic, not like a black-box spinner.

Core screens

Upload / Landing screen

Clean, cinematic feel — think a mix of a screenwriting tool (Final Draft) and a film production dashboard, not a generic SaaS landing page.

Drag-and-drop area for a script PDF, plus a "try a sample script" option.

Should feel calm and premium, not cluttered.

Processing / Agent trace view

This is the most important screen. While the app "works," show a live, readable trace of what the agent is doing step by step: parsing the script, pulling a style reference, generating a storyboard, generating a voice line, running a tone check.

Each step should feel like a distinct, understandable beat — not a generic progress bar. Think: a vertical timeline or a "clapperboard slate" motif where each step is its own card that lights up as it completes.

Include a moment where a tone-check step visibly flags a mismatch (e.g., a small warning badge: "Tone mismatch detected — retrying") and then resolves it (badge turns green: "Corrected"). This moment should be the emotional high point of the UI — give it a bit of visual weight (a subtle animation, a color shift) without being gimmicks.

Scene results view

Once a scene finishes, show the result as a "scene card": storyboard image, a short mood/score label (e.g., "Tense — sparse piano, minor key"), and a play button for the voiced dialogue with waveform or speaker-labeled transcript underneath.

Let users flip between multiple scenes (tabs, a filmstrip-style horizontal scroll, or a sidebar) — whichever feels most natural for reviewing several scenes as a set.

Include a small "why this looks this way" affordance — e.g., tapping the image shows the style reference that grounded it (this is where the Parallel-search grounding step becomes visible to the user, which matters for demoing that it's not just guessing).

Full pitch deck / export view

A clean summary view stitching all processed scenes together — like flipping through a finished pitch deck or storyboard binder.

Include an export/share affordance (even if non-functional in this design pass).

Visual direction

Lean into a film production aesthetic: think slate/clapperboard textures, film-strip motifs, warm practical-light color grading — but keep it modern and clean, not kitschy or overly literal (no fake film-grain overlays everywhere).

Dark-mode-first, with a restrained accent color used specifically for "agent is actively working" states and the tone-check moment, so the eye is drawn to the parts of the UI that show the agent reasoning.

Typography should feel editorial/cinematic (something with character for headings) paired with a clean, highly readable body font — this app will have a lot of dialogue text on screen, so legibility matters more than flourish there.

Avoid generic "AI app" tropes (purple gradients, sparkle icons, floating orbs) — this should feel like a tool built for people who make films, not a generic AI wrapper.

Interaction notes

Prioritize a sense of transparency and craft over speed — the agent's step-by-step process is the product's differentiator, so don't rush or hide it behind a single loading spinner.

Micro-interactions (a card flipping to reveal detail, a subtle glow when a step completes) are welcome but should stay subtle — this is a professional tool for a creative industry audience, not a consumer entertainment app.

Please propose 2-3 distinct visual directions or layout options for the processing/agent-trace screen in particular, since that's the hardest design problem here — I want to compare approaches before committing to one.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/52020436-a077-44f5-a329-e88d7e6f4d5d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
