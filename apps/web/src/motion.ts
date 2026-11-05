/**
 * Motion is on for people, off for automated browsers (UI suites measure settled layout;
 * tests/motion.spec.ts turns it back on) and for reduced motion. motion.css keys every
 * rule off html[data-motion="on"].
 */
export const MOTION_ON = typeof navigator !== "undefined" && !navigator.webdriver;
if (MOTION_ON && typeof document !== "undefined") document.documentElement.dataset.motion = "on";

export const prefersReducedMotion = () => !MOTION_ON || (typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));
