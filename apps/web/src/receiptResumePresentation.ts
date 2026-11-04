export function receiptResumeDisposition(draft: { status: string; stock_created: boolean } | null) {
  if (draft?.stock_created) return "saved" as const;
  return draft?.status === "review_required" ? "review" as const : "unavailable" as const;
}
