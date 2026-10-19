import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CLOCK_FORMAT_OPTIONS,
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
} from "./preferences";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } as unknown as Storage;
}

describe("saved preferences", () => {
  it("uses concise clock-format labels", () => {
    expect(CLOCK_FORMAT_OPTIONS).toEqual([
      { value: "24h", label: "24-hour" },
      { value: "12h", label: "12-hour" },
    ]);
  });

  it("persists and reloads valid preferences", () => {
    vi.stubGlobal("localStorage", makeStorage());
    const preferences = { clockFormat: "12h" as const, radiusKm: 20 as const };

    savePreferences(preferences);

    expect(loadPreferences()).toEqual(preferences);
  });

  it("uses defaults for malformed or invalid stored preferences", () => {
    const storage = makeStorage({
      "fairway.preferences": '{"clockFormat":"12h","radiusKm":12}',
    });
    vi.stubGlobal("localStorage", storage);
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);

    vi.stubGlobal("localStorage", {
      getItem: () => "{invalid json",
      setItem: () => undefined,
    });
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("keeps defaults and does not throw when storage access is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("Storage is blocked");
      },
      setItem: () => {
        throw new Error("Storage is blocked");
      },
    });

    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(() => savePreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });
});
