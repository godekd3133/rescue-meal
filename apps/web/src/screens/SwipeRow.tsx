import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import "../quickActions.css";

const DRAG_THRESHOLD = 8;
const COMMIT_RIGHT = 88;
const ACTION_WIDTH = 72;
const LONG_PRESS_MS = 550;

type Session = {
  pointerId: number;
  startX: number;
  startY: number;
  startOffset: number;
  dragged: boolean;
  captured: boolean;
};

export type SwipeRowActions = {
  /** Swipe right. For a food with a date question this is the date check, never an "ate" record. */
  primary: { label: string; tone: "ate" | "check"; run: () => void };
  /** Long-press, "…" menu: the existing amount flow. */
  partial: { label: string; run: () => void };
  /** Revealed by swiping left. */
  discard: { run: () => void };
  freeze?: { run: () => void };
};

/**
 * A 냉장고 row that can be swiped: right records the primary action, left reveals
 * 버림 / 냉동. Everything a swipe does is also in the visible "…" menu, which is a
 * real menu reachable by keyboard and screen reader.
 *
 * Gesture contract (AGENTS.md): no `data-scroll-drag="ignore"`. Like `Carousel`, the
 * row only claims a drag once it clears tap slop horizontally; a vertical drag is
 * left to the parent MobileScroll. A drag never becomes a tap.
 */
export function SwipeRow({ foodName, actions, disabled = false, children }: {
  foodName: string;
  actions: SwipeRowActions;
  disabled?: boolean;
  children: ReactNode;
}) {
  const revealWidth = ACTION_WIDTH * (actions.freeze ? 2 : 1);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const suppressClickRef = useRef(false);
  const longPressTimerRef = useRef<number | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const open = offset < 0 && !dragging;

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  useEffect(() => clearLongPress, []);

  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus({ preventScroll: true });
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && (offset >= 0 || dragging)) return undefined;
    // An open menu or revealed row closes when the person touches anything else.
    const close = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setMenuOpen(false);
      setOffset(0);
    };
    document.addEventListener("pointerdown", close, true);
    return () => document.removeEventListener("pointerdown", close, true);
  }, [menuOpen, offset, dragging]);

  const run = (action: () => void) => {
    setOffset(0);
    setMenuOpen(false);
    action();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || (event.pointerType === "mouse" && event.button !== 0)) return;
    if ((event.target as Element).closest(".swipe-row-actions, .swipe-row-more, .swipe-row-menu")) return;
    sessionRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startOffset: offset, dragged: false, captured: false };
    clearLongPress();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      const session = sessionRef.current;
      if (!session || session.dragged) return;
      sessionRef.current = null;
      suppressClickRef.current = true;
      run(actions.partial.run);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.startX;
    const dy = event.clientY - session.startY;
    if (!session.dragged) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_THRESHOLD) return;
      clearLongPress();
      if (Math.abs(dy) >= Math.abs(dx)) {
        // Vertical won: let MobileScroll scroll and handle release.
        sessionRef.current = null;
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      session.captured = true;
      session.dragged = true;
      setDragging(true);
    }
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    const next = session.startOffset + dx;
    setOffset(Math.max(-revealWidth - 24, Math.min(COMMIT_RIGHT + 32, next)));
  };

  const finish = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearLongPress();
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    sessionRef.current = null;
    if (session.captured && event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!session.dragged) return;
    setDragging(false);
    const final = session.startOffset + (event.clientX - session.startX);
    if (event.type === "pointerup" && final >= COMMIT_RIGHT) {
      run(actions.primary.run);
      return;
    }
    setOffset(final <= -revealWidth / 2 ? -revealWidth : 0);
  };

  const onClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // While actions are revealed, a tap on the row closes them instead of opening the food.
    if (offset < 0 && !target.closest(".swipe-row-actions, .swipe-row-more, .swipe-row-menu")) {
      event.preventDefault();
      event.stopPropagation();
      setOffset(0);
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(index + step + items.length) % items.length]?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    }
  };

  const menuItem = (label: string, action: () => void, tone?: string) => (
    <button className={`swipe-row-menu-item${tone ? ` swipe-row-menu-item-${tone}` : ""}`} type="button" role="menuitem" tabIndex={-1} onClick={() => { run(action); }}>{label}</button>
  );

  return (
    <div
      ref={rootRef}
      className="swipe-row"
      data-swipe-state={dragging ? "dragging" : open ? "open" : "closed"}
      data-swipe-tone={offset > 0 ? actions.primary.tone : offset < 0 ? "reveal" : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={onClickCapture}
    >
      <div className="swipe-row-under swipe-row-under-primary" aria-hidden="true">
        <span>{actions.primary.label}</span>
      </div>
      <div className="swipe-row-actions" aria-hidden={!open} style={{ width: revealWidth }}>
        {actions.freeze ? <button className="swipe-row-action swipe-row-action-freeze" type="button" tabIndex={open ? 0 : -1} aria-label={`${foodName} 냉동 보관하기`} onClick={() => run(actions.freeze!.run)}>냉동</button> : null}
        <button className="swipe-row-action swipe-row-action-discard" type="button" tabIndex={open ? 0 : -1} aria-label={`${foodName} 버린 기록 남기기`} onClick={() => run(actions.discard.run)}>버림</button>
      </div>
      {/* While dragging the row slides; once revealed it narrows instead, so the photo and name stay readable beside 버림 / 냉동. */}
      <div className="swipe-row-front" style={open ? { width: `calc(100% - ${revealWidth}px)` } : { transform: offset ? `translate3d(${offset}px, 0, 0)` : undefined }}>
        {children}
        <button
          ref={menuButtonRef}
          className="swipe-row-more"
          type="button"
          // The name stays "기록 메뉴" so it never competes with the row's own food name;
          // the food is announced as its description.
          aria-label="기록 메뉴"
          aria-describedby={`${menuId}-food`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          disabled={disabled}
          onClick={() => { setOffset(0); setMenuOpen((current) => !current); }}
        >
          <DotsHorizontalIcon width={18} height={18} aria-hidden="true" />
        </button>
      </div>
      <span id={`${menuId}-food`} hidden>{foodName}</span>
      {menuOpen ? (
        <div ref={menuRef} id={menuId} className="swipe-row-menu" role="menu" aria-label={`${foodName} 기록`} onKeyDown={onMenuKeyDown}>
          {menuItem(actions.primary.label, actions.primary.run, actions.primary.tone)}
          {menuItem(actions.partial.label, actions.partial.run)}
          {actions.freeze ? menuItem("냉동 보관", actions.freeze.run) : null}
          {menuItem("버림", actions.discard.run, "discard")}
        </div>
      ) : null}
    </div>
  );
}
