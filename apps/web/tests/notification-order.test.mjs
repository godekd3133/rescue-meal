import assert from "node:assert/strict";
import test from "node:test";
import { orderNotifications } from "../src/notificationOrdering.ts";

const base = {
  canonical_name: "식품",
  title: "확인할 식품이 있어요",
  message: "먼저 확인해 보세요.",
  kind: "date_check",
};

function notification(id, severity, createdAt, readAt = null) {
  return { ...base, id, severity, created_at: createdAt, read_at: readAt };
}

test("orders unread notifications before read history and urgent before attention", () => {
  const rows = [
    notification("read-new", "urgent", "2026-09-18T12:00:00Z", "2026-09-18T12:05:00Z"),
    notification("unread-info", "info", "2026-09-18T11:00:00Z"),
    notification("unread-urgent", "urgent", "2026-09-17T11:00:00Z"),
    notification("unread-attention", "attention", "2026-09-18T10:00:00Z"),
  ];
  assert.deepEqual(orderNotifications(rows).map((row) => row.id), ["unread-urgent", "unread-attention", "unread-info", "read-new"]);
});

test("keeps read notification history newest-first and deterministic for equal timestamps", () => {
  const rows = [
    notification("z-read", "info", "2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z"),
    notification("a-read", "urgent", "2026-09-17T10:00:00Z", "2026-09-17T11:00:00Z"),
    notification("newer-read", "attention", "2026-09-18T10:00:00Z", "2026-09-18T11:00:00Z"),
  ];
  assert.deepEqual(orderNotifications(rows).map((row) => row.id), ["newer-read", "a-read", "z-read"]);
});
