import { dateEditorPresentation } from "./dateEditorPresentation";
import { MetadataText } from "./Metadata";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarIcon, CheckIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";

export type DateConfirmationKind = "sell_by" | "use_by" | "best_before" | "user_reminder";

export type DateAssertionDraft = { value: string; kind: DateConfirmationKind | null };

const options: Array<[DateConfirmationKind, string]> = [
  ["sell_by", "유통기한"],
  ["use_by", "소비기한"],
  ["best_before", "품질유지기한"],
  ["user_reminder", "내 알림일"],
];
const DATE_KIND_COLUMNS = 2;

export default function DateAssertionEditor({
  onCancel,
  onConfirm,
  initialValue = "",
  initialKind = null,
  originalKind,
  onDraftChange,
  title = "포장지에서 확인한 날짜",
  description = "",
}: {
  onCancel: () => void;
  onConfirm: (value: string, kind: DateConfirmationKind) => void;
  initialValue?: string;
  initialKind?: DateConfirmationKind | null;
  originalKind?: DateConfirmationKind | null;
  onDraftChange?: (draft: DateAssertionDraft) => void;
  title?: string;
  description?: string;
}) {
  const keyboard = useKeyboard();
  const [value, setValue] = useState(initialValue);
  const [kind, setKind] = useState<DateConfirmationKind | null>(initialKind);
  const originalKindRef = useRef(initialKind);
  useEffect(() => {
    onDraftChange?.({ value, kind });
  }, [value, kind, onDraftChange]);
  const initialKindButtonRef = useRef<HTMLButtonElement | null>(null);
  const firstDateKindButtonRef = useRef<HTMLButtonElement | null>(null);
  const dateKindButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const activeElement = document.activeElement;
      const canTakeFocus = activeElement === document.body
        || activeElement === document.documentElement
        || (activeElement instanceof HTMLElement && (activeElement.classList.contains("sheet-close-button") || activeElement.classList.contains("bottom-sheet")))
        || !activeElement?.isConnected;
      if (!canTakeFocus) return;
      (initialKindButtonRef.current ?? firstDateKindButtonRef.current)?.focus({ preventScroll: true });
    }, 120);
    return () => window.clearTimeout(timer);
  }, []);

  const readableDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `선택한 날짜 · ${value.replaceAll("-", ".")}` : "";
  const presentation = dateEditorPresentation(kind, value, title, description, originalKind !== undefined ? originalKind : originalKindRef.current);

  const handleDateKindKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp", "End", "Home"].includes(event.key)) return;
    event.preventDefault();
    const rowStart = Math.floor(currentIndex / DATE_KIND_COLUMNS) * DATE_KIND_COLUMNS;
    const column = currentIndex % DATE_KIND_COLUMNS;
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : event.key === "ArrowRight"
          ? rowStart + ((column + 1) % DATE_KIND_COLUMNS)
          : event.key === "ArrowLeft"
            ? rowStart + ((column - 1 + DATE_KIND_COLUMNS) % DATE_KIND_COLUMNS)
            : event.key === "ArrowDown"
              ? (currentIndex + DATE_KIND_COLUMNS) % options.length
              : (currentIndex - DATE_KIND_COLUMNS + options.length) % options.length;
    const [nextKind] = options[nextIndex];
    setKind(nextKind);
    window.requestAnimationFrame(() => dateKindButtonRefs.current[nextIndex]?.focus({ preventScroll: true }));
  };

  const confirmDate = () => {
    if (!value || !kind) return;
    onConfirm(value, kind);
  };

  return (
    <div className="date-editor" role="group" aria-label="확인한 날짜 입력">
      <div className="date-editor-heading">
        <CalendarIcon width={17} height={17} />
        <span><strong>{presentation.title}</strong>{presentation.description ? <small>{presentation.description}</small> : null}</span>
      </div>
      <div className="date-kind-picker" role="radiogroup" aria-label="날짜 종류" aria-describedby={!kind ? "date-kind-selection-hint" : undefined}>
        {options.map(([option, label], index) => {
          const active = kind === option;
          return <button
            ref={(element) => {
              dateKindButtonRefs.current[index] = element;
              if (index === 0) firstDateKindButtonRef.current = element;
              if (active) initialKindButtonRef.current = element;
            }}
            key={option}
            className={active ? "date-kind-active" : ""}
            style={active
              ? { borderColor: "var(--atelier-pistachio)", background: "var(--meal-blue-soft)", color: "var(--atelier-pistachio)" }
              : { borderColor: "var(--atelier-border)", background: "var(--atelier-surface)", color: "var(--atelier-muted)" }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!kind && index === 0) ? 0 : -1}
            onKeyDown={(event) => handleDateKindKeyDown(event, index)}
            onClick={() => setKind(option)}
          >{active ? <CheckIcon width={12} height={12} /> : null}{label}</button>;
        })}
      </div>
      {!kind ? <small id="date-kind-selection-hint" className="date-kind-selection-hint" role="note">포장지에 적힌 날짜 이름을 그대로 골라 주세요. 확실하지 않으면 소비기한으로 짐작하지 않아도 돼요.</small> : null}
      <label className="date-input-label" htmlFor="confirmed-date-input">날짜</label>
      <KeyboardInput
        id="confirmed-date-input"
        className="app-input date-input"
        type="date"
        value={value}
        aria-describedby={readableDate ? "confirmed-date-readable" : undefined}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => keyboard.hide()}
      />
      {readableDate ? <small id="confirmed-date-readable" className="date-input-readable"><MetadataText text={readableDate} /></small> : null}
      <div className="date-editor-actions">
        <button className="secondary-sheet-button" type="button" onClick={onCancel}>취소</button>
        <button
          className="primary-sheet-button"
          type="button"
          aria-describedby={presentation.saveHint ? "date-editor-save-hint" : undefined}
          disabled={!value || !kind}
          onPointerDown={(event) => event.preventDefault()}
          onClick={confirmDate}
        >{presentation.saveLabel}</button>
      </div>
      {presentation.saveHint ? <p id="date-editor-save-hint" className="date-editor-footnote" role="status" aria-live="polite">{presentation.saveHint}</p> : null}
    </div>
  );
}
