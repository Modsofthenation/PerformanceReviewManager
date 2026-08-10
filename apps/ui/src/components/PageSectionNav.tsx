import { useEffect, useState } from "react";

export type SectionNavItem = {
  id: string;
  label: string;
};

/**
 * Sticky “On this page” links. Active state is click/hash driven only —
 * no IntersectionObserver scroll-spy (that was a major source of scroll jank
 * on long pages, especially in WebView).
 */
export function PageSectionNav({
  items,
  ariaLabel = "On this page",
}: {
  items: SectionNavItem[];
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const sectionKey = items.map((item) => item.id).join("|");

  useEffect(() => {
    const ids = sectionKey.split("|").filter(Boolean);
    const fromHash = window.location.hash.replace(/^#/, "");
    if (fromHash && ids.includes(fromHash)) {
      setActiveId(fromHash);
      return;
    }
    if (ids[0]) setActiveId(ids[0]);
  }, [sectionKey]);

  useEffect(() => {
    const ids = new Set(sectionKey.split("|").filter(Boolean));
    const onHash = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id && ids.has(id)) setActiveId(id);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [sectionKey]);

  function goTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Update hash without fighting smooth scroll (replaceState avoids hashchange jump).
    const url = `${window.location.pathname}${window.location.search}#${id}`;
    window.history.replaceState(null, "", url);
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <nav className="page-section-nav" aria-label={ariaLabel}>
      <div className="page-section-nav-label">{ariaLabel}</div>
      <ul className="page-section-nav-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`page-section-nav-link${activeId === item.id ? " on" : ""}`}
              aria-current={activeId === item.id ? "true" : undefined}
              onClick={() => goTo(item.id)}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
