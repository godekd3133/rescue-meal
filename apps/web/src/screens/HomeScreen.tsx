import type { ReactNode } from "react";
import { ChevronRightIcon } from "@radix-ui/react-icons";
import { FoodPhoto } from "../FoodPhoto";
import RevealText, { CountUp } from "../RevealText";
import type { FoodItem } from "../Prototype";
import { FreshnessChip } from "./FreshnessChip";
import { summarizeShelves } from "./homeSummary";

export type HomeScreenState = "unknown" | "empty" | "ready";

/**
 * 홈: what to look at today, nothing more. The full list lives on the 냉장고 tab.
 *
 * - Green hero: today's count (`오늘 살펴볼`) and what was eaten this week (`이번 주 구한`).
 *   Only rescues are counted; discards are never shown.
 * - Urgent foods ride the RescueDeck. With nothing urgent there is no giant "0개": the
 *   hero says so calmly and `이번 주 먼저 볼 것` lists the next few foods instead.
 * - One line per storage place (empty shelves collapse), then one action.
 */
export default function HomeScreen({
  state,
  dataUnknown,
  header,
  callouts,
  eyebrow,
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
  reviewReasonFor,
  unknownNotice,
}: {
  state: HomeScreenState;
  dataUnknown: boolean;
  header: ReactNode;
  callouts: ReactNode;
  eyebrow: string;
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
            <div>
              <p className="eyebrow">{eyebrow}</p>
              {state === "unknown" && unknownNotice ? (
                <h1 id="greeting-title" tabIndex={-1}>{unknownNotice.title}</h1>
              ) : !ready ? (
                <h1 id="greeting-title" tabIndex={-1}><RevealText text="첫 식품을" delay={160} /><br /><em><RevealText text="기록해 보세요." delay={330} /></em></h1>
              ) : calm ? (
                <h1 id="greeting-title" tabIndex={-1} className="rescue-hero rescue-hero-calm"><span className="rescue-hero-copy"><RevealText text="오늘은 서둘러 볼" delay={160} /></span><span className="rescue-hero-copy"><RevealText text="음식이 없어요" delay={300} /></span></h1>
              ) : (
                <h1 id="greeting-title" tabIndex={-1} className="rescue-hero" aria-label={`오늘 살펴볼 음식 ${urgentCount}개`}><span className="rescue-hero-copy"><RevealText text="오늘 살펴볼 음식" delay={160} /></span><span><span className="rescue-hero-count"><CountUp value={urgentCount} /></span><span className="rescue-hero-unit">개</span></span></h1>
              )}
              {showRescued ? (
                <p className="home-rescued-stat" data-testid="home-rescued-stat">
                  <span className="home-rescued-label">이번 주 구한 음식</span>{" "}
                  <span className="home-rescued-value"><strong>{rescuedThisWeek}</strong>개</span>
                </p>
              ) : null}
            </div>
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
          <section className="priority-section home-upcoming" aria-labelledby="priority-title">
            <div className="section-heading">
              <h2 id="priority-title">이번 주 먼저 볼 것</h2>
            </div>
            <div className="priority-list">
              <div className="priority-list-items">
                {upcomingFoods.map((food) => (
                  <button key={food.id} className="priority-card" type="button" data-priority-food-id={food.id} data-priority-state={reviewReasonFor(food) ? "needs-review" : "use-next"} onClick={() => onOpenFood(food)}>
                    <div className="food-image-wrap"><FoodPhoto src={food.image} foodName={food.name} loading="eager" alt="" className="food-image" draggable={false} /></div>
                    <span className="priority-copy">
                      <span className="food-name-line"><strong>{food.name}</strong></span>
                      <span className="food-subline">{food.quantity}</span>
                    </span>
                    <span className="priority-date"><FreshnessChip food={food} referenceDate={referenceDate} /></span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {shelves.length ? (
          <nav className="home-shelves" aria-labelledby="home-shelves-title">
            <h2 id="home-shelves-title" className="home-section-title">보관 장소</h2>
            <ul>
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
                      {shelf.previews.map((food) => <FoodPhoto key={food.id} src={food.image} foodName={food.name} alt="" className="home-shelf-photo" draggable={false} />)}
                    </span>
                    <span className="home-shelf-counts" aria-hidden="true">
                      {shelf.soonCount ? <span className="home-shelf-soon">곧 {shelf.soonCount}</span> : null}
                      <strong>{shelf.count}</strong>
                    </span>
                    <ChevronRightIcon className="home-shelf-chevron" width={15} height={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        <div className="home-action-row">{primaryAction}</div>

        {footer}
      </div>
    </main>
  );
}
