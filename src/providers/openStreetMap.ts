import type {
  CourseDiscoveryProvider,
  CourseSearchResult,
  CourseSearchOptions,
  GolfCourse,
  SearchLocation,
} from "../domain";
import { distanceKm } from "../domain";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DEFAULT_SEARCH_RADIUS_KM = 30;
const MIN_SEARCH_RADIUS_KM = 5;
const MAX_SEARCH_RADIUS_KM = 50;
const COURSE_LIMIT = 8;
const NOMINATIM_MIN_INTERVAL_MS = 1_000;
let nextNominatimRequestAt = 0;

interface NominatimPlace {
  place_id: number;
  sourceId?: string;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category?: string;
  type?: string;
  address?: Record<string, string>;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function locationName(place: NominatimPlace): string {
  return (
    place.name ||
    place.display_name.split(",")[0]?.trim() ||
    "Selected location"
  );
}

function isGolfCourse(place: NominatimPlace): boolean {
  return (
    place.type === "golf_course" ||
    place.type === "golf" ||
    (place.category === "leisure" && place.type === "golf_course")
  );
}

function searchParams(query: string, limit: number): URLSearchParams {
  // Nominatim is used only after explicit submission, never for keystroke
  // suggestions. Keep the submitted text intact for its place search.
  return new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    "accept-language": nominatimLanguages(),
    limit: String(limit),
  });
}

function nominatimLanguages(): string {
  const browserLanguages =
    typeof navigator !== "undefined" ? navigator.languages : [];
  return [...new Set([...browserLanguages, "sv", "en"])].join(",");
}

function courseAddress(tags: Record<string, string> | undefined, nearby: string): string {
  if (!tags) return `Near ${nearby}`;
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  const locality =
    tags["addr:city"] ??
    tags["addr:town"] ??
    tags["addr:village"] ??
    tags["addr:municipality"] ??
    tags["addr:suburb"] ??
    tags["addr:hamlet"] ??
    tags["addr:place"];
  const address = [
    street,
    tags["addr:postcode"],
    locality,
    tags["addr:state"],
  ].filter(Boolean);
  return address.length ? address.join(", ") : `Near ${nearby}`;
}

export class OpenStreetMapProvider implements CourseDiscoveryProvider {
  async search(
    query: string,
    options?: CourseSearchOptions,
  ): Promise<CourseSearchResult> {
    const params = searchParams(query.trim(), 8);
    await waitForNominatimSlot();
    const places = await fetchJson<NominatimPlace[]>(`${NOMINATIM_URL}?${params}`);
    if (!places.length) {
      throw new Error("We couldn't find that place. Try a nearby town or course name.");
    }

    // Prefer an exact course match when the search was a course name. Otherwise
    // the first well-ranked town/place is the center of the nearby-course search.
    const center = places.find(isGolfCourse) ?? places[0];
    const location: SearchLocation = {
      name: locationName(center),
      latitude: Number(center.lat),
      longitude: Number(center.lon),
      displayName: center.display_name,
    };

    return {
      location,
      courses: await this.nearbyCourses(
        location,
        places.filter(isGolfCourse),
        searchRadiusMeters(options),
      ),
    };
  }

  private async nearbyCourses(
    location: SearchLocation,
    namedMatches: NominatimPlace[],
    radiusMeters: number,
  ): Promise<GolfCourse[]> {
    const query = `[out:json][timeout:20];
(
  nwr(around:${radiusMeters},${location.latitude},${location.longitude})["leisure"="golf_course"];
  nwr(around:${radiusMeters},${location.latitude},${location.longitude})["golf"="course"];
);
out center tags;`;
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: new URLSearchParams({ data: query }),
    });
    if (!response.ok) {
      throw new Error("Course listings are taking a break. Please try again shortly.");
    }
    const data = (await response.json()) as { elements: OverpassElement[] };
    const found = new Map<string, GolfCourse>();

    for (const element of data.elements) {
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      const name = element.tags?.name;
      if (latitude === undefined || longitude === undefined || !name) continue;
      const id = `${element.type}/${element.id}`;
      found.set(id, {
        id,
        name,
        latitude,
        longitude,
        distanceKm: distanceKm(location.latitude, location.longitude, latitude, longitude),
        address: courseAddress(element.tags, location.name),
      });
    }

    // A named course returned by Nominatim can be useful even if Overpass has
    // not indexed it as a golf feature yet.
    for (const place of namedMatches) {
      const latitude = Number(place.lat);
      const longitude = Number(place.lon);
      const id = place.sourceId ?? `nominatim/${place.place_id}`;
      const alreadyListed = [...found.values()].some(
        (course) =>
          course.name.toLocaleLowerCase() === locationName(place).toLocaleLowerCase() ||
          distanceKm(course.latitude, course.longitude, latitude, longitude) < 0.15,
      );
      if (!alreadyListed && !found.has(id)) {
        found.set(id, {
          id,
          name: locationName(place),
          latitude,
          longitude,
          distanceKm: distanceKm(location.latitude, location.longitude, latitude, longitude),
          address: courseAddress(undefined, location.name),
        });
      }
    }

    return [...found.values()]
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, COURSE_LIMIT);
  }
}

function searchRadiusMeters(options?: CourseSearchOptions): number {
  const radiusKm = options?.radiusKm ?? DEFAULT_SEARCH_RADIUS_KM;
  const validRadiusKm = Number.isFinite(radiusKm)
    ? Math.min(MAX_SEARCH_RADIUS_KM, Math.max(MIN_SEARCH_RADIUS_KM, radiusKm))
    : DEFAULT_SEARCH_RADIUS_KM;
  return Math.round(validRadiusKm * 1_000);
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Place search is unavailable right now. Please try again shortly.");
  }
  return (await response.json()) as T;
}

async function waitForNominatimSlot(signal?: AbortSignal): Promise<void> {
  while (true) {
    if (signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
    const wait = nextNominatimRequestAt - Date.now();
    if (wait <= 0) {
      nextNominatimRequestAt = Date.now() + NOMINATIM_MIN_INTERVAL_MS;
      return;
    }
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(new DOMException("The request was aborted.", "AbortError"));
      };
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, wait);
      if (signal?.aborted) {
        onAbort();
      } else {
        signal?.addEventListener("abort", onAbort, { once: true });
      }
    });
  }
}
