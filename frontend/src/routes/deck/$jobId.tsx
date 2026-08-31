import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PitchFrame } from "@/components/pitch/PitchFrame";
import { fetchDeckPdf, getScenes } from "@/lib/api";
import type { Scene } from "@/lib/pitch-data";

export const Route = createFileRoute("/deck/$jobId")({
  head: () => ({
    meta: [
      { title: "Pitch Deck — Animatic" },
      {
        name: "description",
        content:
          "The finished pitch package: every processed scene stitched into one printable, shareable storyboard binder.",
      },
    ],
  }),
  component: Deck,
});

function Deck() {
  const { jobId } = Route.useParams();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScenes(jobId).then((res) => !cancelled && setScenes(res.scenes));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await fetchDeckPdf(jobId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `animatic-${jobId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Failed to export the PDF.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PitchFrame status="Deck assembled">
      <div className="px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6 border-b-2 border-foreground pb-4">
          <div>
            <span className="label text-muted-foreground">Pitch Package · {jobId}</span>
            <h1 className="mt-3 font-display text-5xl font-black uppercase leading-[0.9] tracking-tighter md:text-6xl">
              {scenes[0]?.title ?? "Untitled Pitch"}
            </h1>
            <p className="mt-3 text-xs text-muted-foreground">
              {scenes.length} scenes boarded, scored and voiced
            </p>
          </div>
          <div className="flex flex-wrap gap-px">
            <button
              type="button"
              disabled={exporting || scenes.length === 0}
              onClick={() => void handleExport()}
              className="label border border-foreground bg-foreground px-5 py-3 text-background transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? "Generating…" : "Export deck · PDF"}
            </button>
            {/* Share is out of scope for this build — flagged, not silently
                implemented or removed. See README "Future work". */}
            <button
              disabled
              title="Not implemented in this build — see README"
              className="label cursor-not-allowed border border-foreground px-5 py-3 opacity-50"
            >
              Copy share link
            </button>
          </div>
        </div>

        {exportError && <p className="mt-3 text-xs text-destructive">{exportError}</p>}

        <div className="mt-12 space-y-20">
          {scenes.map((scene, i) => {
            const flip = i % 2 === 1;
            return (
              <section key={scene.id} className="grid grid-cols-1 gap-6 lg:grid-cols-6">
                <div className={`lg:col-span-2 ${flip ? "lg:order-2" : ""}`}>
                  <span className="label block text-accent">Beat {scene.number}</span>
                  <span className="label mt-2 block text-muted-foreground">{scene.heading}</span>
                  <h2 className="mt-3 font-display text-2xl font-bold tracking-tight">
                    {scene.title}
                  </h2>
                  <p className="mt-3 max-w-[42ch] text-xs leading-relaxed text-muted-foreground">
                    {scene.synopsis}
                  </p>
                  <div className="my-4 rule-h" />
                  {scene.mood && <p className="font-display text-base italic">{scene.mood}</p>}
                  <div className="mt-4 space-y-3">
                    {scene.dialogue.map((d) => (
                      <p key={d.id} className="text-xs leading-relaxed">
                        <span className="label mr-2 text-accent">{d.speaker}</span>"{d.line}"
                      </p>
                    ))}
                  </div>
                </div>
                <div
                  className={`lg:col-span-4 grid gap-2 ${flip ? "lg:order-1" : ""} ${scene.images.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}
                >
                  {scene.images.length > 0 ? (
                    scene.images.map((image) => (
                      <img
                        key={image.order}
                        src={image.url}
                        alt={`Storyboard frame — ${scene.heading} — ${image.beat}`}
                        width={1280}
                        height={640}
                        loading="lazy"
                        className="aspect-[2/1] w-full border border-border object-cover"
                      />
                    ))
                  ) : (
                    <div className="aspect-[2/1] w-full border border-border bg-card" />
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-24 border-t-2 border-foreground pt-10 text-center">
          <Link
            to="/scenes/$jobId"
            params={{ jobId }}
            className="label inline-grid place-items-center border-2 border-border px-10 py-6 text-base tracking-[0.2em] text-muted-foreground transition-colors hover:text-accent"
          >
            Back to scenes
          </Link>
        </div>
      </div>
    </PitchFrame>
  );
}
