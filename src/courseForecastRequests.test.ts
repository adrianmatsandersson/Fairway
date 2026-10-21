import { describe, expect, it, vi } from "vitest";
import { CourseForecastRequests } from "./courseForecastRequests";

describe("CourseForecastRequests", () => {
  it("shares concurrent visibility and refresh requests for one course", async () => {
    const requests = new CourseForecastRequests<string>();
    let resolveRequest!: (value: string) => void;
    const fetchForecast = vi.fn(
      () => new Promise<string>((resolve) => { resolveRequest = resolve; }),
    );

    const visible = requests.run("course/1", fetchForecast);
    const refreshed = requests.run("course/1", fetchForecast);
    expect(refreshed).toBe(visible);

    await Promise.resolve();
    expect(fetchForecast).toHaveBeenCalledTimes(1);
    resolveRequest("forecast");
    await expect(visible).resolves.toBe("forecast");
  });

  it("keeps courses independent and permits a retry after failure", async () => {
    const requests = new CourseForecastRequests<string>();
    const failedRequest = vi.fn().mockRejectedValueOnce(new Error("offline"));

    await expect(requests.run("course/1", failedRequest)).rejects.toThrow("offline");
    await expect(requests.run("course/1", () => Promise.resolve("retry"))).resolves.toBe("retry");
    await expect(requests.run("course/2", () => Promise.resolve("other"))).resolves.toBe("other");
    expect(failedRequest).toHaveBeenCalledTimes(1);
  });

  it("does not let an old request clear a newer request after reset", async () => {
    const requests = new CourseForecastRequests<string>();
    let resolveOld!: (value: string) => void;
    let resolveNew!: (value: string) => void;
    const oldRequest = requests.run(
      "course/1",
      () => new Promise<string>((resolve) => { resolveOld = resolve; }),
    );
    await Promise.resolve();

    requests.clear();
    const newRequest = requests.run(
      "course/1",
      () => new Promise<string>((resolve) => { resolveNew = resolve; }),
    );
    await Promise.resolve();
    resolveOld("old");
    await oldRequest;
    expect(requests.run("course/1", () => Promise.resolve("duplicate"))).toBe(newRequest);
    resolveNew("new");
    await expect(newRequest).resolves.toBe("new");
  });
});
