import { useEffect, useState } from "react";
import { CheckIcon, ChevronRightIcon, CookieIcon, CubeIcon } from "@radix-ui/react-icons";
import { FoodPhoto } from "./FoodPhoto";
import { foodFreshness, freshnessSpokenLabel, type FreshnessFood } from "./freshness";
import { FreshnessChip } from "./screens/FreshnessChip";
import "./rescueDeck.css";
import "./quickActions.css";

type DeckFood = FreshnessFood & { id: string; name: string; image: string; quantity: string; storage?: string; category?: string };

/** How many foods Home lists on the green panel; the rest are one tap away on the 냉장고 tab. */
export const RESCUE_LIST_VISIBLE = 3;
const CONFIRM_WINDOW_MS = 4000;

/** Foods worth rescuing today: date passed, today/tomorrow, or within three days — soonest first. */
export function selectRescueDeckFoods<T extends DeckFood>(foods: readonly T[], referenceDate: Date, limit = Number.POSITIVE_INFINITY) {
  return foods
    .map((food) => ({ food, freshness: foodFreshness(food, referenceDate) }))
    .filter(({ freshness }) => freshness.bucket === "past" || freshness.bucket === "today" || freshness.bucket === "soon")
    // An estimate is only an ordering hint for the storage it was made for. Once a food
    // is frozen that hint no longer says "look at this soon" (the API recalculates it).
    .filter(({ food, freshness }) => !(freshness.estimated && food.storage === "냉동"))
    .sort((a, b) => (a.freshness.daysLeft ?? 0) - (b.freshness.daysLeft ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Whether a Home row leads with 날짜 확인 instead of 먹었어요: the printed date passed or the
 * date still needs a check. Prototype uses the same rule to keep the review banner from
 * repeating a 날짜 확인 that is already visible on a row.
 */
export function rescueRowNeedsDateCheck<T extends DeckFood>(food: T, referenceDate: Date, needsDateCheck: (food: T) => boolean) {
  return needsDateCheck(food) || foodFreshness(food, referenceDate).bucket === "past";
}

/**
 * Home rescue list: the first three foods to rescue as rows of one card on the green panel
 * (photo, name, amount, date badge, then the one or two things a person does next), and a
 * `n개 모두 보기` row that opens the rest on the 냉장고 tab. Foods whose printed date passed
 * or still needs a check only offer "날짜 확인" — the app never records eating them in one tap.
 */
export default function RescueDeck<T extends DeckFood>({
  foods,
  referenceDate,
  needsDateCheck,
  onOpen,
  onConsume,
  onCook,
  onFreeze,
  canFreeze,
  onShowAll,
}: {
  foods: readonly T[];
  referenceDate: Date;
  needsDateCheck: (food: T) => boolean;
  onOpen: (food: T, intent: "date-review" | "browse") => void;
  onConsume: (food: T) => void;
  onCook: (food: T) => void;
  /** One-tap 냉동. Offered only for foods without a date question that can be frozen. */
  onFreeze?: (food: T) => void;
  canFreeze?: (food: T) => boolean;
  /** Opens every food the list stands for (the 냉장고 tab's 먼저 볼 것 filter). */
  onShowAll?: () => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingId) return undefined;
    const timer = window.setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingId]);

  const all = selectRescueDeckFoods(foods, referenceDate);
  const deck = all.slice(0, RESCUE_LIST_VISIBLE);
  if (!deck.length) {
    return (
      <div className="rescue-deck-clear">
        <CheckIcon width={18} height={18} aria-hidden="true" />
        <span>지금 서둘러 챙길 음식은 없어요</span>
      </div>
    );
  }

  return (
    <section className="rescue-deck" aria-label="오늘 구할 음식">
      <ul className="rescue-list">
        {deck.map(({ food, freshness }) => {
          const dateCheck = rescueRowNeedsDateCheck(food, referenceDate, needsDateCheck);
          const confirming = confirmingId === food.id;
          // Date-check-first: a food whose printed date passed or needs review is never frozen
          // (or eaten) in one tap; the person checks the date first.
          const freezable = !dateCheck && Boolean(onFreeze && canFreeze?.(food));
          return (
            <li key={food.id}>
              <article className={`rescue-card freshness-${freshness.bucket}`} data-rescue-food-id={food.id} aria-label={`${food.name}, ${freshnessSpokenLabel(freshness)}`}>
                <button className="rescue-card-open" type="button" data-priority-food-id={food.id} onClick={() => onOpen(food, "browse")} aria-label={`${food.name} 자세히 보기`}>
                  <FoodPhoto src={food.image} foodName={food.name} category={food.category} storage={food.storage} alt="" className="rescue-card-image" draggable={false} />
                  <span className="rescue-card-body">
                    <strong className="rescue-card-name">{food.name}</strong>
                    <span className="rescue-card-qty">{food.quantity}</span>
                  </span>
                </button>
                <FreshnessChip food={food} referenceDate={referenceDate} className="rescue-card-chip" decorative />
                <div className="rescue-card-actions">
                  {dateCheck ? (
                    <button className="rescue-card-action rescue-card-action-check" type="button" onClick={() => onOpen(food, "date-review")} aria-label={`${food.name} 날짜 확인`}>
                      날짜 확인
                    </button>
                  ) : (
                    <button
                      className={`rescue-card-action rescue-card-action-ate${confirming ? " is-confirming" : ""}`}
                      type="button"
                      aria-label={confirming ? `${food.name} 다 먹은 기록 남기기` : `${food.name} 먹었어요`}
                      onClick={() => {
                        if (!confirming) { setConfirmingId(food.id); return; }
                        setConfirmingId(null);
                        onConsume(food);
                      }}
                    >
                      {confirming ? "다 먹음" : "먹었어요"}
                    </button>
                  )}
                  <button className="rescue-card-action rescue-card-action-cook" type="button" onClick={() => onCook(food)} aria-label={`${food.name} 넣어 요리하기`}>
                    <CookieIcon width={16} height={16} aria-hidden="true" />
                    요리
                  </button>
                  {freezable ? (
                    <button className="rescue-card-action rescue-card-action-freeze" type="button" onClick={() => onFreeze?.(food)} aria-label={`${food.name} 냉동 보관하기`}>
                      <CubeIcon width={16} height={16} aria-hidden="true" />
                      냉동
                    </button>
                  ) : null}
                </div>
              </article>
            </li>
          );
        })}
        {onShowAll && all.length > deck.length ? (
          <li>
            <button className="rescue-list-all" type="button" data-testid="rescue-show-all" aria-label={`오늘 살펴볼 음식 ${all.length}개 모두 보기`} onClick={onShowAll}>
              <span>{all.length}개 모두 보기</span>
              <ChevronRightIcon width={16} height={16} aria-hidden="true" />
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}
