import { useEffect, useRef, useState } from "react";

export type SectionNavItem = {
  id: string;
  label: string;
};

/**
 * Sticky “On this page” links with active-section highlighting.
 * Scroll tracking avoids layout thrashing: use IntersectionObserver entry
 * geometry only, coalesce updates to animation frames, and skip no-op sets.
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
  const clickLockUntil = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const first = sectionKey.split("|")[0];
    if (first) setActiveId(first);
  }, [sectionKey]);

  useEffect(() => {
    const ids = sectionKey.split("|").filter(Boolean);
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (nodes.length === 0) return;

    const ratios = new Map<string, number>();
    const tops = new Map<string, number>();
    let raf = 0;

    const commit = () => {
      raf = 0;
      if (Date.now() < clickLockUntil.current) return;

      const ordered = itemsRef.current;
      let bestId = "";
      let bestRatio = 0;
      for (const item of ordered) {
        const ratio = ratios.get(item.id) ?? 0;
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = item.id;
        }
      }
      if (bestId && bestRatio > 0.02) {
        setActiveId((prev) => (prev === bestId ? prev : bestId));
        return;
      }

      let aboveId = "";
      let aboveTop = -Infinity;
      for (const item of ordered) {
        const top = tops.get(item.id);
        if (top == null) continue;
        if (top <= 140 && top >= aboveTop) {
          aboveTop = top;
          aboveId = item.id;
        }
      }
      if (aboveId) setActiveId((prev) => (prev === aboveId ? prev : aboveId));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = entry.target.id;
          ratios.set(id, entry.isIntersecting ? entry.intersectionRatio : 0);
          // Prefer observer-provided rect — do not call getBoundingClientRect (forces layout).
          tops.set(id, entry.boundingClientRect.top);
        }
        if (!raf) raf = requestAnimationFrame(commit);
      },
      {
        root: null,
        rootMargin: "-10% 0px -55% 0px",
        // Fewer thresholds → fewer callbacks while scrolling.
        threshold: [0, 0.25, 0.6, 1],
      },
    );

    for (const node of nodes) observer.observe(node);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [sectionKey]);

  function goTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    clickLockUntil.current = Date.now() + 700;
    setActiveId(id);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
