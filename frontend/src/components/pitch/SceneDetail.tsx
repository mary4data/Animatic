import { useState } from "react";
import type { Scene } from "@/lib/pitch-data";

/**
 * Supporting info for the active scene — grounding detail, mood/score,
 * synopsis, and the full dialogue transcript. The image and per-line audio
 * that used to live here moved into ScenePlayer, which is now the primary
 * way a scene is experienced; this stays secondary, underneath the player.
 */
export function SceneDetail({ scene }: { scene: Scene }) {
  const [showRef, setShowRef] = useState(false);

  return (
    <section className="animate-frame-in">
      <div className="border-b-2 border-foreground pb-3">
        <span className="label text-muted-foreground">
          Beat {scene.number} / {scene.heading}
        </span>
        <h3 className="mt-2 font-display text-4xl font-bold tracking-tight">{scene.title}</h3>
      </div>

      <div className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <button
            type="button"
            onClick={() => setShowRef((v) => !v)}
            className="label border border-foreground px-4 py-2 text-foreground transition-colors hover:bg-foreground hover:text-background"
            aria-expanded={showRef}
          >
            {showRef ? "Hide grounding ↓" : "Why this looks this way ↗"}
          </button>

          {showRef && scene.reference && (
            <div className="mt-4 animate-frame-in border border-border bg-card p-4">
              {/* Parallel Search returns text + a source URL, not a guaranteed
                  image — this panel shows a reference image when one was
                  found and falls back to text-only grounding otherwise. */}
              <div
                className={`grid grid-cols-1 gap-4 ${scene.reference.image ? "sm:grid-cols-[10rem_1fr]" : ""}`}
              >
                {scene.reference.image && (
                  <img
                    src={scene.reference.image}
                    alt={scene.reference.caption}
                    width={768}
                    height={576}
                    loading="lazy"
                    className="aspect-[4/3] w-full border border-border object-cover"
                  />
                )}
                <div>
                  <span className="label text-accent">Grounding</span>
                  <p className="mt-1.5 text-xs text-foreground">{scene.reference.caption}</p>
                  <ul className="mt-3 space-y-1.5">
                    {scene.reference.notes.map((n) => (
                      <li key={n} className="text-xs leading-relaxed text-muted-foreground">
                        — {n}
                      </li>
                    ))}
                  </ul>
                  {scene.reference.sourceUrl && (
                    <a
                      href={scene.reference.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="label mt-3 inline-block text-accent underline underline-offset-4"
                    >
                      Source ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6">
            <span className="label text-muted-foreground">Voiced dialogue</span>
            <div className="mt-3 space-y-5">
              {scene.dialogue.map((d) => (
                <div key={d.id} className="grid grid-cols-[5.5rem_1fr] gap-4">
                  <span className="label pt-1 text-accent">{d.speaker}</span>
                  <div>
                    {d.direction && (
                      <p className="text-xs italic text-muted-foreground">({d.direction})</p>
                    )}
                    <p className="mt-0.5 font-display text-base leading-relaxed">“{d.line}”</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <span className="label text-muted-foreground">Mood / Score</span>
          <p className="mt-1.5 font-display text-xl italic">{scene.mood}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{scene.score}</p>

          <div className="my-6 rule-h animate-rule-draw" />

          <span className="label text-muted-foreground">Synopsis</span>
          <p className="mt-1.5 max-w-[46ch] text-sm leading-relaxed">{scene.synopsis}</p>
        </div>
      </div>
    </section>
  );
}
