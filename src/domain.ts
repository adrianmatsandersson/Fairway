export interface SearchLocation {
  name: string;
  latitude: number;
  longitude: number;
  displayName: string;
}

export interface GolfCourse {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  address?: string;
}

export interface CourseSearchResult {
  location: SearchLocation;
  courses: GolfCourse[];
}

export interface CourseSearchOptions {
  radiusKm: number;
}

export interface LocationSuggestion extends SearchLocation {
  placeId: number;
  kind: "location" | "course";
}

export interface HourlyWeather {
  time: string;
  temperatureC: number;
  precipitationProbability: number;
  windSpeedKmh: number;
  weatherCode: number;
}

export interface CourseForecast {
  timezone: string;
  current: HourlyWeather;
  hours: HourlyWeather[];
}

/** A missing dateTime means current conditions; supplied values are absolute ISO instants. */
export interface ForecastQuery {
  latitude: number;
  longitude: number;
  /** ISO 8601 instant selected in the viewer's device timezone. */
  dateTime?: string;
}

export interface CourseDiscoveryProvider {
  search(query: string, options?: CourseSearchOptions): Promise<CourseSearchResult>;
}

export interface SuggestionProvider {
  suggest(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]>;
}

export interface WeatherProvider {
  forecast(query: ForecastQuery): Promise<CourseForecast>;
}

export function distanceKm(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(latitudeB - latitudeA);
  const longitudeDelta = radians(longitudeB - longitudeA);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitudeA)) *
      Math.cos(radians(latitudeB)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
