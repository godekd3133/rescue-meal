import { useEffect, useRef, useState } from "react";
import { ArrowRightIcon, Pencil1Icon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import type { FoodItem } from "./Prototype";
import { revealAndFocusWithinNearestContainer } from "./appScroll";
import { quantityReferenceUnit } from "./quantityReferenceRecovery";

type Reference = { amount: number; unit: "g" | "ml" | "개" };

export function QuantityReferenceEditor({ food, onSave, initiallyEditing = false, returnToMeal = false }: {
  food: FoodItem;
  initiallyEditing?: boolean;
  returnToMeal?: boolean;
  onSave: (id: string, value: Reference | null) => Promise<void>;
}) {
  const keyboard = useKeyboard();
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!initiallyEditing) return;
    const frame = window.requestAnimationFrame(() => revealAndFocusWithinNearestContainer(editorRef.current, { block: "nearest" }));
    return () => window.cancelAnimationFrame(frame);
  }, [initiallyEditing]);
  const actionRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const savingRef = useRef(false);
  const [editing, setEditing] = useState(initiallyEditing);
  const [amount, setAmount] = useState(String(food.quantityReference?.amount ?? ""));
  const [unit, setUnit] = useState<Reference["unit"] | "">(food.quantityReference?.unit ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!editing && returnFocus.current) {
      returnFocus.current = false;
      actionRef.current?.focus({ preventScroll: true });
    }
  }, [editing]);

  const originalUnit = quantityReferenceUnit(food);
  if (!originalUnit) return null;
  const value = Number(amount.trim());
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0 && value <= 1000000;
  const changed = value !== food.quantityReference?.amount || unit !== food.quantityReference?.unit;
  const close = () => {
    keyboard.hide();
    returnFocus.current = true;
    setEditing(false);
    setError("");
  };
  const save = async (reference: Reference | null) => {
    if (savingRef.current) return;
    savingRef.current = true;
    keyboard.hide();
    setSaving(true);
    setError("");
    try {
      await onSave(food.id, reference);
      close();
    } catch {
      setError("저장하지 못했어요. 입력 내용을 유지했으니 다시 시도해 주세요.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (!editing) return (
    <button ref={actionRef} type="button" className="product-info-edit-button" onClick={() => {
      keyboard.hide();
      setAmount(String(food.quantityReference?.amount ?? ""));
      setUnit(food.quantityReference?.unit ?? "");
      setError("");
      setEditing(true);
    }}>
      <Pencil1Icon width={15} height={15} />
      <span><strong>{food.quantityReference ? `1${originalUnit} = ${food.quantityReference.amount}${food.quantityReference.unit}` : `1${originalUnit}의 양 입력`}</strong></span>
      <ArrowRightIcon width={15} height={15} />
    </button>
  );
  return (
    <div ref={editorRef} tabIndex={-1} className="product-info-editor" role="group" aria-label="한 단위의 양 입력" aria-busy={saving}>
      <strong>1{originalUnit}에 들어 있는 양</strong>
      <p className="product-info-editor-note">포장지나 저울로 확인한 양을 입력해 주세요.</p>
      <label className="product-info-editor-field">
        <span>양</span>
        <KeyboardInput className="app-input" aria-label={`1${originalUnit}의 양`} inputMode="decimal" autoComplete="off" value={amount} disabled={saving} aria-invalid={Boolean(amount) && !valid} onChange={(event) => setAmount(event.target.value)} onBlur={() => keyboard.hide()} />
      </label>
      <label className="product-info-editor-field">
        <span>단위</span>
        <select className="app-input" aria-label="내용량 단위" value={unit} disabled={saving} onPointerDown={() => keyboard.hide()} onChange={(event) => setUnit(event.target.value as Reference["unit"])}>
          <option value="" disabled>단위 선택</option><option value="g">g</option><option value="ml">ml</option><option value="개">개</option>
        </select>
      </label>
      {amount && !valid ? <p role="alert">0보다 크고 1,000,000 이하인 숫자를 입력해 주세요.</p> : null}
      {error ? <p className="account-error" role="alert">{error}</p> : null}
      <div className="product-info-editor-actions">
        <button type="button" className="secondary-sheet-button" disabled={saving} onPointerDown={(event) => event.preventDefault()} onClick={close}>취소</button>
        <button type="button" className="primary-sheet-button" disabled={!valid || !unit || !changed || saving} aria-busy={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => { if (unit) void save({ amount: value, unit }); }}>{saving ? "저장 중" : returnToMeal ? "저장하고 식단 보기" : "저장"}</button>
      </div>
      {food.quantityReference ? <button type="button" className="danger-text-button" disabled={saving} onPointerDown={(event) => event.preventDefault()} onClick={() => void save(null)}>입력한 양 지우기</button> : null}
    </div>
  );
}
