import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PitchFrame } from "@/components/pitch/PitchFrame";
import { SceneReel } from "@/components/pitch/SceneReel";
import { getScenes } from "@/lib/api";
import type { Scene } from "@/lib/pitch-data";

export const Route = createFileRoute("/scenes/$jobId")({
  head: () => ({
    meta: [
      { title: "Scene Results — Animatic" },
      {
        name: "description",
        content:
          "Watch each scene as one continuous reel: storyboard pan, voiced dialogue in sequence, synced captions, and the agent's own commentary on how it got there.",
      },
    ],
  }),
  component: Scenes,
});

function Scenes() {
  const { jobId } = Route.useParams();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getScenes(jobId)
      .then((res) => {
        if (cancelled) return;
        setScenes(res.scenes);
        setError(res.status === "failed" ? res.error : null);
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  if (loading) {
    return (
      <PitchFrame status="Loading">
        <div className="px-6 py-8 md:px-10">
          <p className="text-sm text-muted-foreground">Loading scenes…</p>
        </div>
      </PitchFrame>
    );
  }

  if (error || scenes.length === 0) {
    return (
      <PitchFrame status="No scenes">
        <div className="px-6 py-8 md:px-10">
          <p className="text-sm text-muted-foreground">
            {error ?? "No scenes are ready for this job yet."}
          </p>
          <Link
            to="/process/$jobId"
            params={{ jobId }}
            className="label mt-4 inline-block border border-border px-4 py-3"
          >
            ← Back to trace
          </Link>
        </div>
      </PitchFrame>
    );
  }

  return (
    <PitchFrame status="Pass complete">
      <div className="px-6 py-8 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="label text-muted-foreground">Scene Results</span>
            <h1 className="mt-2 font-display text-4xl font-black uppercase tracking-tighter md:text-5xl">
              The Reel
            </h1>
          </div>
          <Link
            to="/deck/$jobId"
            params={{ jobId }}
            className="label border border-foreground bg-foreground px-4 py-3 text-background transition-colors hover:bg-accent"
          >
            Open pitch deck →
          </Link>
        </div>

        <div className="mt-8">
          <SceneReel scenes={scenes} />
        </div>
      </div>
    </PitchFrame>
  );
}
