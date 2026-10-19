export type ClockFormat = "12h" | "24h";

export const CLOCK_FORMAT_OPTIONS = [
  { value: "24h", label: "24-hour" },
  { value: "12h", label: "12-hour" },
] as const;

export const COURSE_SEARCH_RADII_KM = [5, 10, 20, 30, 50] as const;
export type CourseSearchRadiusKm = (typeof COURSE_SEARCH_RADII_KM)[number];

export interface UserPreferences {
  clockFormat: ClockFormat;
  radiusKm: CourseSearchRadiusKm;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  clockFormat: "24h",
  radiusKm: 30,
};

const STORAGE_KEY = "fairway.preferences";

function isUserPreferences(value: unknown): value is UserPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.clockFormat === "12h" || candidate.clockFormat === "24h") &&
    COURSE_SEARCH_RADII_KM.includes(candidate.radiusKm as CourseSearchRadiusKm)
  );
}

/** Reads settings defensively: storage can be disabled, malformed, or unavailable. */
export function loadPreferences(): UserPreferences {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_PREFERENCES };
    const parsed: unknown = JSON.parse(stored);
    return isUserPreferences(parsed) ? parsed : { ...DEFAULT_PREFERENCES };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

/** Persists settings when possible; privacy modes and storage quotas must not break the UI. */
export function savePreferences(preferences: UserPreferences): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences remain usable for the current page even if persistence fails.
  }
}
