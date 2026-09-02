import { useState } from "react";
import type { Scene, SceneImage } from "@/lib/pitch-data";
import { deleteSceneImage, regenerateSceneImage } from "@/lib/api";

/**
 * The expanded view of a scene's main picture: every generated frame at
 * once, each removable or regeneratable, instead of just the one frame
 * CrossfadeImages happens to be showing. Swapped in for ScenePlayer in the
 * same slot by SceneReel when the main picture is clicked; collapsing goes
 * back to the normal crossfading player.
 */
export function SceneFrameGrid({
  scene,
  jobId,
  onCollapse,
  onImagesChange,
}: {
  scene: Scene;
  jobId: string;
  onCollapse: () => void;
  onImagesChange: (images: SceneImage[]) => void;
}) {
  const [busyOrder, setBusyOrder] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = async (order: number) => {
    setBusyOrder(order);
    setError(null);
    try {
      const { image } = await regenerateSceneImage(jobId, scene.id, order);
      onImagesChange(scene.images.map((img) => (img.order === order ? image : img)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate frame.");
    } finally {
      setBusyOrder(null);
    }
  };

  const handleDelete = async (order: number) => {
    setBusyOrder(order);
    setError(null);
    try {
      const { images } = await deleteSceneImage(jobId, scene.id, order);
      onImagesChange(images);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove frame.");
    } finally {
      setBusyOrder(null);
    }
  };

  return (
    <div className="border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="label text-muted-foreground">
          All frames — Beat {scene.number} ({scene.images.length})
        </span>
        <button
          type="button"
          onClick={onCollapse}
          className="label border border-foreground px-3 py-1.5 transition-colors hover:bg-foreground hover:text-background"
        >
          Collapse ↑
        </button>
      </div>

      {error && <p className="px-4 pt-3 text-xs text-destructive">{error}</p>}

      {scene.images.length === 0 ? (
        <p className="p-4 text-xs text-muted-foreground">
          No frames left for this scene — regenerate isn't available with none to work from.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
          {scene.images.map((image) => {
            const busy = busyOrder === image.order;
            return (
              <div key={image.order} className="bg-card">
                <div className="relative aspect-[2/1] w-full overflow-hidden bg-background">
                  <img
                    src={image.url}
                    alt={`Storyboard frame — ${image.beat}`}
                    width={1280}
                    height={640}
                    className={`size-full object-cover transition-opacity ${busy ? "opacity-40" : ""}`}
                  />
                  {busy && (
                    <div className="absolute inset-0 grid place-items-center">
                      <span className="label bg-black/60 px-2 py-1 text-white">Working…</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="label truncate text-muted-foreground">{image.beat}</span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      disabled={busyOrder !== null}
                      onClick={() => void handleRegenerate(image.order)}
                      className="label border border-foreground px-2 py-1 transition-colors hover:bg-foreground hover:text-background disabled:pointer-events-none disabled:opacity-40"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      disabled={busyOrder !== null}
                      onClick={() => void handleDelete(image.order)}
                      className="label border border-destructive px-2 py-1 text-destructive transition-colors hover:bg-destructive hover:text-background disabled:pointer-events-none disabled:opacity-40"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
