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

/** Shown after empty workspace create until team + first cycle exist (or dismissed). */
export function OnboardingWizard() {
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

  if (!data || data.completed) return null;

  const step = data.personCount === 0 ? "team" : data.cycleCount === 0 ? "cycle" : "roles";

  if (step === "team") {
    return (
      <NextStep
        tone="brand"
        label="Set up your empty workspace"
        detail="1) Add yourself as EM on Team, 2) add directs, 3) assign roles, 4) open a cycle. Demo seed was skipped."
        action={
          <>
            <Link className="btn" to="/team">
              Add people
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
              Dismiss
            </button>
          </>
        }
      />
    );
  }

  if (step === "cycle") {
    return (
      <NextStep
        tone="brand"
        label="Open your first review cycle"
        detail="People are on the roster. Create a cycle window, then export self-review bundles from Cycles."
        action={
          <>
            <Link className="btn" to="/cycles">
              Create cycle
            </Link>
            <Link className="btn secondary" to="/roles">
              Assign roles
            </Link>
          </>
        }
      />
    );
  }

  return (
    <NextStep
      tone="ok"
      label="Workspace ready"
      detail="Team and cycle exist. Assign any missing roles, then write from Home."
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
          Mark setup complete
        </button>
      }
    />
  );
}
