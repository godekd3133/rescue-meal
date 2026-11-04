/** Calculate the space needed below inventory without counting its previous spacer. */
export function requiredInventoryTailSpace(input: {
  desiredTop: number;
  scrollHeight: number;
  clientHeight: number;
  currentTailSpace: number;
}) {
  const maxWithoutTail = Math.max(0, input.scrollHeight - input.clientHeight - input.currentTailSpace);
  return Math.ceil(Math.max(0, input.desiredTop - maxWithoutTail));
}
