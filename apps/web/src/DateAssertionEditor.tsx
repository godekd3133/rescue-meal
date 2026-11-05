import { dateEditorPresentation } from "./dateEditorPresentation";
import { MetadataText } from "./Metadata";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { CalendarIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { formatKoreanDate } from "./koreanDate";
import "./koreanDateField.css";
import "./dateAssertionEditor.css";

export { formatKoreanDate };

export type DateConfirmationKind = "sell_by" | "use_by" | "best_before" | "user_reminder";

export type DateAssertionDraft = { value: string; kind: DateConfirmationKind | null };

export const DATE_CONFIRMATION_OPTIONS: Array<[DateConfirmationKind, string]> = [
  ["sell_by", "유통기한"],
  ["use_by", "소비기한"],
  ["best_before", "품질유지기한"],
  ["user_reminder", "내 알림일"],
];
const options = DATE_CONFIRMATION_OPTIONS;
const DATE_KIND_COLUMNS = 2;
/**
 * A date field that reads in the app's Korean style instead of the OS locale format.
 * The native date input stays on top (transparent) so the platform picker, form
 * filling and assistive technology keep working; the visible text is Korean.
 */
export function KoreanDateField({
  id,
  value,
  onChange,
  ariaLabel,
  ariaDescribedBy,
  placeholder = "날짜 선택",
  className = "",
  onFocus,
}: {
  id?: string;
  /** ISO `YYYY-MM-DD` or "" */
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  placeholder?: string;
  className?: string;
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void;
}) {
  const keyboard = useKeyboard();
  const display = formatKoreanDate(value);
  return (
    <span className={`korean-date-field${display ? "" : " korean-date-field-empty"} ${className}`.trim()}>
      <span className="korean-date-field-display" aria-hidden="true"><CalendarIcon width={16} height={16} /><span>{display || placeholder}</span></span>
      <KeyboardInput
        id={id}
        className="korean-date-field-input"
        type="date"
        value={value}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => {
          try { (event.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* picker unavailable */ }
        }}
        onFocus={(event) => {
          // A date uses the platform picker, not the simulated text keyboard.
          keyboard.hide();
          onFocus?.(event);
        }}
        onBlur={() => keyboard.hide()}
      />
    </span>
  );
}

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

  const readableDate = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `선택한 날짜 · ${formatKoreanDate(value)}` : "";
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
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (!kind && index === 0) ? 0 : -1}
            onKeyDown={(event) => handleDateKindKeyDown(event, index)}
            onClick={() => setKind(option)}
          >{label}</button>;
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
