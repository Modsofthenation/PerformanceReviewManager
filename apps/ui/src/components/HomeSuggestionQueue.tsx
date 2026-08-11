import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import type { HomeSuggestion } from "../lib/homeSuggestions";
import { NextStep } from "./PageChrome";

function SuggestionLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  if (href.startsWith("#")) {
    return (
      <a className={className} href={href}>
        {children}
      </a>
    );
  }
  return (
    <Link className={className} to={href}>
      {children}
    </Link>
  );
}

/** Primary NextStep + remaining “up next” queue that shrinks as work completes. */
export function HomeSuggestionQueue({
  suggestions,
  refreshing,
  onRefresh,
}: {
  suggestions: HomeSuggestion[];
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  if (suggestions.length === 0) return null;
  const [primary, ...rest] = suggestions;

  return (
    <div className="stack home-suggestions" style={{ gap: "0.75rem" }}>
      <NextStep
        tone={primary.tone}
        label={primary.title}
        detail={primary.detail}
        action={
          <>
            <SuggestionLink className="btn" href={primary.href}>
              {primary.cta}
            </SuggestionLink>
            {primary.secondaryHref && primary.secondaryCta ? (
              <SuggestionLink className="btn secondary" href={primary.secondaryHref}>
                {primary.secondaryCta}
              </SuggestionLink>
            ) : null}
            {onRefresh ? (
              <button type="button" className="btn ghost" disabled={refreshing} onClick={onRefresh}>
                {refreshing ? "Updating…" : "Refresh"}
              </button>
            ) : null}
          </>
        }
      />

      {rest.length > 0 ? (
        <div className="panel home-up-next" aria-label="Suggested next actions">
          <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: "1rem" }}>Up next</h2>
            <span className="muted" style={{ fontSize: "0.82rem" }}>
              {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"} · updates as you clear work
            </span>
          </div>
          <ol className="home-up-next-list">
            {rest.map((s, idx) => (
              <li key={s.id} className={`home-up-next-item home-up-next-item-${s.tone}`}>
                <div className="home-up-next-copy">
                  <div className="home-up-next-title">
                    <span className="muted">{idx + 2}.</span> {s.title}
                  </div>
                  <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                    {s.detail}
                  </p>
                </div>
                <div className="home-up-next-actions">
                  <SuggestionLink className="btn secondary" href={s.href}>
                    {s.cta}
                  </SuggestionLink>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
