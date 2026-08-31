import { useEffect, useMemo, useRef, useState } from "react";
import type { Scene } from "@/lib/pitch-data";
import { parseDurationToSeconds } from "@/lib/pitch-data";
import { CrossfadeImages } from "./CrossfadeImages";

const LINE_GAP_MS = 400;
const TAIL_MS = 600;
const COMMENTARY_MS = 4000;

type Commentary = { id: string; text: string };

/**
 * Owns one scene's playback timeline: Ken Burns pan/zoom on the storyboard
 * image, dialogue lines played back-to-back (one <audio> at a time — the
 * backend synthesizes each line separately, there's no single scene take),
 * captions synced to whichever line is active, and a Director's Commentary
 * overlay surfacing what the agent did (grounding at scene start).
 *
 * Play/pause is controlled by the parent (SceneReel) via `playing` — this
 * component reacts to that prop rather than owning its own transport state,
 * so the reel can pause/resume without remounting (which would restart the
 * scene from its first line). A fresh start of a scene — first play, a
 * filmstrip jump, or a replay — is instead done by SceneReel changing this
 * component's `key`, which naturally resets all internal state to line 0.
 */
export function ScenePlayer({
  scene,
  index,
  playing,
  onEnded,
}: {
  scene: Scene;
  index: number;
  playing: boolean;
  onEnded: () => void;
}) {
  const linesWithAudio = useMemo(() => scene.dialogue.filter((d) => d.audioUrl), [scene]);
  const [lineIndex, setLineIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [commentary, setCommentary] = useState<Commentary | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const commentaryTimer = useRef<number | null>(null);
  const advanceTimer = useRef<number | null>(null);
  const hasStartedRef = useRef(false);

  const currentLine = linesWithAudio[lineIndex] ?? null;
  const kenBurnsSeconds = parseDurationToSeconds(scene.duration);

  const showCommentary = (text: string) => {
    if (commentaryTimer.current) window.clearTimeout(commentaryTimer.current);
    setCommentary({ id: `${Date.now()}`, text });
    commentaryTimer.current = window.setTimeout(() => setCommentary(null), COMMENTARY_MS);
  };

  // Sync play/pause with the controlled `playing` prop; fire the
  // scene-start grounding commentary the first time playback truly begins.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !currentLine) return;
    if (playing) {
      void el.play();
      if (!hasStartedRef.current) {
        hasStartedRef.current = true;
        if (scene.reference?.caption) {
          showCommentary(`Grounded in: ${scene.reference.caption}`);
        }
      }
    } else {
      el.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentLine]);

  useEffect(() => setProgress(0), [currentLine?.id]);

  // A scene with no voiced lines (parse/TTS gap) would otherwise stall the
  // reel forever — fall back to just holding the Ken Burns pan for its
  // computed duration, then advance.
  useEffect(() => {
    if (linesWithAudio.length > 0 || !playing) return;
    const t = window.setTimeout(onEnded, kenBurnsSeconds * 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  useEffect(
    () => () => {
      if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
      if (commentaryTimer.current) window.clearTimeout(commentaryTimer.current);
    },
    [],
  );

  const handleLineEnded = () => {
    if (lineIndex < linesWithAudio.length - 1) {
      advanceTimer.current = window.setTimeout(() => setLineIndex((i) => i + 1), LINE_GAP_MS);
    } else {
      advanceTimer.current = window.setTimeout(onEnded, TAIL_MS);
    }
  };

  return (
    <div className="relative overflow-hidden border border-border bg-card">
      <audio
        ref={audioRef}
        src={currentLine?.audioUrl ?? undefined}
        onEnded={handleLineEnded}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration) setProgress(el.currentTime / el.duration);
        }}
      />

      <CrossfadeImages
        images={scene.images}
        totalSeconds={kenBurnsSeconds}
        variant={index}
        playing={playing}
      />

      {commentary && (
        <div
          key={commentary.id}
          className="animate-frame-in absolute right-3 top-3 max-w-[26ch] cursor-pointer border border-white/20 bg-black/60 px-3 py-2 backdrop-blur-sm"
          onClick={() => setCommentary(null)}
          role="note"
        >
          <span className="label mb-1 flex items-center gap-1.5 text-accent">
            <span className="inline-block size-1.5 bg-accent" />
            Director's Commentary
          </span>
          <p className="text-xs leading-relaxed text-white/90">{commentary.text}</p>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-5 pb-5 pt-16 sm:px-8 sm:pb-6">
        {currentLine && (
          <div key={currentLine.id} className="animate-frame-in">
            <span className="label text-white/70">{currentLine.speaker}</span>
            <p className="mt-1.5 font-display text-lg leading-snug text-white sm:text-xl">
              “{currentLine.line}”
            </p>
            <div className="mt-3 h-[2px] w-full max-w-[16rem] bg-white/20">
              <div
                className="h-full bg-accent transition-[width] duration-150 ease-linear"
                style={{ width: `${Math.min(progress, 1) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
