import type { CSSProperties } from "react";
import { FoodPhoto } from "./FoodPhoto";
import { foodFreshness, freshnessChipLabel, freshnessSpokenLabel, type FreshnessFood } from "./freshness";
import "./fridge.css";

export type ShelfStorage = "냉장" | "냉동" | "실온";

type ShelfFood = FreshnessFood & { id: string; name: string; image: string; storage: ShelfStorage };

const SHELVES: ReadonlyArray<{ storage: ShelfStorage; note: string }> = [
  { storage: "냉장", note: "fridge" },
  { storage: "냉동", note: "freezer" },
  { storage: "실온", note: "pantry" },
];

const STICKERS_PER_SHELF = 6;

/** Ring fill: a full ring once the date passes, shrinking as there is more time left (a week = empty). */
function ringFill(daysLeft: number | null) {
  if (daysLeft === null) return 0;
  if (daysLeft <= 0) return 1;
  return Math.max(0.12, 1 - daysLeft / 8);
}

/**
 * The home "fridge door": one shelf per storage place, foods as round stickers
 * ordered by how soon to look at them. The coloured ring is the only date cue.
 */
export default function FridgeShelves<T extends ShelfFood>({
  foods,
  referenceDate,
  onOpenStorage,
  onOpenFood,
}: {
  foods: readonly T[];
  referenceDate: Date;
  onOpenStorage: (storage: ShelfStorage) => void;
  onOpenFood: (food: T) => void;
}) {
  return (
    <nav className="fridge-door pantry-shortcuts" aria-label="보관 중인 식품 바로 찾기">
      {SHELVES.map(({ storage, note }) => {
        const shelfFoods = foods
          .filter((food) => food.storage === storage)
          .map((food) => ({ food, freshness: foodFreshness(food, referenceDate) }))
          .sort((a, b) => (a.freshness.daysLeft ?? 9_999) - (b.freshness.daysLeft ?? 9_999));
        const shown = shelfFoods.slice(0, STICKERS_PER_SHELF);
        const hidden = shelfFoods.length - shown.length;
        return (
          <section key={storage} className={`fridge-shelf fridge-shelf-${note}`} aria-label={`${storage} 선반`}>
            <button className="fridge-shelf-label" type="button" onClick={() => onOpenStorage(storage)} aria-label={`${storage} 보관 식품 ${shelfFoods.length}개 보기`}>
              <span>{storage}</span>
              <strong>{shelfFoods.length}</strong>
            </button>
            {shown.length ? (
              <ul className="fridge-stickers">
                {shown.map(({ food, freshness }) => (
                  <li key={food.id}>
                    <button
                      className={`fridge-sticker freshness-${freshness.bucket}`}
                      type="button"
                      data-estimated={freshness.estimated}
                      style={{ "--ring": ringFill(freshness.daysLeft) } as CSSProperties}
                      aria-label={`${food.name}, ${freshnessSpokenLabel(freshness)}`}
                      onClick={() => onOpenFood(food)}
                    >
                      <span className="fridge-sticker-ring" aria-hidden="true">
                        <FoodPhoto src={food.image} foodName={food.name} alt="" className="fridge-sticker-photo" draggable={false} />
                      </span>
                      <span className="fridge-sticker-badge" aria-hidden="true">{freshnessChipLabel(freshness)}</span>
                      <span className="fridge-sticker-name" aria-hidden="true">{food.name}</span>
                    </button>
                  </li>
                ))}
                {hidden > 0 ? (
                  <li>
                    <button className="fridge-sticker fridge-sticker-more" type="button" onClick={() => onOpenStorage(storage)} aria-label={`${storage} 식품 ${hidden}개 더 보기`}>
                      <span className="fridge-sticker-ring" aria-hidden="true"><span>+{hidden}</span></span>
                    </button>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="fridge-shelf-empty">비어 있어요</p>
            )}
          </section>
        );
      })}
    </nav>
  );
}
