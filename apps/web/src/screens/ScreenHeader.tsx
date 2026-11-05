import type { ReactNode } from "react";

/** Top row of the 냉장고 / 식단 / 장보기 tabs: the tab's name and the shared bell + 나 actions. */
export function ScreenHeader({ id, title, actions }: { id: string; title: string; actions: ReactNode }) {
  return (
    <header className="app-header screen-header">
      <h1 id={id} className="screen-title">{title}</h1>
      {actions}
    </header>
  );
}
