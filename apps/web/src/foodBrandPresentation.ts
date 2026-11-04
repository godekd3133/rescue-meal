const placeholderBrands = new Set(["직접 추가한 식품", "장보기에서 추가한 식품"]);

export function displayFoodBrand(brand: string) {
  const value = brand.trim();
  return placeholderBrands.has(value) ? "" : value;
}

export function foodIdentityParts(brand: string, purchaseSource?: "shopping_list" | "receipt") {
  const source = purchaseSource === "shopping_list" ? "장보기" : purchaseSource === "receipt" ? "영수증" : "";
  return [displayFoodBrand(brand), source].filter(Boolean);
}

export function productInfoDraftChanged(
  original: { name: string; brand: string; category: string },
  draft: { name: string; brand: string; category: string },
) {
  return draft.name.trim() !== original.name.trim()
    || draft.brand.trim() !== displayFoodBrand(original.brand)
    || draft.category.trim() !== original.category.trim();
}
