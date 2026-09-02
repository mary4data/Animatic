import { useRef, useState } from "react";
import type { Scene, SceneImage } from "@/lib/pitch-data";
import { ScenePlayer } from "./ScenePlayer";
import { SceneDetail } from "./SceneDetail";
import { SceneFrameGrid } from "./SceneFrameGrid";

const CROSSFADE_MS = 900;

type Slot = { scene: Scene; key: string };

/**
 * The primary way to experience a scene: one play button drives a
 * continuous reel across every scene (ScenePlayer owns each scene's
 * playback timeline), crossfading between them on auto-advance. The
 * filmstrip is kept as a secondary jump-to-scene aid, not the main
 * interaction, per the cinematic-player redesign.
 *
 * Clicking the main picture expands it into every one of that scene's
 * frames at once (SceneFrameGrid), each removable or regeneratable in
 * place; collapsing goes back to the normal crossfading player.
 */
export function SceneReel({
  scenes,
  jobId,
  onImagesChange,
}: {
  scenes: Scene[];
  jobId: string;
  onImagesChange: (sceneId: string, images: SceneImage[]) => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playToken, setPlayToken] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reelFinished, setReelFinished] = useState(false);
  const [outgoing, setOutgoing] = useState<Slot | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fadeTimer = useRef<number | null>(null);

  const scene = scenes[activeIndex]!;
  const activeKey = `${scene.id}-${playToken}`;

  const goToScene = (index: number) => {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    setOutgoing({ scene, key: activeKey });
    fadeTimer.current = window.setTimeout(() => setOutgoing(null), CROSSFADE_MS);

    setActiveIndex(index);
    setPlayToken((t) => t + 1);
    setIsPlaying(true);
    setReelFinished(false);
    setExpanded(false);
  };

  const handleEnded = () => {
    if (activeIndex < scenes.length - 1) {
      goToScene(activeIndex + 1);
    } else {
      setIsPlaying(false);
      setReelFinished(true);
    }
  };

  const handlePlayPause = () => {
    if (reelFinished) {
      goToScene(0);
    } else {
      setIsPlaying((p) => !p);
    }
  };

  const handleFilmstripClick = (index: number) => {
    goToScene(index);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={handlePlayPause}
          aria-label={reelFinished ? "Replay reel" : isPlaying ? "Pause reel" : "Play reel"}
          className="grid size-14 shrink-0 place-items-center border-2 border-foreground text-lg transition-colors hover:bg-foreground hover:text-background"
        >
          {reelFinished ? "↺" : isPlaying ? "❙❙" : "▶"}
        </button>
        <div>
          <span className="label block text-muted-foreground">
            {reelFinished ? "Reel complete" : isPlaying ? "Playing" : "Paused"}
          </span>
          <span className="label block text-foreground">
            Beat {scene.number} / {scenes.length}
          </span>
        </div>
      </div>

      <div className="relative mt-4">
        {outgoing && !expanded && (
          // A static freeze-frame of whatever the outgoing scene last showed
          // (its final beat -- CrossfadeImages' hold timing means that's what's
          // on screen by the time a scene naturally ends), not a fresh
          // ScenePlayer remount. A remount used to reset straight back to beat
          // 1's Ken Burns *start* position regardless of where the scene
          // actually was, so the dissolve was fading between two independently
          // moving/zooming images that didn't match what was really last
          // visible -- that mismatch, more than the fade duration itself, was
          // the "heavy jump." A static frame dissolving under the new scene's
          // own Ken Burns pan (already moving underneath from the start, the
          // way a real cut-on-dissolve looks) reads as one continuous motion
          // instead of two.
          <div
            key={outgoing.key}
            className="absolute inset-0 z-10 overflow-hidden border border-border bg-card"
            style={{
              animationName: "fade-out",
              animationDuration: `${CROSSFADE_MS}ms`,
              animationFillMode: "forwards",
            }}
          >
            {outgoing.scene.images.length > 0 ? (
              <img
                src={outgoing.scene.images[outgoing.scene.images.length - 1]!.url}
                alt=""
                className="aspect-[2/1] w-full object-cover"
              />
            ) : (
              <div className="aspect-[2/1] w-full" />
            )}
          </div>
        )}
        {expanded ? (
          <SceneFrameGrid
            scene={scene}
            jobId={jobId}
            onCollapse={() => setExpanded(false)}
            onImagesChange={(images) => onImagesChange(scene.id, images)}
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setIsPlaying(false);
              setExpanded(true);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              setIsPlaying(false);
              setExpanded(true);
            }}
            aria-label={`Show all ${scene.images.length} frame(s) for this scene`}
            className="group relative cursor-zoom-in"
          >
            <ScenePlayer
              key={activeKey}
              scene={scene}
              index={activeIndex}
              playing={isPlaying}
              onEnded={handleEnded}
            />
            {scene.images.length > 0 && (
              <span className="label pointer-events-none absolute left-3 top-3 z-20 border border-white/20 bg-black/60 px-2 py-1 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                ⤢ {scene.images.length} frame{scene.images.length === 1 ? "" : "s"} — click to view
                all
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-px overflow-x-auto border-y border-border py-px">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleFilmstripClick(i)}
            className={`w-44 shrink-0 border p-2 text-left transition-colors ${
              i === activeIndex ? "border-accent" : "border-border hover:border-foreground/40"
            }`}
          >
            {s.images[0] ? (
              <img
                src={s.images[0].url}
                alt={`Scene ${s.number} thumbnail`}
                width={1280}
                height={640}
                loading="lazy"
                className="aspect-[2/1] w-full object-cover"
              />
            ) : (
              <div className="aspect-[2/1] w-full bg-card" />
            )}
            <span
              className={`label mt-2 block ${i === activeIndex ? "text-accent" : "text-muted-foreground"}`}
            >
              Beat {s.number}
            </span>
            <p className="mt-1 truncate text-[11px]">{s.title}</p>
          </button>
        ))}
      </div>

      <div className="mt-10">
        <SceneDetail key={scene.id} scene={scene} />
      </div>
    </div>
  );
}
