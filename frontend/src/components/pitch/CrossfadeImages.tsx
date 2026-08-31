import { useEffect, useState } from "react";
import type { SceneImage } from "@/lib/pitch-data";
import { KenBurnsImage } from "./KenBurnsImage";

/**
 * Crossfades across a scene's 2-3 storyboard-beat images over the scene's
 * total hold time (still `parseDurationToSeconds(scene.duration)`, driven
 * entirely by dialogue-audio length — audio/caption timing in ScenePlayer is
 * untouched by this). Each beat still gets its own full Ken Burns pan/zoom
 * via KenBurnsImage for its slice of the hold time; layers are stacked and
 * cross-dissolve on opacity rather than swapping instantly.
 */
export function CrossfadeImages({
  images,
  totalSeconds,
  variant,
  playing,
}: {
  images: SceneImage[];
  totalSeconds: number;
  variant: number;
  playing: boolean;
}) {
  const [index, setIndex] = useState(0);
  const holdSeconds = images.length > 0 ? totalSeconds / images.length : totalSeconds;

  useEffect(() => {
    if (!playing || images.length <= 1 || index >= images.length - 1) return;
    const t = window.setTimeout(() => setIndex((i) => i + 1), holdSeconds * 1000);
    return () => window.clearTimeout(t);
  }, [playing, index, images.length, holdSeconds]);

  if (images.length === 0) {
    return (
      <KenBurnsImage
        image={null}
        alt="No frame generated"
        seconds={totalSeconds}
        variant={variant}
        playing={playing}
      />
    );
  }

  return (
    <div className="relative aspect-[2/1] w-full overflow-hidden">
      {images.map((image, i) => (
        <div
          key={image.order}
          className="absolute inset-0 transition-opacity duration-[600ms]"
          style={{ opacity: i === index ? 1 : 0 }}
        >
          <KenBurnsImage
            image={image.url}
            alt={`Storyboard frame — ${image.beat}`}
            seconds={holdSeconds}
            variant={variant + i}
            playing={playing && i === index}
          />
        </div>
      ))}
    </div>
  );
}
