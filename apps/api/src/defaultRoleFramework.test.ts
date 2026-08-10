import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_ROLE_FRAMEWORK } from "../src/defaultRoleFramework.js";

describe("default PE role framework pack", () => {
  it("includes IC and management ladder from the PE chart", () => {
    const keys = DEFAULT_ROLE_FRAMEWORK.roles.map((r) => r.key);
    assert.deepEqual(keys, [
      "eng_ic1",
      "eng_ic2",
      "eng_ic3",
      "eng_ic4",
      "eng_ic5",
      "eng_ic6",
      "eng_l1",
      "eng_m1",
      "eng_m2",
      "eng_m3",
    ]);
    assert.equal(DEFAULT_ROLE_FRAMEWORK.roles.find((r) => r.key === "eng_ic1")?.title, "Graduate Developer");
    assert.equal(DEFAULT_ROLE_FRAMEWORK.roles.find((r) => r.key === "eng_m3")?.title, "Chief Technical Officer (CTO)");
  });

  it("wires progression next keys and fills responsibilities + expectations", () => {
    const byKey = Object.fromEntries(DEFAULT_ROLE_FRAMEWORK.roles.map((r) => [r.key, r]));
    assert.deepEqual(byKey.eng_ic1.next, ["eng_ic2"]);
    assert.deepEqual(byKey.eng_ic4.next, ["eng_ic5", "eng_l1"]);
    assert.deepEqual(byKey.eng_l1.next, ["eng_m1"]);
    assert.deepEqual(byKey.eng_m2.next, ["eng_m3"]);
    for (const role of DEFAULT_ROLE_FRAMEWORK.roles) {
      assert.ok(role.summary.length > 40, role.key);
      assert.ok(role.expectations.some((e) => e.kind === "responsibility"), role.key);
      assert.ok(role.expectations.some((e) => e.kind === "expectation"), role.key);
      for (const next of role.next) {
        assert.ok(byKey[next], `${role.key} → missing ${next}`);
      }
    }
  });
});
