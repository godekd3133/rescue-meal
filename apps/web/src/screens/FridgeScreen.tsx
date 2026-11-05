import type { ReactNode } from "react";
import { ArchiveIcon, ChevronRightIcon, Cross2Icon, InfoCircledIcon, MagnifyingGlassIcon, PlusIcon } from "@radix-ui/react-icons";
import { FoodPhoto } from "../FoodPhoto";
import { Metadata } from "../Metadata";
import { foodIdentityParts } from "../foodBrandPresentation";
import { Carousel } from "../mobile/Carousel";
import { KeyboardInput } from "../mobile";
import type { ApiStorageLocation } from "../mealApi";
import type { FoodItem } from "../Prototype";
import { FreshnessChip } from "./FreshnessChip";
import { ScreenHeader } from "./ScreenHeader";

export type FridgeStatusFilter = "all" | "needs-review" | "priority";
export type FridgeStorageFilter = "전체" | "냉장" | "냉동" | "실온" | `location:${string}`;
type SearchPhase = "idle" | "composing" | "waiting" | "refreshing" | "stale" | "error" | "ready" | string;

const BUILT_IN_STORAGE: ReadonlyArray<{ value: FridgeStorageFilter; label: string }> = [
  { value: "전체", label: "전체" },
  { value: "냉장", label: "냉장" },
  { value: "냉동", label: "냉동" },
  { value: "실온", label: "실온" },
];

/**
 * 냉장고: the whole inventory as its own tab — search with a single clear button,
 * storage and status chips, and the list. Tapping a row opens the food detail sheet.
 */
export default function FridgeScreen(props: {
  headerActions: ReactNode;
  foods: FoodItem[];
  filteredFoods: FoodItem[];
  referenceDate: Date;
  dataUnknown: boolean;
  initialLoading: boolean;
  showTools: boolean;
  hasEmptyResult: boolean;
  inventoryCount: number;
  scopeCount: number;
  scopedNeedsReviewCount: number;
  scopedPriorityCount: number;
  scopeIsStale: boolean;
  showScope: boolean;
  scopeParts: Array<string | null | undefined>;
  priorityFoodIds: ReadonlySet<string>;
  reviewReasonFor: (food: FoodItem) => string | null;
  storageFilter: FridgeStorageFilter;
  customStorageLocations: ApiStorageLocation[];
  selectedStorageLocationName: string | null;
  statusFilter: FridgeStatusFilter;
  query: string;
  hasQuery: boolean;
  searchPhase: SearchPhase;
  searchWaiting: boolean;
  searchPending: boolean;
  searchLoadingLabel: string;
  searchErrorLabel: string;
  searchError: string;
  searchOwnsResults: boolean;
  searchHasMore: boolean;
  searchTotal: number | null;
  listStatusLabel: string;
  listStatusDescription: string;
  unknownActionLabel: string;
  onUnknownAction: () => void;
  onAdd: () => void;
  onStorageFilterChange: (value: FridgeStorageFilter) => void;
  onStatusFilterChange: (value: FridgeStatusFilter) => void;
  onQueryChange: (value: string) => void;
  onCompositionChange: (composing: boolean, value?: string) => void;
  onSearchFocus: () => void;
  onSearchBlur: () => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onClearOnlyFilters: () => void;
  onEditSearch: () => void;
  onRetrySearch: () => void;
  onLoadMore: () => void;
  onOpenFood: (food: FoodItem) => void;
  onOpenGuidance: () => void;
  footer?: ReactNode;
}) {
  const {
    foods, filteredFoods, referenceDate, dataUnknown, initialLoading, showTools, hasEmptyResult, inventoryCount,
    storageFilter, statusFilter, searchPhase, searchWaiting, searchPending, hasQuery,
  } = props;
  const countLabel = (value: number) => dataUnknown || searchWaiting ? "—" : String(value);
  const storageOptions = [
    ...BUILT_IN_STORAGE,
    ...props.customStorageLocations.map((location) => ({ value: `location:${location.id}` as FridgeStorageFilter, label: location.name })),
  ];

  return (
    <main className={`screen-content meal-home fridge-screen${dataUnknown ? " meal-home-data-unknown" : ""}`} aria-labelledby="fridge-screen-title">
      <ScreenHeader id="fridge-screen-title" title="냉장고" actions={props.headerActions} />

      <section className={`inventory-section${hasEmptyResult || dataUnknown ? " inventory-section-empty-result" : ""}${dataUnknown ? " inventory-section-unknown" : ""}`} aria-labelledby="inventory-title" aria-busy={initialLoading || searchPending}>
        {initialLoading ? <><h2 id="inventory-title" className="sr-only">내 식품 목록</h2><div className="inventory-loading-placeholder" aria-hidden="true">{[0, 1, 2].map((row) => <div key={row}><span /><span /><span /></div>)}</div></> : <>
          <div className="inventory-toolbar">
            <div className="section-heading inventory-heading">
              <div className="inventory-heading-copy">
                <h2 id="inventory-title" aria-label={searchPhase === "composing" ? "내 식품 목록" : searchWaiting ? "내 식품 목록 검색 중" : dataUnknown ? "내 식품 목록" : showTools ? `내 식품 목록 ${inventoryCount}` : "내 식품 목록"}>내 식품 목록 {showTools ? <span>{countLabel(inventoryCount)}</span> : null}</h2>
              </div>
              <button className="icon-button inventory-add-button" type="button" aria-label="식품 목록에 추가" title="식품 목록에 추가" onClick={props.onAdd}>
                <PlusIcon width={16} height={16} aria-hidden="true" />
                <span>추가</span>
              </button>
            </div>
            {showTools ? <>
              <label className="inventory-search">
                <MagnifyingGlassIcon width={15} height={15} aria-hidden="true" />
                <KeyboardInput className="inventory-search-input" type="search" value={props.query} placeholder="식품 검색" aria-label="식품·브랜드·카테고리 검색" onCompositionStart={() => props.onCompositionChange(true)} onCompositionEnd={(event) => props.onCompositionChange(false, event.currentTarget.value)} onChange={(event) => props.onQueryChange(event.target.value)} onFocus={props.onSearchFocus} onBlur={props.onSearchBlur} />
                {hasQuery ? <button type="button" aria-label="식품 검색어 지우기" onPointerDown={(event) => event.preventDefault()} onClick={props.onClearSearch}><Cross2Icon width={14} height={14} /></button> : null}
              </label>
              <div className="fridge-storage-chips" role="group" aria-label="보관 위치 필터">
                <Carousel className="fridge-chip-rail" contentClassName="fridge-chip-track">
                  {storageOptions.map((option) => (
                    <button key={option.value} className={`fridge-chip${storageFilter === option.value ? " fridge-chip-active" : ""}`} type="button" aria-pressed={storageFilter === option.value} aria-controls="inventory-list" onClick={() => props.onStorageFilterChange(option.value)}>{option.label}</button>
                  ))}
                </Carousel>
              </div>
              <div className="inventory-status-filters" role="group" aria-label={`식품 상태 필터${props.scopeIsStale ? " · 이전 결과" : ""}`} data-scope-state={props.scopeIsStale ? "stale" : searchPending ? "loading" : "current"} aria-busy={searchPending}>
                <button className={statusFilter === "all" ? "inventory-status-filter-active" : ""} type="button" aria-pressed={statusFilter === "all"} aria-controls="inventory-list" onClick={() => props.onStatusFilterChange("all")}>전체 <span>{countLabel(props.scopeCount)}</span></button>
                <button className={statusFilter === "needs-review" ? "inventory-status-filter-active inventory-status-filter-warning" : "inventory-status-filter-warning"} type="button" aria-pressed={statusFilter === "needs-review"} aria-controls="inventory-list" onClick={() => props.onStatusFilterChange("needs-review")}>날짜·보관 확인 <span>{countLabel(props.scopedNeedsReviewCount)}</span></button>
                <button className={statusFilter === "priority" ? "inventory-status-filter-active inventory-status-filter-priority" : "inventory-status-filter-priority"} type="button" aria-pressed={statusFilter === "priority"} aria-controls="inventory-list" onClick={() => props.onStatusFilterChange("priority")}>먼저 살펴보기 <span>{countLabel(props.scopedPriorityCount)}</span></button>
              </div>
              {props.showScope ? <div className="inventory-filter-summary" role="status" aria-live="polite">
                <span><Metadata parts={[...props.scopeParts, dataUnknown ? null : `${inventoryCount}개`]} /></span>
                {!hasEmptyResult ? <button type="button" onClick={props.onClearFilters}>전체 목록 보기</button> : null}
              </div> : null}
            </> : null}
          </div>

          {searchPhase === "composing" ? null : searchWaiting ? <div className="inventory-search-state inventory-search-loading" role="status"><span className="inventory-search-loading-icon" aria-hidden="true"><MagnifyingGlassIcon width={16} height={16} /></span><span>{props.searchLoadingLabel}</span></div> : searchPhase === "error" ? <div className="inventory-search-state inventory-search-error" role="alert"><span><strong>{props.searchErrorLabel}</strong><small>{props.searchError || "잠시 후 다시 시도해 주세요."}</small></span><button type="button" onClick={props.onRetrySearch}>다시 시도</button></div> : filteredFoods.length ? <>
            {searchPhase === "stale" ? <div className="inventory-search-inline-error" role="alert"><span>{props.searchError || "더 많은 재고를 불러오지 못했어요."}</span><button type="button" onClick={props.onRetrySearch}>다시 시도</button></div> : null}
            <div className="inventory-list" id="inventory-list">
              {filteredFoods.map((food) => {
                const reviewReason = props.reviewReasonFor(food);
                return (
                  <button className="inventory-row" type="button" key={food.id} data-inventory-food-id={food.id} data-date-state={food.dateKind} onClick={() => props.onOpenFood(food)}>
                    <div className="inventory-image-wrap"><FoodPhoto src={food.image} foodName={food.name} alt="" className="inventory-image" draggable={false} /></div>
                    <span className="inventory-copy">
                      <strong>{food.name}</strong>
                      <small><Metadata parts={[...foodIdentityParts(food.brand, food.purchaseSource), food.quantity, food.storageLocationName]} /></small>
                      <small className="inventory-storage-meta"><span>{food.storage}</span></small>
                    </span>
                    <span className={`inventory-status ${reviewReason ? "inventory-status-warning" : ""}`} data-inventory-status={reviewReason ? "needs-review" : props.priorityFoodIds.has(food.id) ? "priority" : "stored"}>
                      <span className="inventory-status-content">
                        <FreshnessChip food={food} referenceDate={referenceDate} />
                        {reviewReason ? <small className="inventory-review-detail">{reviewReason === "보관 방법 확인" ? "보관 확인" : "날짜 확인"}</small> : null}
                      </span>
                    </span>
                    <ChevronRightIcon className="row-chevron" width={15} height={15} />
                  </button>
                );
              })}
            </div>
            {props.searchOwnsResults && props.searchHasMore ? <button className="inventory-load-more" type="button" disabled={searchPending} aria-busy={searchPending} onClick={props.onLoadMore}>{searchPending ? "더 불러오는 중" : <Metadata parts={["더 보기", `${Math.max(0, (props.searchTotal ?? 0) - filteredFoods.length)}개 남음`]} />}</button> : null}
          </> : <div className={`inventory-empty-state${dataUnknown ? " inventory-unknown-state" : ""}`} role={dataUnknown ? "alert" : undefined}>
            <span className="inventory-empty-icon"><ArchiveIcon width={18} height={18} /></span>
            <span className="inventory-empty-copy">
              <strong>{dataUnknown ? props.listStatusLabel : hasQuery ? "검색 결과가 없어요" : statusFilter === "needs-review" ? "날짜나 보관 방법을 살펴볼 식품이 없어요" : statusFilter === "priority" ? "먼저 살펴볼 식품이 없어요" : foods.length ? `${props.selectedStorageLocationName ?? storageFilter} 보관 식품이 없어요` : "아직 등록된 식품이 없어요"}</strong>
              {dataUnknown ? <small>{props.listStatusDescription}</small> : null}
              {dataUnknown
                ? <button className="inventory-empty-action" type="button" onClick={props.onUnknownAction}>{props.unknownActionLabel}</button>
                : hasQuery
                  ? <span className="inventory-empty-actions"><button className="inventory-empty-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={props.onEditSearch}>검색어 수정</button>{storageFilter !== "전체" || statusFilter !== "all" ? <button className="inventory-empty-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={props.onClearOnlyFilters}>필터 해제</button> : null}</span>
                  : storageFilter !== "전체" || statusFilter !== "all"
                    ? <button className="inventory-empty-action" type="button" onPointerDown={(event) => event.preventDefault()} onClick={props.onClearOnlyFilters}>필터 해제</button>
                    : <button className="inventory-empty-action" type="button" onClick={props.onAdd}>식품 추가하기</button>}
            </span>
          </div>}
        </>}
      </section>

      {!dataUnknown && statusFilter === "needs-review" && filteredFoods.length > 0 ? (
        <section className="inventory-review-guide" aria-labelledby="inventory-review-guide-title">
          <div className="inventory-review-guide-heading">
            <span className="inventory-review-guide-icon"><InfoCircledIcon width={17} height={17} aria-hidden="true" /></span>
            <h3 id="inventory-review-guide-title">식품을 살펴볼 때</h3>
            <button className="inventory-review-guide-action" type="button" aria-label="날짜와 보관 확인 방법 자세히 보기" onClick={props.onOpenGuidance}>
              자세히 <ChevronRightIcon width={14} height={14} aria-hidden="true" />
            </button>
          </div>
          <ul className="inventory-review-guide-list" aria-label="식품 확인 항목">
            <li><span>01</span><strong>포장지 날짜</strong></li>
            <li><span>02</span><strong>보관·개봉 상태</strong></li>
            <li><span>03</span><strong>냄새·색·포장 상태</strong></li>
          </ul>
          <p className="inventory-review-guide-note">앱은 먹어도 되는지 판단하지 않아요.</p>
        </section>
      ) : null}
      {props.footer}
    </main>
  );
}
