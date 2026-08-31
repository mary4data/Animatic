export const SAMPLE_SCRIPT_FILENAME = "NEO-TOKYO_BLUES_SAMPLE.txt";
export const SAMPLE_SCRIPT_TITLE = "Neo-Tokyo Blues";

export const SAMPLE_SCRIPT_TEXT = `NEO-TOKYO BLUES
Draft 4 — Blue Revision

EXT. RAINY STREET - NIGHT

Wet asphalt reflects the neon like a shattered mirror. KAEL stands alone,
his silhouette cut against the fog, waiting for a man who is already late.

KAEL
(not turning around)
You keep the record. I keep the door. That was the whole arrangement.

ELARA
Arrangements are for people who plan on a second meeting.

INT. DATA CELL - CONTINUOUS

The screen flicker is the only pulse in the room. Ones and zeroes cascade
over a tired face that has stopped pretending to be surprised.

MARCUS
Plans change when the payload gets this heavy. Look at the readouts.

ELARA
(flat)
I stopped reading them the night they started lying.

INT. NOODLE BAR - LATER

Steam rises from a bowl of synthetic ramen. The chef doesn't look up. Two
people negotiate in a language of pauses.

KAEL
Eat. Whatever happens after this, you'll want to have eaten.

ELARA
(setting the chopsticks down)
That's the kindest threat anyone's made me all year.
`;

export function sampleScriptFile(): File {
  return new File([SAMPLE_SCRIPT_TEXT], SAMPLE_SCRIPT_FILENAME, { type: "text/plain" });
}
