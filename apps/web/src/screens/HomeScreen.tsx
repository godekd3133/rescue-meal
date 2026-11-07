import type { ReactNode } from "react";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { FoodPhoto } from "../FoodPhoto";
import type { FoodItem } from "../Prototype";
import { FreshnessChip } from "./FreshnessChip";
import { summarizeShelves } from "./homeSummary";

export type HomeScreenState = "unknown" | "empty" | "ready";

/** Foods offered on an empty Home; each one opens quick add with that food already listed. */
export const HOME_STARTER_FOODS = ["우유", "계란", "두부", "대파"] as const;

/**
 * 홈: what to look at today, nothing more. The full list lives on the 냉장고 tab.
 *
 * - Green panel: one sentence with today's count in it, the week's rescued count as a plain
 *   line under it, then the first three foods to rescue as one list (RescueDeck) with
 *   `n개 모두 보기` for the rest.
 * - With nothing urgent the sentence says so and `이번 주 먼저 볼 것` lists the next foods.
 * - An empty workspace gets one add action and a few starter foods.
 * - One grouped list of storage places (empty shelves collapse), then one action.
 */
export default function HomeScreen({
  state,
  dataUnknown,
  header,
  callouts,
  urgentCount,
  rescuedThisWeek,
  deck,
  upcomingFoods,
  foods,
  referenceDate,
  reviewSummary,
  primaryAction,
  footer,
  onOpenFood,
  onOpenStorage,
  onStarterFood,
  reviewReasonFor,
  unknownNotice,
}: {
  state: HomeScreenState;
  dataUnknown: boolean;
  header: ReactNode;
  callouts: ReactNode;
  urgentCount: number;
  rescuedThisWeek: number | null;
  deck: ReactNode;
  upcomingFoods: FoodItem[];
  foods: FoodItem[];
  referenceDate: Date;
  reviewSummary: ReactNode;
  primaryAction: ReactNode;
  footer: ReactNode;
  onOpenFood: (food: FoodItem) => void;
  onOpenStorage: (storage: FoodItem["storage"]) => void;
  /** Empty workspace only: opens quick add with this food listed. Omitted when adding is unavailable. */
  onStarterFood?: (name: string) => void;
  reviewReasonFor: (food: FoodItem) => string | null;
  /** Configured API without a readable inventory: why Home is empty, and whether to announce it. */
  unknownNotice: { title: string; label: string; description: string; urgent: boolean } | null;
}) {
  const ready = state === "ready";
  const calm = ready && urgentCount === 0;
  const shelves = ready ? summarizeShelves(foods, referenceDate) : [];
  const showRescued = ready && rescuedThisWeek !== null && rescuedThisWeek > 0;

  return (
    <main className={`screen-content meal-home home-screen${dataUnknown ? " meal-home-data-unknown" : ""}`} aria-label="Rescue Meal 홈" data-home-state={calm ? "calm" : state}>
      <div className="kitchen-hero" data-has-foods={ready}>
        {header}
        {callouts}
        <div className="home-hero-copy">
          <section className="greeting-block" aria-labelledby="greeting-title">
            {state === "unknown" && unknownNotice ? (
              <h1 id="greeting-title" tabIndex={-1}>{unknownNotice.title}</h1>
            ) : !ready ? (
              <h1 id="greeting-title" tabIndex={-1}>냉장고가 비어 있어요</h1>
            ) : calm ? (
              <h1 id="greeting-title" tabIndex={-1} className="rescue-hero rescue-hero-calm">오늘은 서둘러 볼 음식이 없어요</h1>
            ) : (
              <h1 id="greeting-title" tabIndex={-1} className="rescue-hero" aria-label={`오늘 살펴볼 음식 ${urgentCount}개`}>
                오늘 살펴볼 음식 <span className="rescue-hero-count">{urgentCount}</span>개
              </h1>
            )}
            {showRescued ? (
              <p className="home-rescued-stat" data-testid="home-rescued-stat">
                <span className="home-rescued-label">이번 주 구한 음식</span>{" "}
                <span className="home-rescued-value"><strong>{rescuedThisWeek}</strong>개</span>
              </p>
            ) : state === "empty" ? (
              <p className="home-hero-note">산 식품을 적어 두면 먼저 먹을 순서대로 보여 드려요.</p>
            ) : null}
          </section>
          {ready && !calm ? deck : null}
        </div>
      </div>

      <div className="home-body">
        {state === "unknown" && unknownNotice?.urgent ? (
          <div className="inventory-empty-state home-unknown-notice" role="alert">
            <span className="inventory-empty-copy">
              <strong>{unknownNotice.label}</strong>
              <small>{unknownNotice.description}</small>
            </span>
          </div>
        ) : null}
        {reviewSummary}

        {calm && upcomingFoods.length ? (
          <section className="home-upcoming" aria-labelledby="priority-title">
            <h2 id="priority-title" className="home-section-title">이번 주 먼저 볼 것</h2>
            <div className="home-group">
              {upcomingFoods.map((food) => (
                <button key={food.id} className="priority-card" type="button" data-priority-food-id={food.id} data-priority-state={reviewReasonFor(food) ? "needs-review" : "use-next"} onClick={() => onOpenFood(food)}>
                  <FoodPhoto src={food.image} foodName={food.name} category={food.category} storage={food.storage} loading="eager" alt="" className="food-thumb" draggable={false} />
                  <span className="priority-copy">
                    <strong>{food.name}</strong>
                    <small>{food.quantity}</small>
                  </span>
                  <FreshnessChip food={food} referenceDate={referenceDate} />
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {shelves.length ? (
          <nav className="home-shelves" aria-labelledby="home-shelves-title">
            <h2 id="home-shelves-title" className="home-section-title">보관 장소</h2>
            <ul className="home-group">
              {shelves.map((shelf) => (
                <li key={shelf.storage}>
                  <button
                    className="home-shelf-row"
                    type="button"
                    data-storage={shelf.storage}
                    aria-label={`${shelf.storage} 식품 ${shelf.count}개 보기${shelf.soonCount ? `, 오늘 살펴볼 ${shelf.soonCount}개` : ""}`}
                    onClick={() => onOpenStorage(shelf.storage)}
                  >
                    <span className="home-shelf-name">{shelf.storage}</span>
                    <span className="home-shelf-photos" aria-hidden="true">
                      {shelf.previews.map((food) => <FoodPhoto key={food.id} src={food.image} foodName={food.name} category={food.category} storage={food.storage} alt="" className="home-shelf-photo" draggable={false} />)}
                    </span>
                    <span className="home-shelf-counts" aria-hidden="true">
                      {shelf.soonCount ? <span className="home-shelf-soon">곧 {shelf.soonCount}</span> : null}
                      <span className="home-shelf-count"><strong>{shelf.count}</strong>개</span>
                    </span>
                    <ChevronRightIcon className="home-shelf-chevron" width={16} height={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="home-action-row">{primaryAction}</div>

        {state === "empty" && onStarterFood ? (
          <section className="home-starters" aria-labelledby="home-starters-title">
            <h2 id="home-starters-title" className="home-section-title">자주 사는 식품부터</h2>
            <ul>
              {HOME_STARTER_FOODS.map((name) => (
                <li key={name}>
                  <button className="home-starter" type="button" aria-label={`${name} 추가하기`} onClick={() => onStarterFood(name)}>{name}</button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {footer}
      </div>
    </main>
  );
}
