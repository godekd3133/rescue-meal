export function getMobileScrollBehavior(): ScrollBehavior {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function revealAndFocus(target: HTMLElement | null, { block = "nearest", behavior = getMobileScrollBehavior() }: { block?: ScrollLogicalPosition; behavior?: ScrollBehavior } = {}) {
  if (!target) return false;
  target.scrollIntoView({ behavior, block });
  target.focus({ preventScroll: true });
  return true;
}
