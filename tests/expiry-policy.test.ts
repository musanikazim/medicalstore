import { test } from "node:test";
import assert from "node:assert/strict";
import {
  businessDate,
  expiryStatus,
  expiryThreshold,
  normalizeExpiry,
} from "../shared/expiry";
test("Karachi business date rolls over at 19:00 UTC", () => {
  assert.equal(businessDate(new Date("2026-11-01T18:59:59Z")), "2026-11-01");
  assert.equal(businessDate(new Date("2026-11-01T19:00:00Z")), "2026-11-02");
});
test("ten-day warnings include the boundary and require acknowledgement only before expiry", () => {
  const cases = [
    ["2026-12-02", 30, "NORMAL", false, false],
    ["2026-11-17", 15, "NORMAL", false, false],
    ["2026-11-12", 10, "SOON", true, false],
    ["2026-11-07", 5, "SOON", true, false],
    ["2026-11-03", 1, "SOON", true, false],
    ["2026-11-02", 0, "TODAY", false, true],
    ["2026-11-01", -1, "EXPIRED", false, true],
  ] as const;
  for (const [date, days, status, requiresAcknowledgement, blocked] of cases) {
    const actual = expiryStatus(date, 10, "2026-11-02");
    assert.equal(actual.days, days);
    assert.equal(actual.status, status);
    assert.equal(actual.requiresAcknowledgement, requiresAcknowledgement);
    assert.equal(actual.blocked, blocked);
  }
});
test("zero-day configuration is retained and invalid dates are blocked", () => {
  assert.equal(expiryThreshold({ expiryDays: 0 }), 0);
  assert.equal(expiryStatus("2026-11-03", 0, "2026-11-02").status, "NORMAL");
  assert.equal(expiryStatus("2026-11-02", 0, "2026-11-02").blocked, true);
  assert.equal(expiryStatus("2026-02-30", 10, "2026-11-02").blocked, true);
});
test("month-only labels normalize to their actual final calendar date", () => {
  assert.equal(normalizeExpiry("2028-02"), "2028-02-29");
  assert.equal(normalizeExpiry("2027-02"), "2027-02-28");
  assert.equal(normalizeExpiry("2026-11"), "2026-11-30");
});
