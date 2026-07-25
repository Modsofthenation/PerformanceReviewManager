import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseExtractedRolesJson,
  parseFrameworkTextLocal,
  slugifyRoleKey,
  textFromUpload,
} from "../src/roleFramework.js";

describe("role framework local parse", () => {
  it("parses markdown headings and bullets", () => {
    const roles = parseFrameworkTextLocal(`# IC3 — Software Engineer
Delivers scoped features with guidance.

## Responsibilities
- Implements features within a squad
- Writes tests

## Expectations
- Escalates blockers promptly

# IC4 — Senior Software Engineer
Owns multi-sprint outcomes.

### Responsibilities
- Leads design for medium projects
`);
    assert.equal(roles.length, 2);
    assert.equal(roles[0]!.levelKey, "IC3");
    assert.equal(roles[0]!.title, "Software Engineer");
    assert.ok(roles[0]!.expectations.length >= 2);
    assert.equal(roles[1]!.levelKey, "IC4");
    assert.deepEqual(roles[0]!.nextRoleKeys, [roles[1]!.key]);
  });

  it("parses CSV rows", () => {
    const roles = parseFrameworkTextLocal(
      "level,title,track,summary\nIC3,Software Engineer,ic,Ships features\nM1,Engineering Manager,manager,Leads a team\n",
    );
    assert.equal(roles.length, 2);
    assert.equal(roles[1]!.track, "manager");
    assert.equal(roles[1]!.levelKey, "M1");
  });

  it("slugifies keys", () => {
    assert.equal(slugifyRoleKey("Senior Software Engineer", "IC4"), "ic4_senior_software_engineer");
  });
});

describe("AI JSON parse", () => {
  it("accepts fenced JSON object", () => {
    const roles = parseExtractedRolesJson(`Here you go:
\`\`\`json
{"roles":[{"title":"Staff Engineer","levelKey":"IC5","track":"ic","expectations":[{"kind":"expectation","text":"Sets technical direction"}]}]}
\`\`\``);
    assert.equal(roles.length, 1);
    assert.equal(roles[0]!.levelKey, "IC5");
    assert.equal(roles[0]!.expectations[0]!.kind, "expectation");
  });
});

describe("upload text", () => {
  it("reads markdown bytes", () => {
    const t = textFromUpload(Buffer.from("# Hello\n- item\n"), "fw.md");
    assert.match(t, /Hello/);
  });
});
