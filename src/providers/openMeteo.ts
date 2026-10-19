import type { CourseForecast, ForecastQuery, HourlyWeather, WeatherProvider } from "../domain";
import {
  formatLocalDateTime,
  parseIsoInstant,
} from "../forecastTime";

interface OpenMeteoResponse {
  timezone?: string;
  current?: {
    time?: string;
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
  hourly?: {
    time?: string[];
    temperature_2m?: number[];
    precipitation_probability?: number[];
    wind_speed_10m?: number[];
    weather_code?: number[];
  };
}

const FORECAST_DAYS = 16;
// Current conditions can be sampled between hourly forecast timestamps. Keep
// their hourly context to the same local day and within one hour of the sample.
const MAX_CURRENT_HOUR_DIFFERENCE_MINUTES = 60;

export class OpenMeteoProvider implements WeatherProvider {
  async forecast(query: ForecastQuery): Promise<CourseForecast> {
    const targetEpoch = query.dateTime ? parseIsoInstant(query.dateTime) : undefined;
    if (query.dateTime && targetEpoch === undefined) {
      throw new Error("Enter a valid forecast instant.");
    }
    const params = new URLSearchParams({
      latitude: String(query.latitude),
      longitude: String(query.longitude),
      current: "temperature_2m,precipitation,wind_speed_10m,weather_code",
      hourly: "temperature_2m,precipitation_probability,wind_speed_10m,weather_code",
      timezone: "auto",
      forecast_days: String(targetEpoch !== undefined ? FORECAST_DAYS : 2),
    });

    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!response.ok) {
      throw new Error("Weather is temporarily unavailable for this course.");
    }
    const data = (await response.json()) as OpenMeteoResponse;
    const timezone = data.timezone;
    const hourly = data.hourly;
    const hours = hourly?.time;
    if (!timezone || !hourly || !hours?.length) {
      throw new Error("The weather provider returned no course timezone or hourly forecast.");
    }

    if (targetEpoch !== undefined) {
      // Convert the shared instant to this course's timezone before matching
      // Open-Meteo's timezone-local hourly timestamps.
      const courseLocalDateTime = formatLocalDateTime(new Date(targetEpoch), timezone);
      // Select the nearest hourly value on the requested local calendar day;
      // ties resolve forward. Never fall through to another date or index zero.
      const index = nearestForecastHour(hours, courseLocalDateTime);
      if (index < 0) {
        throw new Error(
          `No forecast hour is available on ${courseLocalDateTime.slice(0, 10)} in ${timezone}. ` +
            `Open-Meteo forecasts are limited to ${FORECAST_DAYS} days ahead.`,
        );
      }
      return {
        timezone,
        current: hourlyWeatherAt(hourly, index),
        hours: nextHours(hourly, index),
      };
    }

    const current = data.current;
    if (!current) throw new Error("The weather provider did not return current conditions.");
    const currentTime = current.time;
    if (!currentTime || localTimestampMillis(currentTime) === undefined) {
      throw new Error("The weather provider returned an invalid current timestamp.");
    }
    const currentIndex = nearestForecastHour(
      hours,
      currentTime,
      MAX_CURRENT_HOUR_DIFFERENCE_MINUTES,
    );
    if (currentIndex < 0) {
      throw new Error(
        `No hourly forecast is available within ${MAX_CURRENT_HOUR_DIFFERENCE_MINUTES} minutes ` +
          `of current time ${currentTime} on the same course-local date.`,
      );
    }
    const currentWeather = toCurrentWeather(current, hourly, currentIndex);
    return {
      timezone,
      current: currentWeather,
      hours: nextHours(hourly, currentIndex),
    };
  }
}

function nearestForecastHour(
  hours: string[],
  target: string,
  maximumDifferenceMinutes = Number.POSITIVE_INFINITY,
): number {
  const targetDate = target.slice(0, 10);
  const targetMillis = localTimestampMillis(target);
  if (targetMillis === undefined) return -1;
  let bestIndex = -1;
  let bestDifference = Number.POSITIVE_INFINITY;
  hours.forEach((hour, index) => {
    if (hour.slice(0, 10) !== targetDate) return;
    const hourMillis = localTimestampMillis(hour);
    if (hourMillis === undefined) return;
    const difference = Math.abs(hourMillis - targetMillis);
    const bestHourMillis =
      bestIndex >= 0 ? localTimestampMillis(hours[bestIndex]) ?? Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
    if (difference > maximumDifferenceMinutes * 60_000) return;
    if (difference < bestDifference || (difference === bestDifference && hourMillis > bestHourMillis)) {
      bestIndex = index;
      bestDifference = difference;
    }
  });
  return bestIndex;
}

/** Parses a timezone-free course-local wall-clock timestamp as a comparable number. */
function localTimestampMillis(value: string): number | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match.map(Number);
  const millis = Date.UTC(year, month - 1, day, hour, minute);
  const parsed = new Date(millis);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute
  ) {
    return undefined;
  }
  return millis;
}

function toCurrentWeather(
  current: NonNullable<OpenMeteoResponse["current"]>,
  hourly: NonNullable<OpenMeteoResponse["hourly"]>,
  index: number,
): HourlyWeather {
  const precipitationProbability = hourly.precipitation_probability?.[index];
  if (precipitationProbability === undefined) {
    throw new Error("The weather provider omitted current precipitation probability.");
  }
  return {
    time: requiredString(current.time, "current time"),
    temperatureC: requiredNumber(current.temperature_2m, "current temperature"),
    precipitationProbability: requiredNumber(precipitationProbability, "precipitation probability"),
    windSpeedKmh: requiredNumber(current.wind_speed_10m, "current wind speed"),
    weatherCode: requiredNumber(current.weather_code, "current weather code"),
  };
}

function hourlyWeatherAt(
  hourly: NonNullable<OpenMeteoResponse["hourly"]>,
  index: number,
): HourlyWeather {
  const time = hourly.time?.[index];
  if (!time) throw new Error("The weather provider omitted the requested forecast time.");
  return {
    time,
    temperatureC: requiredNumber(hourly.temperature_2m?.[index], "hourly temperature"),
    precipitationProbability: requiredNumber(
      hourly.precipitation_probability?.[index],
      "hourly precipitation probability",
    ),
    windSpeedKmh: requiredNumber(hourly.wind_speed_10m?.[index], "hourly wind speed"),
    weatherCode: requiredNumber(hourly.weather_code?.[index], "hourly weather code"),
  };
}

function nextHours(
  hourly: NonNullable<OpenMeteoResponse["hourly"]>,
  start: number,
): HourlyWeather[] {
  const times = hourly.time ?? [];
  const remainingHours = times.length - start;
  if (remainingHours <= 0) throw new Error("No hourly forecast is available for the selected time.");
  return Array.from({ length: Math.min(6, remainingHours) }, (_, offset) =>
    hourlyWeatherAt(hourly, start + offset),
  );
}

function requiredNumber(value: number | undefined, label: string): number {
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`The weather provider omitted ${label}.`);
  }
  return value;
}

function requiredString(value: string | undefined, label: string): string {
  if (!value) throw new Error(`The weather provider omitted ${label}.`);
  return value;
}
