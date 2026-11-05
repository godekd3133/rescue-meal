import { useEffect, useState } from "react";
import { CalendarIcon, CheckIcon } from "@radix-ui/react-icons";
import { FoodPhoto } from "./FoodPhoto";
import { foodFreshness, freshnessChipLabel, freshnessSpokenLabel, type FreshnessFood } from "./freshness";
import { Carousel } from "./mobile/Carousel";
import "./rescueDeck.css";

type DeckFood = FreshnessFood & { id: string; name: string; image: string; quantity: string };

const DECK_LIMIT = 8;
const CONFIRM_WINDOW_MS = 4000;

/** Foods worth rescuing today: date passed, today/tomorrow, or within three days — soonest first. */
export function selectRescueDeckFoods<T extends DeckFood>(foods: readonly T[], referenceDate: Date) {
  return foods
    .map((food) => ({ food, freshness: foodFreshness(food, referenceDate) }))
    .filter(({ freshness }) => freshness.bucket === "past" || freshness.bucket === "today" || freshness.bucket === "soon")
    .sort((a, b) => (a.freshness.daysLeft ?? 0) - (b.freshness.daysLeft ?? 0))
    .slice(0, DECK_LIMIT);
}

/**
 * Home rescue deck: one photo card per food to rescue, each with the one or two
 * things a person does next. Foods whose printed date passed or still needs a
 * check only offer "날짜 확인" — the app never records eating them in one tap.
 */
export default function RescueDeck<T extends DeckFood>({
  foods,
  referenceDate,
  needsDateCheck,
  onOpen,
  onConsume,
  onCook,
}: {
  foods: readonly T[];
  referenceDate: Date;
  needsDateCheck: (food: T) => boolean;
  onOpen: (food: T, intent: "date-review" | "browse") => void;
  onConsume: (food: T) => void;
  onCook: (food: T) => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmingId) return undefined;
    const timer = window.setTimeout(() => setConfirmingId(null), CONFIRM_WINDOW_MS);
    return () => window.clearTimeout(timer);
  }, [confirmingId]);

  const deck = selectRescueDeckFoods(foods, referenceDate);
  if (!deck.length) {
    return (
      <div className="rescue-deck-clear">
        <CheckIcon width={18} height={18} aria-hidden="true" />
        <span>지금 서둘러 챙길 음식은 없어요</span>
      </div>
    );
  }

  return (
    <Carousel ariaLabel="오늘 구할 음식" className="rescue-deck" contentClassName="rescue-deck-track">
      {deck.map(({ food, freshness }, index) => {
        const dateCheck = needsDateCheck(food) || freshness.bucket === "past";
        const confirming = confirmingId === food.id;
        return (
          <article key={food.id} className={`rescue-card freshness-${freshness.bucket}`} data-rescue-food-id={food.id} style={{ "--deal-i": index } as React.CSSProperties} aria-label={`${food.name}, ${freshnessSpokenLabel(freshness)}`}>
            <button className="rescue-card-photo" type="button" onClick={() => onOpen(food, "browse")} aria-label={`${food.name} 자세히 보기`}>
              <FoodPhoto src={food.image} foodName={food.name} alt="" className="rescue-card-image" draggable={false} />
              <span className="rescue-card-chip" data-estimated={freshness.estimated} aria-hidden="true">{freshnessChipLabel(freshness)}</span>
            </button>
            <div className="rescue-card-body">
              <strong className="rescue-card-name">{food.name}</strong>
              <span className="rescue-card-qty">{food.quantity}</span>
            </div>
            <div className="rescue-card-actions">
              {dateCheck ? (
                <button className="rescue-card-action rescue-card-action-check" type="button" onClick={() => onOpen(food, "date-review")} aria-label={`${food.name} 날짜 확인`}>
                  <CalendarIcon width={15} height={15} aria-hidden="true" />날짜 확인
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
                  <CheckIcon width={15} height={15} aria-hidden="true" />{confirming ? "다 먹음" : "먹었어요"}
                </button>
              )}
              <button className="rescue-card-action rescue-card-action-cook" type="button" onClick={() => onCook(food)} aria-label={`${food.name} 넣어 요리하기`}>요리</button>
            </div>
          </article>
        );
      })}
    </Carousel>
  );
}
