import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoProvider } from "./openMeteo";

function responseFor(times: string[], currentTime: string) {
  return {
    timezone: "Europe/Stockholm",
    current: {
      time: currentTime,
      temperature_2m: 17,
      precipitation: 0,
      wind_speed_10m: 8,
      weather_code: 1,
    },
    hourly: {
      time: times,
      temperature_2m: times.map((_, index) => 10 + index),
      precipitation_probability: times.map(() => 20),
      wind_speed_10m: times.map(() => 7),
      weather_code: times.map(() => 2),
    },
  };
}

function mockWeather(payload: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoProvider", () => {
  it("selects the nearest course-local hour, resolving an exact tie forward", async () => {
    const times = [
      "2099-06-10T12:00",
      "2099-06-10T13:00",
      "2099-06-10T14:00",
      "2099-06-10T15:00",
      "2099-06-10T16:00",
      "2099-06-10T17:00",
      "2099-06-10T18:00",
    ];
    const fetchMock = mockWeather(responseFor(times, times[0]));
    const forecast = await new OpenMeteoProvider().forecast({
      latitude: 59.3,
      longitude: 18,
      // 10:30Z is 12:30 in Stockholm on this date.
      dateTime: "2099-06-10T10:30:00.000Z",
    });

    expect(forecast.timezone).toBe("Europe/Stockholm");
    expect(forecast.current.time).toBe("2099-06-10T13:00");
    expect(forecast.hours.map(({ time }) => time)).toEqual(times.slice(1, 7));
    expect(forecast.hours).toHaveLength(6);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("forecast_days")).toBe("16");
    expect(url.searchParams.has("start_date")).toBe(false);
  });

  it("selects a closer earlier hour when that is the nearest forecast point", async () => {
    const times = ["2099-06-10T12:00", "2099-06-10T13:00", "2099-06-10T14:00"];
    mockWeather(responseFor(times, times[0]));
    const forecast = await new OpenMeteoProvider().forecast({
      latitude: 59.3,
      longitude: 18,
      // 10:10Z is 12:10 in Stockholm on this date.
      dateTime: "2099-06-10T10:10:00.000Z",
    });

    expect(forecast.current.time).toBe("2099-06-10T12:00");
  });

  it("uses current conditions when the target date and time are omitted", async () => {
    const times = [
      "2099-06-10T12:00",
      "2099-06-10T13:00",
      "2099-06-10T14:00",
      "2099-06-10T15:00",
      "2099-06-10T16:00",
      "2099-06-10T17:00",
      "2099-06-10T18:00",
    ];
    const fetchMock = mockWeather(responseFor(times, times[1]));
    const forecast = await new OpenMeteoProvider().forecast({
      latitude: 59.3,
      longitude: 18,
    });

    expect(forecast.current.time).toBe(times[1]);
    expect(forecast.current.temperatureC).toBe(17);
    expect(forecast.hours[0].time).toBe(times[1]);
    expect(forecast.hours).toHaveLength(6);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.searchParams.get("forecast_days")).toBe("2");
  });

  it("uses current conditions with the nearest same-day hourly probability for a partial hour", async () => {
    const times = ["2099-06-10T09:00", "2099-06-10T10:00"];
    const payload = responseFor(times, "2099-06-10T09:43");
    payload.hourly.precipitation_probability = [25, 75];
    mockWeather(payload);

    const forecast = await new OpenMeteoProvider().forecast({
      latitude: 59.3,
      longitude: 18,
    });

    expect(forecast.current).toEqual({
      time: "2099-06-10T09:43",
      temperatureC: 17,
      precipitationProbability: 75,
      windSpeedKmh: 8,
      weatherCode: 1,
    });
    expect(forecast.hours[0].time).toBe("2099-06-10T10:00");
  });

  it("rejects a current timestamp without a nearby same-day hourly record", async () => {
    mockWeather(responseFor(["2099-06-10T08:00", "2099-06-11T09:00"], "2099-06-10T09:43"));
    await expect(
      new OpenMeteoProvider().forecast({
        latitude: 59.3,
        longitude: 18,
      }),
    ).rejects.toThrow(
      "No hourly forecast is available within 60 minutes of current time 2099-06-10T09:43",
    );
  });

  it("rejects an invalid current timestamp explicitly", async () => {
    const response = responseFor(["2099-06-10T09:00"], "2099-06-10T09:43");
    response.current.time = "2099-02-30T09:43";
    mockWeather(response);

    await expect(
      new OpenMeteoProvider().forecast({
        latitude: 59.3,
        longitude: 18,
      }),
    ).rejects.toThrow("The weather provider returned an invalid current timestamp.");
  });

  it("reports unavailable target times instead of selecting a default hour", async () => {
    mockWeather(responseFor(["2099-06-10T12:00"], "2099-06-10T12:00"));
    await expect(
      new OpenMeteoProvider().forecast({
        latitude: 59.3,
        longitude: 18,
        dateTime: "2099-06-11T10:00:00.000Z",
      }),
    ).rejects.toThrow("No forecast hour is available");
  });

  it("does not reject a valid selected instant just because the forecast request is delayed", async () => {
    const times = [
      "2020-06-10T12:00",
      "2020-06-10T13:00",
      "2020-06-10T14:00",
      "2020-06-10T15:00",
      "2020-06-10T16:00",
      "2020-06-10T17:00",
      "2020-06-10T18:00",
    ];
    mockWeather(responseFor(times, times[0]));
    const forecast = await new OpenMeteoProvider().forecast({
      latitude: 59.3,
      longitude: 18,
      // This valid selection is now in the past, but remains a valid instant.
      dateTime: "2020-06-10T10:30:00.000Z",
    });

    expect(forecast.current.time).toBe("2020-06-10T13:00");
    expect(forecast.hours).toHaveLength(6);
  });

  it("rejects malformed or impossible ISO target instants", async () => {
    await expect(
      new OpenMeteoProvider().forecast({
        latitude: 59.3,
        longitude: 18,
        dateTime: "2020-02-30T10:30:00.000Z",
      }),
    ).rejects.toThrow("Enter a valid forecast instant.");
  });
});
