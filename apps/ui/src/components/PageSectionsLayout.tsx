import type { ReactNode } from "react";
import { PageSectionNav, type SectionNavItem } from "./PageSectionNav";

/** Sticky right-rail (or top chips on phone) for long multi-section pages. */
export function PageSectionsLayout({
  sections,
  children,
  ariaLabel = "On this page",
}: {
  sections: SectionNavItem[];
  children: ReactNode;
  ariaLabel?: string;
}) {
  if (sections.length < 2) {
    return <div className="stack">{children}</div>;
  }
  return (
    <div className="page-sections-layout">
      <div className="page-sections-main stack">{children}</div>
      <PageSectionNav items={sections} ariaLabel={ariaLabel} />
    </div>
  );
}

export type { SectionNavItem };
