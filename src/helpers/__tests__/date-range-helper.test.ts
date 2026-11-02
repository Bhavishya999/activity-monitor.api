import { describe, expect, it } from "vitest";
import { BadRequestException } from "../../exceptions/bad-request-exception.js";
import { addDays, resolveDateRange, startOfLocalDay } from "../date-range-helper.js";

const IST = "Asia/Kolkata";

describe("startOfLocalDay", () => {
  it("IST midnight is 18:30 UTC the previous day", () => {
    expect(startOfLocalDay("2026-10-06", IST).toISOString()).toBe("2026-10-05T18:30:00.000Z");
  });
  it("respects daylight saving changes (New York)", () => {
    expect(startOfLocalDay("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z");
    expect(startOfLocalDay("2026-12-01", "America/New_York").toISOString()).toBe("2026-12-01T05:00:00.000Z");
  });
});

describe("resolveDateRange", () => {
  // 02:00 IST on Oct 6 is still Oct 5 in UTC: "today" must follow the report timezone.
  const now = new Date("2026-10-05T20:30:00Z");

  it("today follows the timezone, not UTC", () => {
    const r = resolveDateRange({ preset: "today", from: null, to: null, timezone: IST, now });
    expect(r.startDate).toBe("2026-10-06");
    expect(r.start.toISOString()).toBe("2026-10-05T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-06T18:30:00.000Z");
  });
  it("yesterday and last7 span whole local days", () => {
    expect(resolveDateRange({ preset: "yesterday", from: null, to: null, timezone: IST, now }).startDate).toBe("2026-10-05");
    const last7 = resolveDateRange({ preset: "last7", from: null, to: null, timezone: IST, now });
    expect([last7.startDate, last7.endDate]).toEqual(["2026-09-30", "2026-10-06"]);
  });
  it("custom ranges are inclusive of the end day", () => {
    const r = resolveDateRange({ preset: "custom", from: "2026-10-05", to: "2026-10-06", timezone: IST });
    expect(r.end.toISOString()).toBe("2026-10-06T18:30:00.000Z");
  });
  it.each([
    { from: null, to: null }, { from: "2026-10-06", to: "2026-10-05" }, { from: "2025-01-01", to: "2026-10-05" },
  ])("rejects bad custom range %o", ({ from, to }) => {
    expect(() => resolveDateRange({ preset: "custom", from, to, timezone: IST })).toThrow(BadRequestException);
  });
  it("rejects unknown time zones", () => {
    expect(() => resolveDateRange({ preset: "today", from: null, to: null, timezone: "Mars/Base" })).toThrow(BadRequestException);
  });
});

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
