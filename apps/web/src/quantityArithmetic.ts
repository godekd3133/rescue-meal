/** Work from decimal API values without introducing binary subtraction leftovers. */
function decimalParts(value: number) {
  const [coefficient, exponent = "0"] = String(value).split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
}

export function subtractQuantity(available: number, used: number): number {
  if (!Number.isFinite(available) || !Number.isFinite(used)) return available - used;
  const left = decimalParts(available);
  const right = decimalParts(used);
  const scale = Math.max(0, left.scale, right.scale);
  const difference = left.digits * 10n ** BigInt(scale - left.scale)
    - right.digits * 10n ** BigInt(scale - right.scale);
  return Number(`${difference}e-${scale}`);
}

export function formatQuantityAmount(value: number): string {
  return value.toLocaleString("ko-KR", { maximumSignificantDigits: 21 });
}

export function sumQuantities(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total = subtractQuantity(total, -value);
  return total;
}

export function multiplyQuantity(value: number, factor: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(factor)) return value * factor;
  const left = decimalParts(value);
  const right = decimalParts(factor);
  return Number(`${left.digits * right.digits}e${-(left.scale + right.scale)}`);
}
