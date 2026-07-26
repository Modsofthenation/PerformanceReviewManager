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
    <header className="page-header">
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
    </header>
  );
}

/**
 * Scannable page section: clear heading, when/how copy, and an optional CTA.
 * Keep `id` stable for sticky “On this page” anchors.
 */
export function Section({
  id,
  title,
  when,
  how,
  action,
  children,
  className = "",
}: {
  id: string;
  title: string;
  /** When to open this section (one short sentence). */
  when: string;
  /** How to use it (one short sentence). */
  how: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const titleId = `${id}-heading`;
  return (
    <section
      id={id}
      className={`panel stack page-section settings-section section-block ${className}`.trim()}
      aria-labelledby={titleId}
    >
      <header className="section-header">
        <div className="section-header-copy">
          <h2 id={titleId}>{title}</h2>
          <dl className="section-guide">
            <div>
              <dt>When</dt>
              <dd>{when}</dd>
            </div>
            <div>
              <dt>How</dt>
              <dd>{how}</dd>
            </div>
          </dl>
        </div>
        {action != null ? <div className="section-header-actions">{action}</div> : null}
      </header>
      {children ? <div className="section-body">{children}</div> : null}
    </section>
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
    <div className={`next-step next-step-${tone}`} role="status" aria-live="polite">
      <div className="next-step-copy">
        <div className="next-step-label">{label}</div>
        <p>{detail}</p>
      </div>
      {action != null ? <div className="next-step-action">{action}</div> : null}
    </div>
  );
}
