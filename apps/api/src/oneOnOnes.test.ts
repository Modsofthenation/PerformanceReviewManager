import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSuggestedQuestions } from "../src/oneOnOnes.js";

describe("parseSuggestedQuestions", () => {
  it("parses a JSON array of strings", () => {
    const qs = parseSuggestedQuestions(`Here you go:\n["How is capacity?", "What blocked [ach_1]?"]\n`);
    assert.deepEqual(qs, ["How is capacity?", "What blocked [ach_1]?"]);
  });

  it("parses objects with question fields", () => {
    const qs = parseSuggestedQuestions(
      JSON.stringify([{ question: "What went well last sprint?" }, { question: "Any risks?" }]),
    );
    assert.deepEqual(qs, ["What went well last sprint?", "Any risks?"]);
  });

  it("falls back to numbered lines with question marks", () => {
    const qs = parseSuggestedQuestions(`1. How are you feeling about goals?\n2. What support do you need?\nNote: thin evidence`);
    assert.equal(qs.length, 2);
    assert.match(qs[0], /feeling about goals/);
  });

  it("returns empty for blank input", () => {
    assert.deepEqual(parseSuggestedQuestions("   "), []);
  });
});
