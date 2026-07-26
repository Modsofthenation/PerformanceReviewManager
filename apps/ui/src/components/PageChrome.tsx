import type { ReactNode } from "react";

/** Page title + one-line job, with optional primary/secondary actions. */
export function PageHeader({
  title,
  job,
  primary,
  secondary,
}: {
  title: string;
  job: string;
  primary?: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        <p className="page-job">{job}</p>
      </div>
      {(primary || secondary) && (
        <div className="page-header-actions">
          {secondary}
          {primary}
        </div>
      )}
    </div>
  );
}

/** State-driven next step — one clear action the EM should take now. */
export function NextStep({
  label,
  detail,
  action,
  tone = "brand",
}: {
  label: string;
  detail: string;
  action?: ReactNode;
  tone?: "brand" | "warn" | "ok";
}) {
  return (
    <div className={`next-step next-step-${tone}`}>
      <div className="next-step-copy">
        <div className="next-step-label">{label}</div>
        <p>{detail}</p>
      </div>
      {action != null ? <div className="next-step-action">{action}</div> : null}
    </div>
  );
}
