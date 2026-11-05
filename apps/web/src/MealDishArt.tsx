import { useState } from "react";
import { imageForKnownFoodName } from "./foodPhotos";

export type MealDishKind = "bowl" | "soup" | "pan" | "plate";

/** The dish shape a recipe title names; it only picks the fallback drawing. */
export function mealDishKind(title: string): MealDishKind {
  if (/(국|찌개|탕|전골|수프|스프)/.test(title)) return "soup";
  if (/(덮밥|비빔|밥|죽|리조또)/.test(title)) return "bowl";
  if (/(볶음|구이|전$|부침|조림|스테이크|파스타)/.test(title)) return "pan";
  return "plate";
}

/** Real ingredient photos for a recipe, lead ingredient first, without repeats. */
export function mealIngredientPhotos(names: string[], limit = 3) {
  const seen = new Set<string>();
  const photos: Array<{ name: string; src: string }> = [];
  for (const name of names) {
    const src = imageForKnownFoodName(name);
    if (!src || seen.has(src)) continue;
    seen.add(src);
    photos.push({ name, src });
    if (photos.length === limit) break;
  }
  return photos;
}

function DishDrawing({ kind }: { kind: MealDishKind }) {
  // One-stroke line drawings on the card surface; no fill, no decoration.
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg className="meal-dish-drawing" viewBox="0 0 96 64" aria-hidden="true" focusable="false">
      {kind === "bowl" ? <g {...common}><path d="M18 30h60c0 15-13 25-30 25S18 45 18 30Z" /><path d="M40 55l-3 5h22l-3-5" /><path d="M30 30c2-7 8-11 14-11s10 3 12 7" /><path d="M58 22l14-12M62 25l14-10" /></g> : null}
      {kind === "soup" ? <g {...common}><path d="M20 28h56v14c0 9-7 15-16 15H36c-9 0-16-6-16-15V28Z" /><path d="M20 32h-7M76 32h7" /><path d="M16 28h64" /><path d="M38 20c-3-4 3-6 0-11M48 20c-3-4 3-6 0-11M58 20c-3-4 3-6 0-11" /></g> : null}
      {kind === "pan" ? <g {...common}><path d="M14 34h52c0 11-9 19-20 19H34c-11 0-20-8-20-19Z" /><path d="M66 38l20-6" /><path d="M30 34c1-5 4-7 7-7M44 34c1-6 5-8 9-7" /></g> : null}
      {kind === "plate" ? <g {...common}><ellipse cx="48" cy="38" rx="34" ry="14" /><ellipse cx="48" cy="36" rx="20" ry="7" /><path d="M10 14v14M14 14v14M12 28v24M84 14c-5 3-5 12 0 15v23" /></g> : null}
    </svg>
  );
}

/**
 * The picture at the top of a menu card: the lead ingredient's real photo with the next
 * ingredients as small photos. When no ingredient has a photo (or every photo fails to load),
 * a line drawing of the dish shape stands in so no card ever shows a broken image box.
 */
export function MealDishArt({ title, ingredientNames, className }: { title: string; ingredientNames: string[]; className?: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const photos = mealIngredientPhotos(ingredientNames).filter((photo) => !failed.includes(photo.src));
  const fail = (src: string) => setFailed((current) => current.includes(src) ? current : [...current, src]);
  const [lead, ...rest] = photos;
  return (
    <span className={`meal-dish-art${className ? ` ${className}` : ""}`} data-art={lead ? "photo" : mealDishKind(title)} aria-hidden="true">
      {lead ? <img className="meal-dish-lead" src={lead.src} alt="" draggable={false} loading="lazy" decoding="async" onError={() => fail(lead.src)} /> : <DishDrawing kind={mealDishKind(title)} />}
      {rest.length ? <span className="meal-dish-sides">{rest.map((photo) => <img key={photo.src} src={photo.src} alt="" draggable={false} loading="lazy" decoding="async" onError={() => fail(photo.src)} />)}</span> : null}
    </span>
  );
}
