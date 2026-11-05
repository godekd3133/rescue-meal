import { getMobileScrollBehavior } from "./mobile/scroll";

export type AppScrollBlock = "start" | "center" | "end" | "nearest";

export function targetScrollTop(container: HTMLElement, target: HTMLElement, block: AppScrollBlock, topInset = 0) {
  const containerRect = container.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const scaleY = container.clientHeight > 0 && containerRect.height > 0
    ? containerRect.height / container.clientHeight
    : 1;
  const targetTop = container.scrollTop + (targetRect.top - containerRect.top) / scaleY;
  const targetHeight = targetRect.height / scaleY;
  const targetBottom = targetTop + targetHeight;

  if (block === "start") return targetTop - topInset;
  if (block === "center") return targetTop - (container.clientHeight - targetHeight) / 2;
  if (block === "end") return targetBottom - container.clientHeight;
  // A pinned header inside the container declares its height through the target's scroll-margin-top.
  const marginTop = typeof window !== "undefined" && typeof window.getComputedStyle === "function"
    ? Number.parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0
    : 0;
  if (targetRect.top < containerRect.top + marginTop * scaleY) return targetTop - marginTop;
  if (targetRect.bottom > containerRect.bottom) return targetBottom - container.clientHeight;
  return container.scrollTop;
}

export function scrollTargetWithinContainer(
  container: HTMLElement,
  target: HTMLElement,
  block: AppScrollBlock,
  behavior: ScrollBehavior,
  topInset = 0,
) {
  const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, targetScrollTop(container, target, block, topInset)));
  container.scrollTo({ top: nextScrollTop, behavior });
}

export function scrollTargetWithinNearestContainer(
  target: HTMLElement | null,
  block: AppScrollBlock,
  behavior: ScrollBehavior,
) {
  if (!target) return false;
  let container = target.parentElement;
  while (container && container !== document.body && container !== document.documentElement) {
    const overflowY = window.getComputedStyle(container).overflowY;
    if (["auto", "scroll", "overlay"].includes(overflowY) && container.scrollHeight > container.clientHeight + 1) {
      scrollTargetWithinContainer(container, target, block, behavior);
      return true;
    }
    container = container.parentElement;
  }
  return false;
}

export function revealAndFocusWithinNearestContainer(
  target: HTMLElement | null,
  { block = "nearest", behavior = getMobileScrollBehavior() }: { block?: AppScrollBlock; behavior?: ScrollBehavior } = {},
) {
  if (!target) return false;
  scrollTargetWithinNearestContainer(target, block, behavior);
  target.focus({ preventScroll: true });
  return true;
}

/**
 * The element that actually scrolls `target`: a sheet's `.sheet-content`, or the tab's
 * MobileScroll when sheet content is presented as a full tab screen.
 */
export function nearestScrollContainer(target: HTMLElement | null) {
  let container = target?.parentElement ?? null;
  while (container && container !== document.body && container !== document.documentElement) {
    const overflowY = window.getComputedStyle(container).overflowY;
    if (["auto", "scroll", "overlay"].includes(overflowY)) return container;
    container = container.parentElement;
  }
  return null;
}
