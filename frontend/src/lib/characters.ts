/** De-duplicated (stripped, first-seen-casing) speaker list across parsed
 * scenes — mirrors backend/agent/tools/parse_script.py's own roster logic,
 * since character names here must match what describe_character_reference
 * looks up server-side. */
export function uniqueSpeakers(scenes: Array<{ dialogue: Array<{ speaker: string }> }>): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const scene of scenes) {
    for (const line of scene.dialogue) {
      const name = line.speaker.trim();
      const key = name.toLowerCase();
      if (name && !seen.has(key)) {
        seen.add(key);
        names.push(name);
      }
    }
  }
  return names;
}
