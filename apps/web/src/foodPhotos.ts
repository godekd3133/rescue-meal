export const FOOD_IMAGES = {
  spinach: "/assets/food/spinach-photo.jpg",
  tofu: "/assets/food/tofu-photo.jpg",
  chicken: "/assets/food/chicken-photo.jpg",
  mushroom: "/assets/food/mushroom-photo.jpg",
  eggs: "/assets/food/eggs-photo.jpg",
  milk: "/assets/food/milk-photo.jpg",
  tomato: "/assets/food/tomato-photo.jpg",
  kimchi: "/assets/food/kimchi-photo.jpg",
  potato: "/assets/food/potato-photo.jpg",
  onion: "/assets/food/onion-photo.jpg",
  greenOnion: "/assets/food/green-onion-photo.jpg",
  groceries: "/assets/food/groceries-photo.jpg",
} as const;

export function imageForKnownFoodName(name: string): string | null {
  if (name.includes("김치")) return FOOD_IMAGES.kimchi;
  if (name.includes("감자")) return FOOD_IMAGES.potato;
  if (name.includes("양파")) return FOOD_IMAGES.onion;
  if (name.includes("대파") || name.includes("쪽파")) return FOOD_IMAGES.greenOnion;
  if (name.includes("시금치")) return FOOD_IMAGES.spinach;
  if (name.includes("두부")) return FOOD_IMAGES.tofu;
  if (name.includes("닭")) return FOOD_IMAGES.chicken;
  if (name.includes("버섯")) return FOOD_IMAGES.mushroom;
  if (name.includes("달걀") || name.includes("계란")) return FOOD_IMAGES.eggs;
  if (name.includes("우유")) return FOOD_IMAGES.milk;
  if (name.includes("토마토")) return FOOD_IMAGES.tomato;
  return null;
}

/** The generic path remains a payload marker; FoodPhoto renders it as a neutral placeholder. */
export function imageForFoodName(name: string) {
  return imageForKnownFoodName(name) ?? FOOD_IMAGES.groceries;
}
