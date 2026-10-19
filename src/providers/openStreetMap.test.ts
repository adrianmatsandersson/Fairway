import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenStreetMapProvider } from "./openStreetMap";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenStreetMapProvider course searches", () => {
  it("submits explicit place searches to Nominatim and loads nearby courses from Overpass", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            place_id: 304,
            lat: "57.65",
            lon: "14.69",
            name: "Nässjö",
            display_name: "Nässjö, Sweden",
            type: "town",
          },
        ],
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ elements: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenStreetMapProvider().search("Nässjö", { radiusKm: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const nominatimUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(nominatimUrl.hostname).toBe("nominatim.openstreetmap.org");
    expect(nominatimUrl.searchParams.get("q")).toBe("Nässjö");
    expect(String(fetchMock.mock.calls[1][0])).toContain("overpass-api.de");
    const overpassBody = fetchMock.mock.calls[1][1]?.body as URLSearchParams;
    expect(overpassBody.get("data")).toContain("around:5000,57.65,14.69");
    expect(result.location.name).toBe("Nässjö");
    expect(result.location.displayName).toBe("Nässjö, Sweden");
  });

  it("uses OSM address tags and a nearby-town fallback for course locations", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{
          place_id: 405,
          lat: "57.65",
          lon: "14.69",
          name: "Nässjö",
          display_name: "Nässjö, Sweden",
          type: "town",
        }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: "way",
              id: 401,
              center: { lat: 57.66, lon: 14.7 },
              tags: {
                name: "Nässjö Golfklubb",
                "addr:street": "Golfvägen",
                "addr:postcode": "571 00",
                "addr:town": "Nässjö",
              },
            },
            {
              type: "node",
              id: 402,
              lat: 57.67,
              lon: 14.71,
              tags: { name: "Forest Golf Club" },
            },
          ],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenStreetMapProvider().search("Nässjö");

    expect(result.courses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Nässjö Golfklubb",
          address: "Golfvägen, 571 00, Nässjö",
        }),
        expect.objectContaining({
          name: "Forest Golf Club",
          address: "Near Nässjö",
        }),
      ]),
    );
  });
});
