import { useEffect, useRef, useState } from "react";
import { CalendarIcon, CheckIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";

export type DateConfirmationKind = "sell_by" | "use_by" | "best_before" | "user_reminder";

const options: Array<[DateConfirmationKind, string]> = [
  ["sell_by", "유통기한"],
  ["use_by", "소비기한"],
  ["best_before", "품질유지기한"],
  ["user_reminder", "내 알림일"],
];

export default function DateAssertionEditor({ onCancel, onConfirm, initialValue = "", initialKind = "use_by", title = "포장지에서 확인한 날짜", description = "날짜의 의미까지 선택하면 기록이 더 정확해요." }: { onCancel: () => void; onConfirm: (value: string, kind: DateConfirmationKind) => void; initialValue?: string; initialKind?: DateConfirmationKind; title?: string; description?: string }) {
  const keyboard = useKeyboard();
  const [value, setValue] = useState(initialValue);
  const [kind, setKind] = useState<DateConfirmationKind>(initialKind);
  const initialKindButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const activeElement = document.activeElement;
      const canTakeFocus = activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && (activeElement.classList.contains("sheet-close-button") || activeElement.classList.contains("bottom-sheet")))
        || !activeElement?.isConnected;
      if (!canTakeFocus) return;
      initialKindButtonRef.current?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  const readableDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `선택한 날짜 · ${value.replaceAll("-", ".")}` : "날짜를 선택해 주세요";

  return <div className="date-editor" role="group" aria-label="확인한 날짜 입력"><div className="date-editor-heading"><CalendarIcon width={17} height={17} /><span><strong>{title}</strong><small>{description}</small></span></div><div className="date-kind-picker" role="group" aria-label="날짜 종류">{options.map(([option, label]) => { const active = kind === option; return <button ref={active ? initialKindButtonRef : undefined} key={option} className={active ? "date-kind-active" : ""} style={active ? { borderColor: "var(--atelier-pistachio)", background: "var(--meal-blue-soft)", color: "var(--atelier-pistachio)" } : { borderColor: "var(--atelier-border)", background: "var(--atelier-surface)", color: "var(--atelier-muted)" }} type="button" aria-pressed={active} onClick={() => setKind(option)}>{active ? <CheckIcon width={12} height={12} /> : null}{label}</button>; })}</div><label className="date-input-label" htmlFor="confirmed-date-input">날짜</label><KeyboardInput id="confirmed-date-input" className="app-input date-input" type="date" value={value} aria-describedby="confirmed-date-readable" onChange={(event) => setValue(event.target.value)} onBlur={() => keyboard.hide()} /><small id="confirmed-date-readable" className="date-input-readable">{readableDate}</small><div className="date-editor-actions"><button className="secondary-sheet-button" type="button" onClick={onCancel}>취소</button><button className="primary-sheet-button" type="button" disabled={!value} onPointerDown={(event) => event.preventDefault()} onClick={() => onConfirm(value, kind)}>확인 후 저장</button></div><p className="date-editor-footnote">이 기록은 자동 판정이 아니라 직접 확인한 출처로 저장돼요.</p></div>;
}
