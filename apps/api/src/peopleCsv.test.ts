import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parsePeopleCsv, splitCsvLine } from "../src/peopleCsv.js";
import { hashActivityEvent, verifyEventChain } from "../src/store.js";

describe("people CSV", () => {
  it("parses header aliases and quoted commas", () => {
    const rows = parsePeopleCsv(
      'full_name,mail,job_title,level,start_date\n"Chen, Maya",maya@example.com,Senior Engineer,IC4,2024-03-01\n',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.name, "Chen, Maya");
    assert.equal(rows[0]!.email, "maya@example.com");
    assert.equal(rows[0]!.title, "Senior Engineer");
    assert.equal(rows[0]!.levelKey, "IC4");
    assert.equal(rows[0]!.hireDate, "2024-03-01");
  });

  it("requires a name column", () => {
    assert.throws(() => parsePeopleCsv("email\na@b.com\n"), /name column/);
  });

  it("splits escaped quotes", () => {
    assert.deepEqual(splitCsvLine('"a""b",c'), ['a"b', "c"]);
  });
});

describe("activity chain", () => {
  it("accepts a valid linked chain", () => {
    const t0 = "2026-01-01T00:00:00.000Z";
    const t1 = "2026-01-01T00:00:01.000Z";
    const e0 = {
      id: "act_1",
      action: "person.create",
      entityType: "person",
      entityId: "p1",
      detailJson: JSON.stringify({ name: "A" }),
      prevHash: "genesis",
      hash: "",
      createdAt: t0,
    };
    e0.hash = hashActivityEvent(e0);
    const e1 = {
      id: "act_2",
      action: "person.create",
      entityType: "person",
      entityId: "p2",
      detailJson: JSON.stringify({ name: "B" }),
      prevHash: e0.hash,
      hash: "",
      createdAt: t1,
    };
    e1.hash = hashActivityEvent(e1);
    const result = verifyEventChain([e0, e1], e1.hash);
    assert.equal(result.ok, true);
    assert.equal(result.count, 2);
    assert.equal(result.tipHash, e1.hash);
  });

  it("detects tampered payload", () => {
    const row = {
      id: "act_1",
      action: "person.create",
      entityType: "person",
      entityId: "p1",
      detailJson: JSON.stringify({ name: "A" }),
      prevHash: "genesis",
      hash: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    row.hash = hashActivityEvent(row);
    const tampered = { ...row, detailJson: JSON.stringify({ name: "EVIL" }) };
    const result = verifyEventChain([tampered], row.hash);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /hash mismatch/);
  });

  it("orders same-timestamp events by hash links not id", () => {
    const t = "2026-01-01T00:00:00.000Z";
    const mk = (id: string, action: string, prevHash: string) => {
      const row = {
        id,
        action,
        entityType: "person" as string | null,
        entityId: "p",
        detailJson: JSON.stringify({ id }),
        prevHash,
        hash: "",
        createdAt: t,
      };
      row.hash = hashActivityEvent(row);
      return row;
    };
    // ids sort as act_z before act_a alphabetically, but chain is a→z
    const a = mk("act_z_first_id", "a", "genesis");
    const b = mk("act_a_second_id", "b", a.hash);
    const result = verifyEventChain([b, a], b.hash);
    assert.equal(result.ok, true);
    assert.equal(result.tipHash, b.hash);
  });
});
