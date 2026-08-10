import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { NextStep } from "./PageChrome";

type Onboarding = {
  completed: boolean;
  step: string;
  personCount: number;
  cycleCount: number;
  workspaceName: string | null;
};

type StepKey = "team" | "cycle" | "done";

/** Single checklist after empty workspace create until team + first cycle exist. */
export function OnboardingWizard({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const [data, setData] = useState<Onboarding | null>(null);

  async function load() {
    try {
      setData(await api<Onboarding>("/api/onboarding"));
    } catch {
      setData(null);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    onActiveChange?.(Boolean(data && !data.completed));
  }, [data, onActiveChange]);

  if (!data || data.completed) return null;

  const step: StepKey =
    data.personCount === 0 ? "team" : data.cycleCount === 0 ? "cycle" : "done";

  const steps = [
    { key: "team" as const, label: "Add your team", done: data.personCount > 0 },
    { key: "cycle" as const, label: "Open a review cycle", done: data.cycleCount > 0 },
    { key: "done" as const, label: "Assign roles & write", done: step === "done" },
  ];

  return (
    <div className="panel stack" style={{ gap: "0.75rem" }}>
      <div>
        <h2 style={{ margin: 0 }}>Get set up</h2>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Three steps — then Home becomes your review command center.
        </p>
      </div>
      <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
        {steps.map((s) => (
          <li
            key={s.key}
            style={{
              marginBottom: "0.35rem",
              color: s.done ? "var(--ok)" : s.key === step ? "var(--fg)" : "var(--muted)",
              fontWeight: s.key === step ? 600 : 400,
            }}
          >
            {s.done ? "✓ " : s.key === step ? "→ " : ""}
            {s.label}
          </li>
        ))}
      </ol>

      {step === "team" && (
        <NextStep
          tone="brand"
          label={data.personCount === 0 ? "Add yourself and your directs" : "Add your directs"}
          detail="On Team: add directs (you may already be EM). Roles from the PE Engineering Career Framework are already loaded — assign each person on Roles, then open a cycle."
          action={
            <>
              <Link className="btn" to="/team">
                Open team
              </Link>
              <button
                type="button"
                className="btn ghost"
                onClick={async () => {
                  await api("/api/workspace/settings", {
                    method: "PUT",
                    body: JSON.stringify({ onboarding: { completed: true, step: "skipped" } }),
                  });
                  setData({ ...data, completed: true });
                }}
              >
                Skip for now
              </button>
            </>
          }
        />
      )}

      {step === "cycle" && (
        <NextStep
          tone="brand"
          label="Open your first review cycle"
          detail={`${data.personCount} people on the roster. Create a cycle window, then export self-review bundles from Cycles.`}
          action={
            <>
              <Link className="btn" to="/cycles">
                Create cycle
              </Link>
              <Link className="btn secondary" to="/team">
                Edit team
              </Link>
            </>
          }
        />
      )}

      {step === "done" && (
        <NextStep
          tone="ok"
          label="Ready to write"
          detail="Assign any missing roles, then use Home as your pipeline. You can re-open this checklist anytime by clearing onboarding in workspace settings."
          action={
            <button
              type="button"
              className="btn"
              onClick={async () => {
                await api("/api/workspace/settings", {
                  method: "PUT",
                  body: JSON.stringify({ onboarding: { completed: true, step: "done" } }),
                });
                setData({ ...data, completed: true });
              }}
            >
              Go to command center
            </button>
          }
        />
      )}
    </div>
  );
}
