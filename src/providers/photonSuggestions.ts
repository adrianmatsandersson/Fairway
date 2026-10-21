import type { LocationSuggestion, SuggestionProvider } from "../domain";

const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/";
const REQUEST_INTERVAL_MS = 1_000;
const CACHE_LIMIT = 100;
const suggestionCache = new Map<string, LocationSuggestion[]>();
let nextRequestAt = 0;

interface PhotonFeature {
  geometry?: {
    type: "Point";
    coordinates: [number, number];
  };
  properties?: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface PhotonResponse {
  features?: PhotonFeature[];
}

function photonEndpoint(): string {
  const configured = import.meta.env.VITE_PHOTON_API_URL?.trim();
  return (configured || DEFAULT_PHOTON_URL).replace(/\/?$/, "/");
}

function displayName(properties: NonNullable<PhotonFeature["properties"]>): string {
  const locality =
    properties.city ??
    properties.town ??
    properties.village ??
    properties.municipality ??
    properties.suburb;
  const parts = [
    properties.name,
    [properties.housenumber, properties.street].filter(Boolean).join(" "),
    properties.postcode,
    locality,
    properties.county,
    properties.state,
    properties.country,
  ].filter((part): part is string => Boolean(part?.trim()));
  return parts.filter(
    (part, index) =>
      parts.findIndex((candidate) => candidate.toLocaleLowerCase() === part.toLocaleLowerCase()) === index,
  ).join(", ");
}

function isCourse(properties: NonNullable<PhotonFeature["properties"]>): boolean {
  return (
    (properties.osm_key === "leisure" && properties.osm_value === "golf_course") ||
    (properties.osm_key === "golf" && properties.osm_value === "course")
  );
}

export class PhotonSuggestionProvider implements SuggestionProvider {
  async suggest(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
    const value = query.trim();
    if (signal?.aborted) throw abortError();
    if (!value) return [];

    const cacheKey = value.toLocaleLowerCase();
    const cached = suggestionCache.get(cacheKey);
    if (cached) return cached;

    await waitForRequestSlot(signal);
    const params = new URLSearchParams({
      q: value,
      limit: "5",
      lang: "default",
    });
    const response = await fetch(`${photonEndpoint()}?${params}`, { signal });
    if (!response.ok) {
      throw new Error("Place suggestions are unavailable right now. You can still search this text.");
    }
    const data = (await response.json()) as PhotonResponse;
    const suggestions = (data.features ?? [])
      .flatMap((feature): LocationSuggestion[] => {
        const properties = feature.properties;
        const coordinates = feature.geometry?.coordinates;
        if (
          !properties ||
          !Number.isFinite(properties.osm_id) ||
          !coordinates ||
          coordinates.length !== 2 ||
          !Number.isFinite(coordinates[0]) ||
          !Number.isFinite(coordinates[1])
        ) {
          return [];
        }

        const label = properties.name || properties.city || properties.town || properties.village;
        if (!label) return [];
        return [{
          placeId: properties.osm_id!,
          name: label,
          latitude: coordinates[1],
          longitude: coordinates[0],
          displayName: displayName(properties) || label,
          kind: isCourse(properties) ? "course" : "location",
        }];
      });

    suggestionCache.set(cacheKey, suggestions);
    if (suggestionCache.size > CACHE_LIMIT) {
      const oldestKey = suggestionCache.keys().next().value;
      if (oldestKey) suggestionCache.delete(oldestKey);
    }
    return suggestions;
  }
}

async function waitForRequestSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + REQUEST_INTERVAL_MS;
  const wait = slot - now;
  if (wait <= 0) return;

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, wait);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException("The request was aborted.", "AbortError");
}
