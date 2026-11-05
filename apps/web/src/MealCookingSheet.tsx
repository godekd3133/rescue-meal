import { useRef, type ReactNode } from "react";
import { useDrag } from "@use-gesture/react";
import { BottomSheet } from "./mobile";

export type CookingStep = { text: string; stage?: string | null; heat?: string | null; minutes?: number | null };
export type CookingPage = number | "confirm";

/**
 * 요리 모드: one step per screen in a near-full-height sheet, large type, swipe or 이전/다음.
 * The last step ends with 다 만들었어요, which turns the same sheet into the amount check
 * (`children`) so the deduction confirmation is never skipped.
 */
export function MealCookingSheet({ open, onOpenChange, title, steps, page, onPageChange, onFinish, children }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  steps: CookingStep[];
  page: CookingPage;
  onPageChange: (page: CookingPage) => void;
  onFinish: () => void;
  children: ReactNode;
}) {
  // Only a step change moves; opening the sheet keeps the runtime spring alone.
  const directionRef = useRef<"forward" | "back" | null>(null);
  if (!open) directionRef.current = null;
  const index = page === "confirm" ? steps.length : Math.min(page, Math.max(0, steps.length - 1));
  const last = index >= steps.length - 1;
  const go = (next: number) => {
    if (next < 0 || next >= steps.length) return;
    directionRef.current = next > index ? "forward" : "back";
    onPageChange(next);
  };
  const advance = () => (last ? onFinish() : go(index + 1));

  const bindSwipe = useDrag(({ last: released, movement: [mx], velocity: [vx], direction: [dx] }) => {
    if (!released || page === "confirm") return;
    if (mx < -56 || (vx > 0.5 && dx < 0)) advance();
    else if (mx > 56 || (vx > 0.5 && dx > 0)) go(index - 1);
  }, { axis: "x", filterTaps: true });

  const step = page === "confirm" ? null : steps[index];
  return (
    <BottomSheet open={open} onOpenChange={onOpenChange} title={title} snap={0.94}>
      <div className="cook-mode" data-page={page === "confirm" ? "confirm" : "step"} onKeyDown={(event) => {
        if (page === "confirm" || event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowRight") { event.preventDefault(); advance(); }
        if (event.key === "ArrowLeft") { event.preventDefault(); go(index - 1); }
      }}>
        {steps.length ? <div className="cook-progress" role="img" aria-label={page === "confirm" ? "조리 순서를 마쳤어요" : `${steps.length}단계 중 ${index + 1}단계`}>
          {steps.map((_, position) => <span key={position} data-state={page === "confirm" || position < index ? "done" : position === index ? "current" : "next"} />)}
        </div> : null}
        {step ? <>
          <div key={index} className="cook-step" data-direction={directionRef.current ?? undefined} {...bindSwipe()}>
            <p className="cook-step-count" aria-live="polite"><strong>{index + 1}</strong><span>/ {steps.length}</span></p>
            {step.stage || step.heat || step.minutes ? <ul className="cook-step-facts" aria-label="불과 시간">
              {step.stage ? <li>{step.stage}</li> : null}
              {step.heat ? <li>{step.heat}</li> : null}
              {step.minutes ? <li>{step.minutes}분</li> : null}
            </ul> : null}
            <p className="cook-step-text">{step.text}</p>
          </div>
          <div className="cook-nav">
            <button className="meal-quiet-button cook-back" type="button" disabled={index === 0} onClick={() => go(index - 1)}>이전</button>
            <button className="meal-primary-button cook-next" type="button" onClick={advance}>{last ? "다 만들었어요" : "다음"}</button>
          </div>
        </> : <div className="cook-confirm">{children}</div>}
      </div>
    </BottomSheet>
  );
}
