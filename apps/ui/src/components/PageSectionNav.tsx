import { useEffect, useState } from "react";

export type SectionNavItem = {
  id: string;
  label: string;
};

export function PageSectionNav({
  items,
  ariaLabel = "On this page",
}: {
  items: SectionNavItem[];
  ariaLabel?: string;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const ids = items.map((item) => item.id).join("|");
    const nodes = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (nodes.length === 0) return;

    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          ratios.set(entry.target.id, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        const visible = items
          .map((item) => document.getElementById(item.id))
          .filter((el): el is HTMLElement => Boolean(el))
          .filter((el) => (ratios.get(el.id) ?? 0) > 0.02)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
        if (visible[0]) {
          setActiveId(visible[0].id);
          return;
        }
        const above = nodes
          .filter((n) => n.getBoundingClientRect().top <= 140)
          .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
        if (above) setActiveId(above.id);
      },
      {
        root: null,
        rootMargin: "-12% 0px -60% 0px",
        threshold: [0, 0.1, 0.25, 0.5, 1],
      },
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
    // ids string keeps deps stable when the same section list is reused
  }, [items, items.map((i) => i.id).join("|")]);

  function goTo(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    setActiveId(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
