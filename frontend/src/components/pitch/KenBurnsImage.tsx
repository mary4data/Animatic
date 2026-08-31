/**
 * The storyboard-frame pan/zoom used by ScenePlayer. `variant` alternates
 * between the two pan directions (kenburns-a/kenburns-b, defined in
 * styles.css) so consecutive frames don't all pan the same way.
 */
export function KenBurnsImage({
  image,
  alt,
  seconds,
  variant,
  playing,
  emptyLabel = "No frame generated",
}: {
  image: string | null | undefined;
  alt: string;
  seconds: number;
  variant: number;
  playing: boolean;
  emptyLabel?: string;
}) {
  const anim = variant % 2 === 0 ? "kenburns-a" : "kenburns-b";

  return (
    <div className="aspect-[2/1] w-full overflow-hidden">
      {image ? (
        <img
          key={image}
          src={image}
          alt={alt}
          className="size-full object-cover"
          style={{
            animationName: anim,
            animationDuration: `${seconds}s`,
            animationTimingFunction: "linear",
            animationFillMode: "forwards",
            animationPlayState: playing ? "running" : "paused",
          }}
        />
      ) : (
        <div className="grid size-full place-items-center bg-card">
          <span className="label text-muted-foreground">{emptyLabel}</span>
        </div>
      )}
    </div>
  );
}
