import type { ReactNode } from "react";

/**
 * Presents sheet content (식단, 장보기) as a full tab screen inside the tab's MobileScroll.
 *
 * The wrapper keeps the `bottom-sheet` / `sheet-content` classes so the shared sheet visual
 * system and `.closest(".sheet-content")` lookups keep resolving, while `tab-sheet-screen`
 * (screens.css) removes the sheet's own positioning, shadow and inner scrolling: the
 * MobileScroll around it owns scrolling. It is a labelled region, not a dialog.
 */
export function TabSheetScreen({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`bottom-sheet tab-sheet-screen${className ? ` ${className}` : ""}`} role="region" aria-label={title} data-tab-sheet-screen="">
      <div className="sheet-content">{children}</div>
    </section>
  );
}
