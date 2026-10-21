import { afterEach, describe, expect, it, vi } from "vitest";
import { PhotonSuggestionProvider } from "./photonSuggestions";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PhotonSuggestionProvider", () => {
  it("sends partial input unchanged and returns suggestions without searching courses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            geometry: { type: "Point", coordinates: [14.69, 57.65] },
            properties: {
              osm_id: 12345,
              osm_key: "place",
              osm_value: "town",
              name: "Nässjö",
              postcode: "571 00",
              city: "Nässjö",
              state: "Jönköping County",
              country: "Sweden",
            },
          },
          {
            geometry: { type: "Point", coordinates: [14.7, 57.66] },
            properties: {
              osm_id: 12346,
              osm_key: "leisure",
              osm_value: "golf_course",
              name: "Nässjö Golfklubb",
              city: "Nässjö",
              country: "Sweden",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const suggestions = await new PhotonSuggestionProvider().suggest("Nässj");

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.hostname).toBe("photon.komoot.io");
    expect(requestUrl.searchParams.get("q")).toBe("Nässj");
    expect(requestUrl.searchParams.get("lang")).toBe("default");
    expect(suggestions).toEqual([
      {
        placeId: 12345,
        name: "Nässjö",
        latitude: 57.65,
        longitude: 14.69,
        displayName: "Nässjö, 571 00, Jönköping County, Sweden",
        kind: "location",
      },
      {
        placeId: 12346,
        name: "Nässjö Golfklubb",
        latitude: 57.66,
        longitude: 14.7,
        displayName: "Nässjö Golfklubb, Nässjö, Sweden",
        kind: "course",
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses cached results for repeated queries and keeps the original partial query result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [{
          geometry: { type: "Point", coordinates: [14.69, 57.65] },
          properties: { osm_id: 22345, name: "Nässjö", country: "Sweden" },
        }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new PhotonSuggestionProvider();
    const first = await provider.suggest("Nässjö");
    const cached = await provider.suggest("nässjö");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached).toEqual(first);
  });
});
