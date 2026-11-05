import { expect, test, type Page } from "@playwright/test";

// The semantic colour tokens (kitchen.css) carry the whole visual language, so their pairs are
// checked directly in light, dark and prefers-contrast: more: text 4.5:1, UI boundaries 3:1.

type Pair = { fg: string; bg: string; min: number; why: string };

const PAIRS: Pair[] = [
  { fg: "--ink", bg: "--surface-1", min: 4.5, why: "body text on the page" },
  { fg: "--ink", bg: "--surface-2", min: 4.5, why: "body text on cards" },
  { fg: "--ink", bg: "--surface-3", min: 4.5, why: "neutral chip text" },
  { fg: "--ink-muted", bg: "--surface-1", min: 4.5, why: "muted text on the page" },
  { fg: "--ink-muted", bg: "--surface-2", min: 4.5, why: "muted text on cards" },
  { fg: "--ink-muted", bg: "--surface-3", min: 4.5, why: "unselected segment text" },
  { fg: "--action-ink", bg: "--action", min: 4.5, why: "primary button label" },
  { fg: "--action-text", bg: "--surface-1", min: 4.5, why: "green text action on the page" },
  { fg: "--action-text", bg: "--surface-2", min: 4.5, why: "green text action on cards" },
  { fg: "--action-text", bg: "--action-soft", min: 4.5, why: "soft action label" },
  { fg: "--action", bg: "--surface-1", min: 3, why: "primary button boundary on the page" },
  { fg: "--urgency-past-text", bg: "--surface-2", min: 4.5, why: "destructive text" },
  { fg: "#0e1813", bg: "--urgency-past", min: 4.5, why: "past chip" },
  { fg: "#0e1813", bg: "--urgency-today", min: 4.5, why: "today chip" },
  { fg: "#0e1813", bg: "--urgency-soon", min: 4.5, why: "soon chip" },
  { fg: "--ink", bg: "--notice-info", min: 4.5, why: "info notice text" },
  { fg: "--ink", bg: "--notice-caution", min: 4.5, why: "caution notice text" },
  { fg: "--ink", bg: "--notice-danger", min: 4.5, why: "danger notice text" },
  { fg: "--notice-info-accent", bg: "--notice-info", min: 3, why: "info icon" },
  { fg: "--notice-caution-accent", bg: "--notice-caution", min: 3, why: "caution icon" },
  { fg: "--notice-danger-accent", bg: "--notice-danger", min: 3, why: "danger icon" },
  { fg: "--hero-ink", bg: "--hero", min: 4.5, why: "hero text" },
  { fg: "--hero-yolk", bg: "--hero", min: 4.5, why: "hero number" },
  { fg: "--hero-ink", bg: "--nav-pill", min: 4.5, why: "active tab label" },
  { fg: "--action-ink", bg: "--action", min: 3, why: "FAB plus icon" },
  { fg: "--fab-ring", bg: "--nav-pill", min: 3, why: "FAB ring on the dark nav pill" },
];

async function readContrasts(page: Page) {
  return page.evaluate((pairs) => {
    const style = getComputedStyle(document.documentElement);
    const canvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const rgb = (value: string, under: number[] = [255, 255, 255]) => {
      canvas.clearRect(0, 0, 1, 1);
      canvas.fillStyle = `rgb(${under.join(",")})`;
      canvas.fillRect(0, 0, 1, 1);
      canvas.fillStyle = value;
      canvas.fillRect(0, 0, 1, 1);
      return Array.from(canvas.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const luminance = (channels: number[]) => {
      const [r, g, b] = channels.map((channel) => {
        const n = channel / 255;
        return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const token = (name: string) => (name.startsWith("--") ? style.getPropertyValue(name).trim() : name);
    const page = rgb(token("--surface-1"));
    return pairs.map((pair) => {
      const bgValue = token(pair.bg);
      const fgValue = token(pair.fg);
      const bg = rgb(bgValue, page);
      const fg = rgb(fgValue, bg);
      const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return { ...pair, fgValue, bgValue, ratio: (hi! + 0.05) / (lo! + 0.05) };
    });
  }, PAIRS);
}

for (const theme of ["light", "dark"] as const) {
  for (const contrast of ["no-preference", "more"] as const) {
    test(`semantic tokens meet AA in ${theme} with prefers-contrast ${contrast}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme, contrast });
      await page.addInitScript((value) => window.localStorage.setItem("rescue-meal.theme", value), theme);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
      const results = await readContrasts(page);
      for (const result of results) {
        expect(result.fgValue, `${result.fg} is defined`).not.toBe("");
        expect(result.bgValue, `${result.bg} is defined`).not.toBe("");
        expect(result.ratio, `${theme}/${contrast}: ${result.why} (${result.fg} ${result.fgValue} on ${result.bg} ${result.bgValue})`).toBeGreaterThanOrEqual(result.min);
      }
    });
  }
}

test("date badges come in exactly three shapes and only urgent buckets are coloured", async ({ page }) => {
  await page.goto("/");
  await page.locator('.app-bottom-nav [data-nav-tab="fridge"]').click();
  const chips = page.locator(".inventory-row .freshness-chip");
  await expect(chips.first()).toBeVisible();
  const readback = await chips.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      text: element.textContent ?? "",
      kind: element.getAttribute("data-date-kind"),
      bucket: [...element.classList].find((name) => /^freshness-(past|today|soon|week|later|unknown)$/.test(name))!.replace("freshness-", ""),
      borderStyle: style.borderTopStyle,
      background: style.backgroundColor,
      label: element.getAttribute("aria-label") ?? "",
    };
  }));
  const tokens = await page.evaluate(() => {
    const probe = document.createElement("span");
    document.body.append(probe);
    const resolve = (name: string) => { probe.style.backgroundColor = `var(${name})`; return getComputedStyle(probe).backgroundColor; };
    const values = { past: resolve("--urgency-past"), today: resolve("--urgency-today"), soon: resolve("--urgency-soon"), neutral: resolve("--surface-3"), card: resolve("--surface-2") };
    probe.remove();
    return values;
  });
  for (const chip of readback) {
    expect(["printed", "estimated", "unknown"], chip.text).toContain(chip.kind);
    // D-n / D-day / +n일 everywhere, never a calendar date.
    if (chip.kind !== "unknown") expect(chip.text).toMatch(/^(D-\d+|D-day|\+\d+일)$/);
    if (chip.kind === "estimated") {
      expect(chip.borderStyle, `${chip.text} estimate is dashed`).toBe("dashed");
      expect(chip.background, `${chip.text} estimate is not filled`).toBe(tokens.card);
      expect(chip.label, `${chip.text} estimate is spoken as 추정`).toMatch(/^추정/);
    }
    if (chip.kind === "printed") {
      expect(chip.borderStyle, `${chip.text} printed date is solid`).not.toBe("dashed");
      const expected = chip.bucket === "past" ? tokens.past : chip.bucket === "today" ? tokens.today : chip.bucket === "soon" ? tokens.soon : tokens.neutral;
      expect(chip.background, `${chip.text} (${chip.bucket}) fill`).toBe(expected);
    }
  }
  expect(readback.some((chip) => chip.kind === "printed")).toBe(true);
  expect(readback.some((chip) => chip.kind === "estimated")).toBe(true);
  // Green is for actions only: no later-bucket chip is drawn in leek green.
  const action = await page.evaluate(() => { const probe = document.createElement("span"); document.body.append(probe); probe.style.backgroundColor = "var(--action)"; const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; });
  for (const chip of readback) expect(chip.background).not.toBe(action);
});

test("the add button is leek green with a white plus in both themes", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.addInitScript((value) => window.localStorage.setItem("rescue-meal.theme", value), theme);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-rescue-theme", theme);
    const add = page.locator(".app-bottom-nav .app-bottom-nav-add");
    await expect(add).toHaveCSS("background-color", theme === "light" ? "rgb(27, 108, 66)" : "rgb(35, 122, 75)");
    await expect(add).toHaveCSS("color", "rgb(255, 255, 255)");
  }
});
