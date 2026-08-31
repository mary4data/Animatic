import sample01 from "@/assets/scene-01.jpg";
import sample02 from "@/assets/scene-02.jpg";
import sample03 from "@/assets/scene-03.jpg";
import ref01 from "@/assets/ref-01.jpg";

export const PROJECT = {
  title: "Animatic",
  draft: "Live pass",
  session: "—",
  pages: "—",
};

// Parses the server-computed "MM:SS" duration string (summed from real WAV
// frame counts in assemble_output.py) into seconds, for the Ken Burns
// animation length in ScenePlayer. Falls back to a sane default rather than
// a zero-length (frozen) animation when the scene has no timed audio yet.
export function parseDurationToSeconds(duration: string | null | undefined, fallback = 12): number {
  if (!duration) return fallback;
  const [mm, ss] = duration.split(":").map((n) => Number.parseInt(n, 10));
  if (mm === undefined || ss === undefined || Number.isNaN(mm) || Number.isNaN(ss)) return fallback;
  const seconds = mm * 60 + ss;
  return seconds > 0 ? seconds : fallback;
}

export type DialogueLine = {
  id: string;
  speaker: string;
  line: string;
  intent: string;
  direction?: string | null;
  audioUrl?: string | null;
};

export type SceneReference = {
  caption: string;
  notes: string[];
  sourceUrl?: string | null;
  /** best-effort — Parallel Search doesn't guarantee an image, see SceneDetail */
  image?: string | null;
};

/** One storyboard frame for a distinct visual beat within a scene — a scene
 * has 2-3 of these, crossfaded across its dialogue-audio duration by
 * CrossfadeImages (see ScenePlayer). */
export type SceneImage = {
  beat: string;
  url: string;
  order: number;
};

export type Scene = {
  id: string;
  slug: string;
  number: string;
  heading: string;
  title: string;
  images: SceneImage[];
  mood?: string | null;
  score?: string | null;
  synopsis: string;
  dialogue: DialogueLine[];
  duration?: string | null;
  reference?: SceneReference | null;
};

/**
 * Local fixture for offline component development only — NOT the runtime
 * data source. Real scenes come from GET /api/scripts/:jobId/scenes.
 */
export const SAMPLE_SCENES: Scene[] = [
  {
    id: "s1",
    slug: "01",
    number: "01",
    heading: "EXT. RAINY STREET — NIGHT",
    title: "The Shattered Mirror",
    images: [{ beat: "Establishing", url: sample01, order: 1 }],
    mood: "Tense — sparse piano, minor key",
    score: "Solo prepared piano, sub-bass swell at the turn, rain as rhythm bed.",
    synopsis:
      "Wet asphalt reflects the neon like a shattered mirror. Kael stands alone, waiting for a man who is already late.",
    dialogue: [
      {
        id: "s1-l1",
        speaker: "KAEL",
        direction: "not turning around",
        intent: "guarded",
        line: "You keep the record. I keep the door.",
      },
      {
        id: "s1-l2",
        speaker: "ELARA",
        intent: "wry deflection",
        line: "Arrangements are for people who plan on a second meeting.",
      },
    ],
    duration: "00:14",
    reference: {
      caption: "Reference — tungsten practical key, 35mm, shallow focus",
      notes: ["Warm practical light sourced entirely from signage — no fill."],
      image: ref01,
    },
  },
  {
    id: "s2",
    slug: "02",
    number: "02",
    heading: "INT. DATA CELL — CONTINUOUS",
    title: "Digital Rain",
    images: [{ beat: "Establishing", url: sample02, order: 1 }],
    mood: "Airless — pulsing analogue drone",
    score: "Single oscillator, tape hiss, no percussion.",
    synopsis: "The screen flicker is the only pulse in the room.",
    dialogue: [
      {
        id: "s2-l1",
        speaker: "MARCUS",
        intent: "urgent",
        line: "Plans change when the payload gets this heavy.",
      },
      {
        id: "s2-l2",
        speaker: "ELARA",
        direction: "flat",
        intent: "hollowed-out",
        line: "I stopped reading them the night they started lying.",
      },
    ],
    duration: "00:11",
    reference: {
      caption: "Reference — off-centre subject, deep negative space",
      notes: ["Monitor is the only key; face falls two stops under."],
      image: null,
    },
  },
  {
    id: "s3",
    slug: "03",
    number: "03",
    heading: "INT. NOODLE BAR — LATER",
    title: "Life Is Cheap Here",
    images: [{ beat: "Establishing", url: sample03, order: 1 }],
    mood: "Warm, uneasy — muted brass under room tone",
    score: "Muted trumpet, low strings, kitchen clatter left in the mix.",
    synopsis: "Steam rises from a bowl of synthetic ramen.",
    dialogue: [
      {
        id: "s3-l1",
        speaker: "KAEL",
        intent: "tender threat",
        line: "Eat. Whatever happens after this, you'll want to have eaten.",
      },
    ],
    duration: "00:16",
    reference: {
      caption: "Reference — tungsten practical key, 35mm, shallow focus",
      notes: ["Interior warmth deliberately clashed with cold exterior spill."],
      image: ref01,
    },
  },
];
