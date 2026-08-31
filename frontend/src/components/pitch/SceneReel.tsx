import { useRef, useState } from "react";
import type { Scene } from "@/lib/pitch-data";
import { ScenePlayer } from "./ScenePlayer";
import { SceneDetail } from "./SceneDetail";

const CROSSFADE_MS = 550;

type Slot = { scene: Scene; index: number; key: string };

/**
 * The primary way to experience a scene: one play button drives a
 * continuous reel across every scene (ScenePlayer owns each scene's
 * playback timeline), crossfading between them on auto-advance. The
 * filmstrip is kept as a secondary jump-to-scene aid, not the main
 * interaction, per the cinematic-player redesign.
 */
export function SceneReel({ scenes }: { scenes: Scene[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [playToken, setPlayToken] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reelFinished, setReelFinished] = useState(false);
  const [outgoing, setOutgoing] = useState<Slot | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const scene = scenes[activeIndex]!;
  const activeKey = `${scene.id}-${playToken}`;

  const goToScene = (index: number) => {
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    setOutgoing({ scene, index: activeIndex, key: activeKey });
    fadeTimer.current = window.setTimeout(() => setOutgoing(null), CROSSFADE_MS);

    setActiveIndex(index);
    setPlayToken((t) => t + 1);
    setIsPlaying(true);
    setReelFinished(false);
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
        {outgoing && (
          <div
            key={outgoing.key}
            className="absolute inset-0 z-10"
            style={{
              animationName: "fade-out",
              animationDuration: `${CROSSFADE_MS}ms`,
              animationFillMode: "forwards",
            }}
          >
            <ScenePlayer
              scene={outgoing.scene}
              index={outgoing.index}
              playing={false}
              onEnded={() => {}}
            />
          </div>
        )}
        <ScenePlayer
          key={activeKey}
          scene={scene}
          index={activeIndex}
          playing={isPlaying}
          onEnded={handleEnded}
        />
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
