import { expect, test, type Page } from "@playwright/test";

type PushFixture = {
  initialPermission: "default" | "granted" | "denied";
  requestedPermission: "granted" | "denied";
};

async function mockAccountAndPushApi(page: Page, fixture: PushFixture) {
  let pushPayload: Record<string, unknown> | null = null;
  await page.addInitScript(({ initialPermission, requestedPermission }) => {
    let activeSubscription: { toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } }; endpoint: string; unsubscribe: () => Promise<boolean> } | null = null;
    let currentPermission = initialPermission;
    const pushSubscription = {
      endpoint: "https://push.example.test/rescue-meal/device-1",
      toJSON: () => ({
        endpoint: "https://push.example.test/rescue-meal/device-1",
        keys: { p256dh: "p256dh-fixture", auth: "auth-fixture" },
      }),
      unsubscribe: async () => {
        activeSubscription = null;
        return true;
      },
    };
    const pushManager = {
      getSubscription: async () => activeSubscription,
      subscribe: async () => {
        activeSubscription = pushSubscription;
        return pushSubscription;
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) },
    });
    Object.defineProperty(window, "PushManager", { configurable: true, value: function PushManager() {} });
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: {
        get permission() { return currentPermission; },
        requestPermission: async () => {
          currentPermission = requestedPermission;
          return currentPermission;
        },
      },
    });
  }, fixture);
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ mode: "account", user_id: "push-account", email: "push@example.com", workspace_id: "push-workspace", role: "user" }) });
  });
  await page.route("**/api/notification-preferences", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ in_app_enabled: true, push_enabled: false, lead_days: 2, timezone: "Asia/Seoul", quiet_hours_start: null, quiet_hours_end: null }) });
  });
  await page.route("**/api/integrations/notifications/worker/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/push/subscriptions**", async (route) => {
    if (route.request().method() === "PUT") {
      pushPayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ endpoint_fingerprint: "2ec21fbd906261f6", created_at: "2026-09-03T12:00:00Z", updated_at: "2026-09-03T12:00:00Z" }) });
      return;
    }
    if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ endpoint_fingerprint: "2ec21fbd906261f6", removed: true }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });
  return () => pushPayload;
}

test.describe("Web Push browser integration", () => {
test.skip(!process.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY, "requires VITE_WEB_PUSH_VAPID_PUBLIC_KEY fixture");

test("Web Push asks for permission, registers the subscription, and supports revocation", async ({ page }) => {
  const getPushPayload = await mockAccountAndPushApi(page, { initialPermission: "default", requestedPermission: "granted" });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const panel = page.getByRole("region", { name: "알림 설정" });
  await expect(panel.getByRole("button", { name: "이 기기에서 푸시 연결" })).toBeEnabled();
  await panel.getByRole("button", { name: "이 기기에서 푸시 연결" }).click();

  await expect(panel.getByRole("status")).toHaveText("이 기기를 푸시 알림 기기로 연결했어요");
  expect(getPushPayload()).toMatchObject({ endpoint: "https://push.example.test/rescue-meal/device-1", p256dh: "p256dh-fixture", auth: "auth-fixture" });
  await expect(panel.getByRole("switch", { name: "푸시 알림" })).toHaveAttribute("aria-checked", "true");

  await panel.getByRole("button", { name: "연결 해지" }).click();
  await expect(panel.getByRole("status")).toHaveText("푸시 알림 기기 연결을 해지했어요");
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).pushManager.getSubscription())).toBeNull();
});

test("Web Push stops before subscription when notification permission is denied", async ({ page }) => {
  const getPushPayload = await mockAccountAndPushApi(page, { initialPermission: "default", requestedPermission: "denied" });

  await page.goto("/");
  await expect(page.locator(".connection-pill")).toHaveText("서버 연결됨");
  await page.locator(".connection-pill").click();
  const panel = page.getByRole("region", { name: "알림 설정" });
  await panel.getByRole("button", { name: "이 기기에서 푸시 연결" }).click();

  await expect(panel.getByRole("alert")).toContainText("알림 권한이 허용되지 않아 연결하지 못했어요");
  expect(getPushPayload()).toBeNull();
});
});
