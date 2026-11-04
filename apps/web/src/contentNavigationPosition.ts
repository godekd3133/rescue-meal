export function contentNavigationPosition(input: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  viewportTop: number;
  viewportHeight: number;
  inventoryTop: number;
}): "home" | "food" {
  if (input.scrollTop <= 1) return "home";
  const scale = input.clientHeight > 0 ? input.viewportHeight / input.clientHeight : 1;
  const threshold = input.viewportTop + Math.min(input.viewportHeight * 0.42, 360 * scale);
  const atBottom = input.scrollTop >= input.scrollHeight - input.clientHeight - 8;
  return input.inventoryTop <= threshold || atBottom ? "food" : "home";
}
