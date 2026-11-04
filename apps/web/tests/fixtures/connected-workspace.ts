import { expect, test as baseTest } from "@playwright/test";

// Legacy interaction cases opt into examples explicitly. Personal-workspace
// onboarding cases disable this fixture and exercise the real empty API state.
export const test = baseTest.extend<{ exampleInventory: boolean; frozenNow: string | null }>({
  exampleInventory: [true, { option: true }],
  // The seeded examples and route fixtures carry fixed September 2026 dates. Pin
  // the browser clock so date-review copy cannot drift with the wall clock.
  frozenNow: ["2026-09-10T10:00:00+09:00", { option: true }],
  page: async ({ page, exampleInventory, frozenNow }, use) => {
    if (frozenNow) await page.clock.setFixedTime(new Date(frozenNow));
    if (exampleInventory) {
      await page.route("**/api/auth/guest", async (route) => {
        const response = await route.fetch();
        if (response.ok()) {
          const session = await response.json();
          const seeded = await page.request.post(new URL("/__e2e/workspace/examples", response.url()).toString(), {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          expect(seeded.ok(), "Explicit disposable examples must be provisioned before dashboard reads").toBe(true);
        }
        await route.fulfill({ response });
      });
    }
    await use(page);
  },
});

