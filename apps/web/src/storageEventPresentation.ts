import { formatQuantityAmount } from './quantityArithmetic.ts';

export function storageEventQuantityDetail(quantity: number | null, unit: string, discarded = false) {
  if (quantity === null || !Number.isFinite(quantity) || quantity <= 0) return '기록된 양을 확인할 수 없어요.';
  return `${formatQuantityAmount(quantity)}${unit} ${discarded ? '버렸어요' : '먹었어요'}`;
}
