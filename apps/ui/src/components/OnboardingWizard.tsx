import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { OnboardingStateDTO } from "@prm/shared";
import { api } from "../lib/api";
import { NextStep } from "./PageChrome";

/** Compact resume card when setup was left incomplete (should rarely show — App gates to /setup). */
export function OnboardingWizard({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const [data, setData] = useState<OnboardingStateDTO | null>(null);

  async function load() {
    try {
      setData(await api<OnboardingStateDTO>("/api/onboarding"));
    } catch {
      setData(null);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    onActiveChange?.(Boolean(data && !data.completed));
  }, [data, onActiveChange]);

  if (!data || data.completed) return null;

  return (
    <div className="panel stack" style={{ gap: "0.75rem" }}>
      <div>
        <h2 style={{ margin: 0 }}>Finish workspace setup</h2>
        <p className="muted" style={{ margin: "0.35rem 0 0" }}>
          Team, roles, optional AI & integrations, then evidence backfill.
        </p>
      </div>
      <NextStep
        tone="brand"
        label={`Resume at “${data.step}”`}
        detail={`${data.directCount} directs · ${data.unassignedRoleCount} need roles · ${data.thinEvidenceCount} thin dossiers`}
        action={
          <>
            <Link className="btn" to="/setup">
              Open setup
            </Link>
            <button
              type="button"
              className="btn ghost"
              onClick={async () => {
                await api("/api/onboarding", {
                  method: "PUT",
                  body: JSON.stringify({ completed: true, step: "done" }),
                });
                setData({ ...data, completed: true });
              }}
            >
              Skip for now
            </button>
          </>
        }
      />
    </div>
  );
}
