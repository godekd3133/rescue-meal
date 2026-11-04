import { parseDisplayQuantity } from './quantitySelection.ts';

type QuantityFood = { quantity: string; quantityUnit?: string };

export function quantityReferenceUnit(food: QuantityFood): string | null {
  const unit = food.quantityUnit || parseDisplayQuantity(food.quantity)?.unit;
  return unit && !/^(g|kg|ml|l|그램|킬로그램|밀리리터|리터)$/i.test(unit) ? unit : null;
}

export function quantityReferenceRecoveryLabel(food: QuantityFood & { name: string }): string {
  const unit = quantityReferenceUnit(food);
  return unit ? `${food.name} 1${unit}의 양 입력` : `${food.name} 수량 확인`;
}
