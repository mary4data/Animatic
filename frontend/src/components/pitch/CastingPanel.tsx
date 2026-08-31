import { useState } from "react";
import { confirmCasting, uploadCharacterPhoto } from "@/lib/api";

/**
 * Shown inline on the Trace screen while the agent run is genuinely paused
 * (job status "waiting_for_casting") right after parsing, before any
 * grounding or image generation starts. Every upload here is optional —
 * pressing Continue with nothing selected is a fully valid path.
 */
export function CastingPanel({
  jobId,
  characters,
  onConfirmed,
}: {
  jobId: string;
  characters: string[];
  onConfirmed: () => void;
}) {
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      for (const [name, file] of Object.entries(photos)) {
        await uploadCharacterPhoto(jobId, name, file);
      }
      await confirmCasting(jobId);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm casting.");
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-frame-in border-2 border-accent bg-card p-5">
      <span className="label text-accent">Cast your characters</span>
      <p className="mt-2 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
        Optional: upload a reference photo per character to inform their visual description in the
        storyboards. This is used as general styling inspiration only — approximate build, hair, and
        coloring — never a face match. The photo itself is never fed into image generation and is
        discarded right after.
      </p>

      <div className="mt-4 space-y-3">
        {characters.map((name) => (
          <div
            key={name}
            className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3"
          >
            <span className="label text-foreground">{name}</span>
            <label className="label cursor-pointer border border-border px-3 py-2 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
              {photos[name] ? photos[name]!.name : "Choose photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={submitting}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setPhotos((p) => ({ ...p, [name]: file }));
                }}
              />
            </label>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <button
        type="button"
        disabled={submitting}
        onClick={() => void handleContinue()}
        className="label mt-5 border border-foreground bg-foreground px-4 py-3 text-background transition-colors hover:bg-accent disabled:opacity-50"
      >
        {submitting ? "Continuing…" : "Continue"}
      </button>
    </div>
  );
}
