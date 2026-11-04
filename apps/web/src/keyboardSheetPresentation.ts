/** Fit app-owned sheets between the status area and the simulated keyboard. */
export function keyboardSafeSheetSnap(snap: number | undefined, screenHeight: number, safeTop: number, keyboardHeight: number, bottomInset: number) {
  // BottomSheet subtracts up to 180px from its requested height when typing.
  const maximumRequestedHeight = screenHeight - safeTop - bottomInset + Math.min(keyboardHeight, 180);
  const desiredSnap = snap ?? 0.72;
  const boundedSnap = Math.min(desiredSnap, maximumRequestedHeight / screenHeight);
  return keyboardHeight <= 0 && boundedSnap === desiredSnap ? snap : boundedSnap;
}
