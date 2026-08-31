import { useState } from "react";
import { selectScenes } from "@/lib/api";

const MAX_SELECTED_SCENES = 12;

type SelectableScene = {
  id: string;
  heading: string;
  title: string;
  number: string;
  synopsis?: string;
};

/**
 * Shown inline on the Trace screen while the agent run is genuinely paused
 * (job status "waiting_for_scene_selection") right after parsing, before
 * casting or any generation starts. Up to 20 scenes may have been parsed;
 * only the ones checked here are boarded, scored, and voiced.
 */
export function SceneSelectionPanel({
  jobId,
  scenes,
  onConfirmed,
}: {
  jobId: string;
  scenes: SelectableScene[];
  onConfirmed: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(scenes.slice(0, MAX_SELECTED_SCENES).map((s) => s.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atMax = selected.size >= MAX_SELECTED_SCENES;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < MAX_SELECTED_SCENES) {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const orderedIds = scenes.filter((s) => selected.has(s.id)).map((s) => s.id);
      await selectScenes(jobId, orderedIds);
      onConfirmed();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit scene selection.");
      setSubmitting(false);
    }
  };

  return (
    <div className="animate-frame-in border-2 border-accent bg-card p-5">
      <span className="label text-accent">Pick your scenes</span>
      <p className="mt-2 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
        {scenes.length} scene{scenes.length === 1 ? "" : "s"} parsed. Choose up to{" "}
        {MAX_SELECTED_SCENES} to board, score, and voice — {selected.size} selected
        {atMax ? " (maximum reached)" : ""}.
      </p>

      <div className="mt-4 max-h-[28rem] space-y-px overflow-y-auto">
        {scenes.map((scene) => {
          const checked = selected.has(scene.id);
          const disabled = submitting || (!checked && atMax);
          return (
            <label
              key={scene.id}
              className={`flex items-start gap-3 border-t border-border py-3 ${
                disabled && !checked ? "opacity-40" : "cursor-pointer"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(scene.id)}
                className="mt-1"
              />
              <div>
                <span className="label block text-foreground">
                  Beat {scene.number} / {scene.heading}
                </span>
                <p className="mt-1 text-xs font-bold leading-relaxed">{scene.title}</p>
                {scene.synopsis && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {scene.synopsis}
                  </p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <button
        type="button"
        disabled={submitting || selected.size === 0}
        onClick={() => void handleContinue()}
        className="label mt-5 border border-foreground bg-foreground px-4 py-3 text-background transition-colors hover:bg-accent disabled:opacity-50"
      >
        {submitting
          ? "Continuing…"
          : `Continue with ${selected.size} scene${selected.size === 1 ? "" : "s"}`}
      </button>
    </div>
  );
}
