import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  DEMO_PASSWORD,
  MIN_PASSWORD_LENGTH,
  checkAuthRateLimit,
  clearAuthFailures,
  recordAuthFailure,
  resetAuthRateLimitsForTests,
  validateWorkspacePassword,
} from "./authPolicy.js";

describe("validateWorkspacePassword", () => {
  it("rejects missing / empty passwords (no silent demo default)", () => {
    assert.equal(validateWorkspacePassword(undefined).ok, false);
    assert.equal(validateWorkspacePassword("").ok, false);
    assert.equal(validateWorkspacePassword(null).ok, false);
  });

  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH}`, () => {
    const short = validateWorkspacePassword("short");
    assert.equal(short.ok, false);
  });

  it("accepts demo password and longer secrets", () => {
    const demo = validateWorkspacePassword(DEMO_PASSWORD);
    assert.equal(demo.ok, true);
    if (demo.ok) assert.equal(demo.password, DEMO_PASSWORD);
    const long = validateWorkspacePassword("correct-horse-battery");
    assert.equal(long.ok, true);
  });
});

describe("auth rate limit", () => {
  beforeEach(() => resetAuthRateLimitsForTests());

  it("allows attempts until the failure budget is exhausted", () => {
    const key = "unlock:test";
    for (let i = 0; i < 7; i++) {
      assert.equal(checkAuthRateLimit(key), null);
      recordAuthFailure(key);
    }
    assert.equal(checkAuthRateLimit(key), null);
    recordAuthFailure(key); // 8th → lockout
    const msg = checkAuthRateLimit(key);
    assert.ok(msg && /Too many attempts/.test(msg));
  });

  it("clears lockout after a successful attempt", () => {
    const key = "destroy:test";
    for (let i = 0; i < 8; i++) recordAuthFailure(key);
    assert.ok(checkAuthRateLimit(key));
    clearAuthFailures(key);
    assert.equal(checkAuthRateLimit(key), null);
  });
});
