import { useState } from "react";
import { ArchiveIcon, ArrowRightIcon, CheckCircledIcon, Cross2Icon, InfoCircledIcon, ReaderIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile/Keyboard";
import type { ApiShoppingListItem, ApiStorageLocation, ApiStorageType } from "./mealApi";

type ShoppingListSheetProps = {
  items: ApiShoppingListItem[];
  loading: boolean;
  mutating: boolean;
  error: string;
  notice?: string;
  onRefresh: () => void;
  onToggle: (item: ApiShoppingListItem) => void;
  onDelete: (item: ApiShoppingListItem) => void;
  onAddManual: (input: { canonicalName: string; quantity: number; unit: string }) => Promise<boolean>;
  onReceive: (item: ApiShoppingListItem, input: { quantity: number; storageType: ApiStorageType; storageLocationId?: string | null }) => Promise<boolean>;
  storageLocations: ApiStorageLocation[];
  retryAction?: { label: string; onRetry: () => void } | null;
};

const RECEIVE_STORAGE_OPTIONS: Array<{ value: ApiStorageType; label: string }> = [
  { value: "refrigerated", label: "냉장" },
  { value: "frozen", label: "냉동" },
  { value: "ambient", label: "실온" },
];

function formatQuantity(quantity: number) {
  return Number.isInteger(quantity)
    ? String(quantity)
    : quantity.toLocaleString("ko-KR", { maximumFractionDigits: 3 });
}

function sourceLabel(item: ApiShoppingListItem) {
  const planCount = item.sources.filter((source) => source.source_type !== "manual").length;
  const hasManualSource = item.sources.some((source) => source.source_type === "manual");
  if (hasManualSource && planCount) return `직접 추가 · 계획 ${planCount}개`;
  if (hasManualSource) return "직접 추가";
  return `계획 ${planCount}개`;
}

function itemLabel(item: ApiShoppingListItem) {
  return `${item.canonical_name} ${formatQuantity(item.quantity)}${item.unit} · ${sourceLabel(item)}`;
}

export default function ShoppingListSheet({
  items,
  loading,
  mutating,
  error,
  notice,
  onRefresh,
  onToggle,
  onDelete,
  onAddManual,
  onReceive,
  storageLocations,
  retryAction,
}: ShoppingListSheetProps) {
  const keyboard = useKeyboard();
  const [manualName, setManualName] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnit, setManualUnit] = useState("개");
  const [manualError, setManualError] = useState("");
  const [receivingItemId, setReceivingItemId] = useState<string | null>(null);
  const [receiveQuantity, setReceiveQuantity] = useState("");
  const [receiveStorageType, setReceiveStorageType] = useState<ApiStorageType>("refrigerated");
  const [receiveStorageLocationId, setReceiveStorageLocationId] = useState<string | null>(null);
  const [receiveError, setReceiveError] = useState("");
  const remainingCount = items.filter((item) => !item.checked).length;
  const completedCount = items.length - remainingCount;
  const customStorageLocations = storageLocations.filter((location) => !["ambient", "refrigerated", "frozen"].includes(location.id));
  const hasManualItems = items.some((item) => item.sources.some((source) => source.source_type === "manual"));
  const hasPlannedItems = items.some((item) => item.sources.some((source) => source.source_type !== "manual"));
  const heroDescription = hasManualItems && hasPlannedItems
    ? "식단 부족 재료와 직접 추가한 물건을 함께 관리해요."
    : hasManualItems
      ? "식단과 상관없이 필요한 물건을 기록했어요."
      : "저장한 식단에서 부족한 재료를 모았어요.";

  const submitManualItem = async () => {
    const canonicalName = manualName.trim();
    const quantity = Number(manualQuantity);
    const unit = manualUnit.trim();
    if (!canonicalName) {
      setManualError("상품명을 입력해 주세요.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError("수량은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    if (!unit) {
      setManualError("단위를 입력해 주세요.");
      return;
    }
    setManualError("");
    const added = await onAddManual({ canonicalName, quantity, unit });
    if (!added) return;
    setManualName("");
    setManualQuantity("1");
    setManualUnit("개");
    keyboard.hide();
  };

  const beginReceive = (item: ApiShoppingListItem) => {
    setReceivingItemId(item.id);
    setReceiveQuantity(formatQuantity(item.quantity));
    setReceiveStorageType("refrigerated");
    setReceiveStorageLocationId(null);
    setReceiveError("");
  };

  const cancelReceive = () => {
    setReceivingItemId(null);
    setReceiveQuantity("");
    setReceiveStorageLocationId(null);
    setReceiveError("");
    keyboard.hide();
  };

  const submitReceive = async (item: ApiShoppingListItem) => {
    const quantity = Number(receiveQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setReceiveError("구매 수량은 0보다 큰 숫자로 입력해 주세요.");
      return;
    }
    setReceiveError("");
    const received = await onReceive(item, { quantity, storageType: receiveStorageType, storageLocationId: receiveStorageLocationId });
    if (received) cancelReceive();
  };

  return (
    <div className="shopping-sheet-content" aria-label="장보기 목록">
      <section className="shopping-sheet-hero" aria-labelledby="shopping-sheet-title">
        <span className="shopping-sheet-hero-icon"><ReaderIcon width={19} height={19} /></span>
        <div>
          <p className="shopping-sheet-kicker">SHOPPING QUEUE</p>
          <h3 id="shopping-sheet-title">{remainingCount ? `${remainingCount}개를 준비해요` : items.length ? "모두 준비했어요" : "장볼 재료가 없어요"}</h3>
          <p>{remainingCount ? heroDescription : items.length ? "체크한 항목도 목록에 남아 있어요." : "식단을 저장하거나 필요한 물건을 직접 추가해 보세요."}</p>
        </div>
      </section>

      {notice ? <div className="shopping-sheet-refresh-notice" role="status"><CheckCircledIcon width={15} height={15} /><span>{notice}</span></div> : null}
      {error ? (
        <div className="shopping-sheet-error" role="alert">
          <InfoCircledIcon width={16} height={16} />
          <span>{error}</span>
          <button type="button" onClick={retryAction?.onRetry ?? onRefresh} disabled={loading || mutating}>{retryAction?.label ?? "다시 시도"}</button>
        </div>
      ) : null}

      {loading && !items.length ? (
        <div className="shopping-sheet-state shopping-sheet-loading" role="status">
          <span className="shopping-sheet-state-icon"><ReaderIcon width={17} height={17} /></span>
          <span><strong>장보기 목록을 불러오고 있어요</strong><small>저장한 식단과 현재 재고를 확인합니다.</small></span>
        </div>
      ) : items.length ? (
        <section className="shopping-sheet-list-section" aria-label="장보기 항목">
          <div className="shopping-sheet-list-heading">
            <span><strong>이번에 살 재료</strong><small>{completedCount ? `${completedCount}개 구매 완료 · ` : ""}{remainingCount}개 남음</small></span>
            {loading ? <span className="shopping-sheet-syncing" role="status">동기화 중</span> : null}
          </div>
          <div className="shopping-sheet-list" role="list">
            {items.map((item) => (
              <div className="shopping-sheet-row-group" role="listitem" key={item.id}>
                <div className={`shopping-sheet-row${item.checked ? " shopping-sheet-row-checked" : ""}`}>
                  <button
                    className="shopping-sheet-item"
                    type="button"
                    aria-label={itemLabel(item)}
                    aria-pressed={item.checked}
                    disabled={mutating}
                    onClick={() => onToggle(item)}
                  >
                    <span className="shopping-sheet-check" aria-hidden="true">{item.checked ? <CheckCircledIcon width={16} height={16} /> : null}</span>
                    <span className="shopping-sheet-copy">
                      <strong>{item.canonical_name}</strong>
                      <small>{formatQuantity(item.quantity)}{item.unit} · {sourceLabel(item)}</small>
                    </span>
                  </button>
                  <div className="shopping-sheet-actions">
                    <button
                      className={`shopping-sheet-receive${receivingItemId === item.id ? " shopping-sheet-receive-active" : ""}`}
                      type="button"
                      aria-label={`${item.canonical_name} 재고에 반영`}
                      aria-expanded={receivingItemId === item.id}
                      disabled={mutating}
                      onClick={() => receivingItemId === item.id ? cancelReceive() : beginReceive(item)}
                    >
                      <ArchiveIcon width={13} height={13} /> 재고 반영
                    </button>
                    <button
                      className="shopping-sheet-delete"
                      type="button"
                      aria-label={`${item.canonical_name} 장보기 항목 삭제`}
                      disabled={mutating}
                      onClick={() => onDelete(item)}
                    >
                      <Cross2Icon width={14} height={14} />
                    </button>
                  </div>
                </div>
                {receivingItemId === item.id ? (
                  <form
                    className="shopping-sheet-receive-panel"
                    aria-label={`${item.canonical_name} 재고 반영`}
                    onSubmit={(event) => { event.preventDefault(); void submitReceive(item); }}
                  >
                    <div className="shopping-sheet-receive-heading">
                      <strong>{item.canonical_name} 입고 확인</strong>
                      <small>실제로 구매한 수량과 보관 위치를 확인해 주세요.</small>
                    </div>
                    <div className="shopping-sheet-receive-fields">
                      <label className="shopping-sheet-receive-field shopping-sheet-receive-quantity">
                        <span>구매 수량</span>
                        <KeyboardInput
                          className="app-input"
                          type="number"
                          min="0.001"
                          step="0.001"
                          inputMode="decimal"
                          value={receiveQuantity}
                          aria-label={`${item.canonical_name} 구매 수량`}
                          onChange={(event) => { setReceiveQuantity(event.target.value); setReceiveError(""); }}
                          onBlur={() => keyboard.hide()}
                        />
                      </label>
                      <div className="shopping-sheet-receive-field">
                        <span>보관 위치</span>
                        <div className="shopping-sheet-storage-picker" role="group" aria-label={`${item.canonical_name} 보관 위치`}>
                          {RECEIVE_STORAGE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              className={!receiveStorageLocationId && receiveStorageType === option.value ? "shopping-sheet-storage-option shopping-sheet-storage-option-active" : "shopping-sheet-storage-option"}
                              type="button"
                              aria-pressed={!receiveStorageLocationId && receiveStorageType === option.value}
                              onPointerDown={(event) => event.preventDefault()}
                              onClick={() => { setReceiveStorageType(option.value); setReceiveStorageLocationId(null); }}
                            >
                              {option.label}
                            </button>
                          ))}
                          {customStorageLocations.length ? <div className="shopping-sheet-custom-storage-options" role="group" aria-label="사용자 정의 보관 위치"><span className="shopping-sheet-custom-storage-heading">내 보관 위치</span>{customStorageLocations.map((location) => <button key={location.id} className={receiveStorageLocationId === location.id ? "shopping-sheet-storage-option shopping-sheet-storage-option-active shopping-sheet-custom-storage-option" : "shopping-sheet-storage-option shopping-sheet-custom-storage-option"} type="button" aria-pressed={receiveStorageLocationId === location.id} onPointerDown={(event) => event.preventDefault()} onClick={() => { setReceiveStorageType(location.storage_type); setReceiveStorageLocationId(location.id); }}>{location.name}</button>)}</div> : null}
                        </div>
                      </div>
                    </div>
                    <p className="shopping-sheet-receive-note"><InfoCircledIcon width={13} height={13} /> 소비기한은 자동 확정하지 않아요. 재고에 넣은 뒤 포장지 날짜를 확인해 주세요.</p>
                    {receiveError ? <p className="shopping-sheet-receive-error" role="alert">{receiveError}</p> : null}
                    <div className="shopping-sheet-receive-actions">
                      <button className="shopping-sheet-receive-cancel" type="button" disabled={mutating} onClick={cancelReceive}>취소</button>
                      <button
                        className="shopping-sheet-receive-submit"
                        type="submit"
                        disabled={mutating}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          void submitReceive(item);
                          keyboard.hide();
                        }}
                      >{mutating ? "반영 중" : "재고에 반영"}</button>
                    </div>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
          <p className="shopping-sheet-note"><ArrowRightIcon width={13} height={13} /> 재고에 추가한 뒤 다시 동기화하면 보유한 재료는 자동으로 빠져요.</p>
        </section>
      ) : (
        <div className="shopping-sheet-state shopping-sheet-empty" role="status">
          <span className="shopping-sheet-state-icon"><CheckCircledIcon width={17} height={17} /></span>
          <span><strong>아직 장보기 항목이 없어요</strong><small>식단 화면에서 부족한 재료를 장보기 목록에 추가할 수 있어요.</small></span>
          <button type="button" onClick={onRefresh} disabled={loading}>새로 고침</button>
        </div>
      )}

      <section className="shopping-sheet-manual" aria-label="직접 장보기 추가">
        <div className="shopping-sheet-manual-heading">
          <span><strong>직접 추가</strong><small>식단과 상관없이 필요한 물건도 기록해요.</small></span>
        </div>
        <form className="shopping-sheet-manual-form" onSubmit={(event) => { event.preventDefault(); void submitManualItem(); }}>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-name">
            <span>상품명</span>
            <KeyboardInput className="app-input" value={manualName} maxLength={160} autoComplete="off" placeholder="예: 우유" aria-label="직접 추가 상품명" onChange={(event) => { setManualName(event.target.value); setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-quantity">
            <span>수량</span>
            <KeyboardInput className="app-input" type="number" min="0.001" step="0.001" inputMode="decimal" value={manualQuantity} aria-label="직접 추가 수량" onChange={(event) => { setManualQuantity(event.target.value); setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <label className="shopping-sheet-manual-field shopping-sheet-manual-unit">
            <span>단위</span>
            <KeyboardInput className="app-input" value={manualUnit} maxLength={30} autoComplete="off" placeholder="개" aria-label="직접 추가 단위" onChange={(event) => { setManualUnit(event.target.value); setManualError(""); }} onBlur={() => keyboard.hide()} />
          </label>
          <button
            className="shopping-sheet-manual-submit"
            type="submit"
            disabled={mutating}
            onPointerDown={(event) => {
              event.preventDefault();
              void submitManualItem();
              keyboard.hide();
            }}
          >추가</button>
        </form>
        {manualError ? <p className="shopping-sheet-manual-error" role="alert">{manualError}</p> : null}
        <p className="shopping-sheet-manual-note">같은 상품명·단위가 이미 있으면 직접 추가 수량으로 갱신해요.</p>
      </section>
    </div>
  );
}
