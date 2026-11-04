export function accountRevisionStatus(previous: number | null, observed: number, ownMutation: number | null) {
  const baseline = Math.max(previous ?? observed, ownMutation ?? 0);
  return {
    revision: Math.max(baseline, observed),
    needsRefresh: previous !== null && observed > baseline,
  };
}
