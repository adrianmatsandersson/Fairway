import { describe, expect, it } from "vitest";
import {
  getClockInputOptions,
  getClockInputParts,
  updateClockInputValue,
} from "./clockInput";

describe("canonical time input conversion", () => {
  it("provides the exact hour ranges and period control for each format", () => {
    const twentyFourHourOptions = getClockInputOptions("24h");
    expect(twentyFourHourOptions.hours).toEqual(
      Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")),
    );
    expect(twentyFourHourOptions.showPeriod).toBe(false);

    const twelveHourOptions = getClockInputOptions("12h");
    expect(twelveHourOptions.hours).toEqual(
      Array.from({ length: 12 }, (_, hour) => String(hour + 1)),
    );
    expect(twelveHourOptions.showPeriod).toBe(true);
  });

  it("exposes canonical times in the selected clock format", () => {
    expect(getClockInputParts("00:05", "12h")).toEqual({
      hour: "12",
      minute: "05",
      period: "AM",
    });
    expect(getClockInputParts("12:30", "12h")).toEqual({
      hour: "12",
      minute: "30",
      period: "PM",
    });
    expect(getClockInputParts("23:59", "12h")).toEqual({
      hour: "11",
      minute: "59",
      period: "PM",
    });
    expect(getClockInputParts("23:59", "24h")).toEqual({
      hour: "23",
      minute: "59",
      period: "",
    });
  });

  it("converts 12-hour choices to canonical 24-hour values", () => {
    expect(updateClockInputValue("", "12h", "hour", "12")).toBe("00:00");
    expect(updateClockInputValue("00:00", "12h", "period", "PM")).toBe("12:00");
    expect(updateClockInputValue("12:00", "12h", "hour", "1")).toBe("13:00");
    expect(updateClockInputValue("13:00", "12h", "minute", "45")).toBe("13:45");
  });

  it("converts the 24-hour boundary choices directly to canonical values", () => {
    expect(updateClockInputValue("", "24h", "hour", "00")).toBe("00:00");
    expect(updateClockInputValue("00:00", "24h", "hour", "23")).toBe("23:00");
  });

  it("preserves the selected time when changing clock formats", () => {
    const selectedTime = "21:07";
    const twelveHourParts = getClockInputParts(selectedTime, "12h");

    expect(twelveHourParts).toEqual({ hour: "9", minute: "07", period: "PM" });
    expect(getClockInputParts(selectedTime, "24h")).toEqual({
      hour: "21",
      minute: "07",
      period: "",
    });
    expect(getClockInputParts(selectedTime, "12h")).toEqual(twelveHourParts);
    expect(updateClockInputValue(selectedTime, "24h", "hour", "21")).toBe(selectedTime);
  });

  it("leaves a blank optional time blank until a choice is made", () => {
    expect(getClockInputParts("", "24h")).toEqual({ hour: "", minute: "", period: "" });
    expect(updateClockInputValue("", "24h", "minute", "30")).toBe("00:30");
  });

  it("rejects values outside the selected mode's hour range", () => {
    expect(updateClockInputValue("12:00", "24h", "hour", "24")).toBe("12:00");
    expect(updateClockInputValue("12:00", "12h", "hour", "0")).toBe("12:00");
    expect(updateClockInputValue("12:00", "12h", "hour", "13")).toBe("12:00");
    expect(updateClockInputValue("12:00", "24h", "minute", "60")).toBe("12:00");
  });
});
