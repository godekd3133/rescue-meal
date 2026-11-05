import type { QuickAddStorage } from "./quickAddParse.ts";

export type QuickAddSaveItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  storage: QuickAddStorage;
};

export type QuickAddFailure = { id: string; message: string; uncertain: boolean };

export type QuickAddSaveResult = {
  /** Staged ids that are now saved. */
  savedIds: string[];
  failed: QuickAddFailure[];
};

export type QuickAddFailureClass = { message: string; uncertain: boolean; stop: boolean };

function hashText(text: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Stable per staged food and its current contents: retrying the same food after an
 * unknown result replays instead of duplicating, while an edited food gets a new key.
 */
export function quickAddIdempotencyKey(item: QuickAddSaveItem) {
  return `quick-add:${item.id}:${hashText(`${item.name}|${item.amount}|${item.unit}|${item.storage}`)}`;
}

/**
 * Saves staged foods one by one through the single-food create API. One failure does
 * not hide the others: every food ends as saved or failed with its own message. Errors
 * that will fail every remaining food (sign-in, workspace change) stop the batch early.
 */
export async function saveQuickAddSequentially<I extends QuickAddSaveItem, T>(
  items: ReadonlyArray<I>,
  create: (item: I) => Promise<T | null | undefined>,
  classify: (reason: unknown) => QuickAddFailureClass,
  isCurrent: () => boolean = () => true,
): Promise<{ saved: Array<{ id: string; value: T }>; failed: QuickAddFailure[] }> {
  const saved: Array<{ id: string; value: T }> = [];
  const failed: QuickAddFailure[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!isCurrent()) {
      items.slice(index).forEach((rest) => failed.push({ id: rest.id, message: "기록 공간이 바뀌어 저장하지 않았어요.", uncertain: false }));
      break;
    }
    try {
      const value = await create(item);
      if (value === null || value === undefined) throw new Error("quick-add-empty-response");
      saved.push({ id: item.id, value });
    } catch (reason) {
      const failure = classify(reason);
      failed.push({ id: item.id, message: failure.message, uncertain: failure.uncertain });
      if (failure.stop) {
        items.slice(index + 1).forEach((rest) => failed.push({ id: rest.id, message: failure.message, uncertain: false }));
        break;
      }
    }
  }
  return { saved, failed };
}

export function quickAddSaveSummary(savedCount: number, failedCount: number) {
  if (!failedCount) return `식품 ${savedCount}개를 넣었어요.`;
  if (!savedCount) return `식품 ${failedCount}개를 넣지 못했어요.`;
  return `식품 ${savedCount}개를 넣었고 ${failedCount}개는 넣지 못했어요.`;
}
