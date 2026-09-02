// Persists the currently active job in this browser so returning to the
// upload screen -- a refresh mid-run, or navigating back after leaving --
// resumes it instead of presenting a blank form. Replaced wholesale the
// next time a script is actually uploaded (see routes/index.tsx's start());
// never merged or appended to. Session-scoped in intent, but localStorage
// (not sessionStorage) so a refresh in the same tab is covered too.

const STORAGE_KEY = "animatic:activeJob";

type StoredJob = { jobId: string; fileName: string };

export function getStoredJob(): StoredJob | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredJob>;
    if (typeof parsed.jobId !== "string") return null;
    return {
      jobId: parsed.jobId,
      fileName: typeof parsed.fileName === "string" ? parsed.fileName : "your script",
    };
  } catch {
    return null;
  }
}

export function setStoredJob(jobId: string, fileName: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ jobId, fileName } satisfies StoredJob),
    );
  } catch {
    // Storage unavailable (private browsing, quota) -- resuming just won't
    // work later; the upload itself is unaffected.
  }
}

export function clearStoredJob(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
