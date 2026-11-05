import { Fragment, useEffect, useRef, useState } from "react";

/**
 * Letter-by-letter entrance for display copy. Each visible character is its own
 * inline span carrying `--i` (its order) so motion.css can stagger it; spaces stay
 * plain text so wrapping and the accessible name are unchanged. With reduced
 * motion the spans are inert and the text reads exactly as before.
 */
export default function RevealText({ text, delay = 0, step = 28 }: { text: string; delay?: number; step?: number }) {
  let order = 0;
  return (
    <span className="reveal-text" style={{ "--reveal-delay": `${delay}ms`, "--reveal-step": `${step}ms` } as React.CSSProperties}>
      {Array.from(text).map((char, index) => {
        if (char === " ") return <Fragment key={index}> </Fragment>;
        const i = order++;
        return <span key={index} className="reveal-char" style={{ "--i": i } as React.CSSProperties}>{char}</span>;
      })}
    </span>
  );
}

/**
 * Entrance motion is on for people, off for automated browsers (UI suites measure
 * settled layout; tests/motion.spec.ts turns it back on) and for reduced motion.
 * motion.css keys every rule off html[data-motion="on"].
 */
export const MOTION_ON = typeof navigator !== "undefined" && !navigator.webdriver;
if (MOTION_ON && typeof document !== "undefined") document.documentElement.dataset.motion = "on";

export const prefersReducedMotion = () => !MOTION_ON || (typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches));

/**
 * A number that counts up to `value` (from 0 on mount, from the previous value on
 * change). Reduced motion shows the final number immediately. Keep the real value in
 * the surrounding accessible name; the ticking digits are decoration.
 */
export function CountUp({ value, delay = 520, duration = 720 }: { value: number; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? value : 0));
  const fromRef = useRef(shown);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); fromRef.current = value; return undefined; }
    const from = fromRef.current;
    if (from === value) return undefined;
    let frame = 0;
    const startAt = performance.now() + (from === 0 ? delay : 0);
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - startAt) / duration));
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from + (value - from) * eased);
      fromRef.current = next;
      setShown(next);
      if (t < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [value, delay, duration]);
  return <>{shown}</>;
}
