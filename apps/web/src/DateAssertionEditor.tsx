import { useState } from "react";
import { CalendarIcon, CheckIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";

export type DateConfirmationKind = "sell_by" | "use_by" | "best_before" | "user_reminder";

const options: Array<[DateConfirmationKind, string]> = [
  ["sell_by", "유통기한"],
  ["use_by", "소비기한"],
  ["best_before", "품질유지기한"],
  ["user_reminder", "내 알림일"],
];

export default function DateAssertionEditor({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (value: string, kind: DateConfirmationKind) => void }) {
  const keyboard = useKeyboard();
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<DateConfirmationKind>("use_by");

  return <div className="date-editor" role="group" aria-label="확인한 날짜 입력"><div className="date-editor-heading"><CalendarIcon width={17} height={17} /><span><strong>포장지에서 확인한 날짜</strong><small>날짜의 의미까지 선택하면 기록이 더 정확해요.</small></span></div><div className="date-kind-picker" role="group" aria-label="날짜 종류">{options.map(([option, label]) => <button key={option} className={kind === option ? "date-kind-active" : ""} type="button" aria-pressed={kind === option} onClick={() => setKind(option)}>{kind === option ? <CheckIcon width={12} height={12} /> : null}{label}</button>)}</div><label className="date-input-label" htmlFor="confirmed-date-input">날짜</label><KeyboardInput id="confirmed-date-input" className="app-input date-input" type="date" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => keyboard.hide()} /><div className="date-editor-actions"><button className="secondary-sheet-button" type="button" onClick={onCancel}>취소</button><button className="primary-sheet-button" type="button" disabled={!value} onPointerDown={(event) => event.preventDefault()} onClick={() => onConfirm(value, kind)}>확인 후 저장</button></div><p className="date-editor-footnote">이 기록은 자동 판정이 아니라 사장님이 확인한 출처로 저장돼요.</p></div>;
}
