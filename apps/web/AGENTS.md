# Mobile Prototype Agent Guide

## Prototype Instructions

In ChatGPT Work Mode, run `sites-preview start "$PWD"`, open `http://terminal.local:4173/` in the cloud browser, and verify the rendered app and its primary interactions. Keep that preview open and tell the user to inspect it in the cloud browser; do not present the local URL as a user-facing chat link. In Codex Desktop, run the local server yourself, open the preview in the in-app browser, and provide the clickable local URL. Do not deploy to Sites unless the user explicitly asks to share, publish, or deploy. Do not give the user server-start instructions when you can run it.

Before planning or implementing any mobile-app change, read this `AGENTS.md` in full. It is the source of truth for the template's runtime and component guidance.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Editing Boundary

- Build app-specific UI in `src/Prototype.tsx` (app shell: state, data, sheets, tab switching), tab screens in `src/screens/*` (`HomeScreen`, `FridgeScreen`, `ScreenHeader`, `TabSheetScreen`, `MeThemeRow`, …, with state and handlers passed down as props), and feature components next to them in `src/`. Put new styles in a feature CSS file (`src/screens.css`, `src/kitchen.css`, `src/rescueDeck.css`, …) using the kitchen tokens; `src/prototype.css` is the legacy layer and should not grow.
- Treat `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/mobile/`, `public/assets/iphone/`, `public/assets/android/`, `public/assets/status/`, `vite.config.ts`, `worker/index.js`, and `scripts/prepare-sites-build.mjs` as protected runtime files. Do not edit, replace, remove, or recreate them unless the user explicitly asks to change the mobile runtime itself. For an explicit runtime change, update the affected lock hashes only after verifying the new runtime behavior.
- Run `npm run check:runtime` before preview or handoff. If it fails, restore the protected runtime instead of weakening or bypassing the check.
- `npm run build` preserves the mobile runtime and prepares the static Cloudflare Worker output required by Sites. Before a Sites handoff, confirm `dist/client/index.html`, `dist/server/index.js`, `dist/.openai/hosting.json`, and source `.openai/hosting.json` exist, then run `npm run test:sites`. Do not replace this project with a Vinext starter.

## Runtime Contract

- Preserve the mobile device runtime unless the user's task explicitly asks otherwise. Do not replace it with a standalone page. Visual fidelity applies to app-owned content inside the device screen, not to template-owned device chrome.
- Keep `App` composed around `PhoneFrame` -> `KeyboardProvider`, with `StatusBar`, app content, `HomeIndicator`, and `KeyboardDock` mounted inside the phone frame. `StatusBar` and the iOS home indicator are overlaid device chrome. When the Android keyboard is closed, the app viewport reserves the protected navigation-bar region instead of painting behind it. When the Android keyboard is open, preserve the current full-screen keyboard layout: its asset includes the IME navigation strip and the separate black navigation bar is hidden. iOS screens continue to paint behind the home-indicator area and own their safe-area content padding.
- Preserve the `iPhone` / `Pixel 10` device picker and both calibrated device presets. The Pixel screen is `427 x 952`; its `32 x 32` camera circle and `public/assets/android/navigation-bar.svg` bottom navigation bar are protected device chrome, not app content.
- Preserve the device picker's intentionally lightweight Codex styling in the top-right corner: its trigger wrapper is borderless and transparent, its trigger sizes to content, and its right-aligned menu uses the compact 3px inset plus the specified hairline and elevation shadow layers. Keep the prototype root and default app screen white.
- Preserve `StatusBar` as live device chrome, including its platform-specific typography, source status-icon assets, and spacing. Pixel 10 uses Roboto, Android indicators, and 32px top, left, and right padding. iPhone uses its iOS indicators, system typography, and calibrated spacing. Do not hardcode screenshot times like `9:41` into the status bar, replace its real-time clock, or move status bar content into app markup unless the user explicitly asks for a fixed/mock device time.
- `PhoneFrame` owns the calibrated device frame, screen portal, device picker, camera cutout, and custom cursor. Keep device assets in `public/assets/iphone/` and `public/assets/android/`; if an asset fails to load, repair the asset path or restore the asset instead of removing the frame, keyboard, or image render.
- Use `MobileScroll` directly for simple single-screen prototypes. Use `FlowStack` for conventional multi-screen flows whose routes can own their fixed header and footer; when using it, define each route as a `FlowScreen`: `{ id, header?, headerHeight?, footer?, footerHeight?, render }`, and use `flow.push(screen)`, `flow.pop()`, and `flow.replace(screen)` from `FlowStack` render callbacks or `useFlow()` instead of introducing another router.
- Use `Carousel` for a carousel, horizontal rail, swipeable cards, image or media strip, horizontally scrollable cards, chip rail, or other horizontal collection.
- For a layered app shell—such as a persistent composer, independently presented sheet, pushed/peek sidebar, or app-wide transition—compose directly in `Prototype.tsx` rather than forcing it through `FlowStack`. Keep app-owned fixed chrome as sibling layers outside `MobileScroll`.
- When using `FlowScreen`, put route-owned fixed headers or footers in `FlowScreen.header` or `FlowScreen.footer`. Set `headerHeight` to the visible app-toolbar height; `FlowStack` adds the device's top safe-area/status-bar inset automatically. Do not include `StatusBar` or its height in the header. Set `footerHeight` to the full app-footer height. `FlowScreen.footer` is an overlay, not reserved layout space; screens using it must add their own bottom content padding such as `padding-bottom: calc(var(--flow-footer-height) + var(--mobile-safe-area-height) + 24px)` so final content can scroll above the footer while still painting behind it.
- Render only scrollable content inside `MobileScroll`; it is for content that should move with scroll and rubber-band overscroll. Keep app-owned headers, nav bars, tabs, composers, and overlays outside it. This keeps scroll physics, safe areas, keyboard insets, scrollbars, and drag click suppression active without letting content paint under fixed chrome.
- Buttons, links, cards, and images inside `MobileScroll` should still allow drag scrolling when the pointer moves beyond tap slop. Use `data-scroll-drag="ignore"` only for rare controls that must own the drag gesture themselves.
- Do not add `var(--keyboard-height)` to ordinary screen/content padding inside `MobileScroll`; the scroll viewport already shrinks above the simulated keyboard. For custom fixed composers, search bars, or toast chrome, use `useKeyboardInsets().bottomInset`. It is relative to the app viewport: Android returns `0` while the closed-keyboard viewport already reserves navigation, then returns the keyboard height while open; iOS continues to clear the home indicator while closed and ride directly above the keyboard while open. Do not pin custom bottom chrome to `bottom: 0` or only `keyboardHeight`.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for every text-entry control. A raw `input` or `textarea` disconnects focus, keyboard animation, safe-area insets, and attached surfaces.
- Use `BottomSheet` for phone-scoped sheets. Its props are `open`, `onOpenChange`, `title`, optional `description`, optional `snap`, and `children`; it renders through the phone screen portal and dismisses the keyboard before opening.

## Horizontal Carousels

- Use `Carousel` for horizontally draggable cards, images, media, chips, or other horizontal collections. Do not recreate these with `overflow-x`, custom pointer handlers, or a generic div.
- `Carousel` can be nested directly inside `MobileScroll`. It owns horizontal gestures and automatically yields vertical gestures to the parent.
- Never put `data-scroll-drag="ignore"` on or around a `Carousel`; doing so prevents vertical parent scrolling when a gesture begins inside it.
- Do not add CSS scroll snapping to `Carousel`; its runtime owns momentum and release motion.
- Use `data-scroll-drag="ignore"` only when a control must prevent parent scrolling in every drag direction.

See `src/mobile/COMPONENTS.md` for the full component and gesture contract.

## Keyboard Rule

The simulated keyboard is a separate top-layer component. Before presenting anything that behaves like iOS navigation or modal UI, dismiss it first.

Call `keyboard.hide()` before:

- pushing, popping, or replacing FlowStack routes
- opening bottom sheets, action sheets, dialogs, menus, or navigation sheets
- starting transitions where the destination should not inherit text-input focus

`FlowStack` already hides the keyboard for `push`, `pop`, and `replace`. `BottomSheet` already hides it before opening. If you add new modal/sheet/navigation primitives, follow the same rule.

When a composer, search surface, or other keyboard-attached component closes, call `keyboard.hide()` in the same event before changing that component's open state. Position attached surfaces from `useKeyboardInsets()` rather than a separate timer or visibility flag so both dismiss together.

When any text-entry control loses focus, dismiss the simulated keyboard. If the control is custom or does not use the runtime's keyboard-aware fields, handle its blur event and call `keyboard.hide()` explicitly. Keep the keyboard open only when focus is moving directly to another text-entry control that should share the same keyboard session.

## Interaction Rules

- Do not trigger buttons or inputs after a pointer has become a drag. Preserve the drag suppression behavior in `MobileScroll`.
- Do not allow native browser image/file dragging inside the phone frame. Preserve the phone-level `dragstart` suppression and non-draggable image styles so scroll drags that begin on images still scroll the prototype.
- Programmatic reveals must scroll the nearest app-owned region (`MobileScroll` or the active sheet content), never the protected device screen; keep the phone frame and its fixed chrome stationary.
- Use `KeyboardInput`, `KeyboardTextarea`, or `MobileTextField` for text entry so the simulated keyboard and safe-area insets stay connected.
- Fixed phone chrome should not animate with pushed screens. Screen content can animate; the status bar, camera cutout, and preview chrome should stay put.
- Keep the keyboard below the home indicator/safe area layer in z-index, and above ordinary app UI while visible.
- Keep the home indicator as the topmost safe-area layer in the z-index above everything else in the prototype.

## Information architecture (2026-11 IA overhaul)

- Bottom bar: `홈 · 냉장고 · ( + ) · 식단 · 장보기`. Tabs are real screens: one `MobileScroll` holds a `[data-tab-panel]` per visited tab, inactive panels stay mounted but `hidden`, and each tab keeps its own scroll position (`selectTab` in `Prototype.tsx`). The header row (tab title, bell, `나`) and the bottom bar never take part in the tab entrance motion.
- `홈`: green hero with `오늘 살펴볼 n` (past/today/within-three-days foods) and `이번 주 구한 음식 n` (distinct foods eaten in the last 7 days: `GET /api/rescue-summary` when an API is configured, a local log in demo mode; only rescues are counted, discards are never shown), the `RescueDeck`, one line per storage place (`home-shelves`, empty storages collapse) and one action (`오늘 뭐 먹지` → 식단 tab). With nothing urgent there is no giant `0개`: the hero says so and `이번 주 먼저 볼 것` lists the next foods. An empty workspace shows a single add action.
- `냉장고`: search with a single clear button, storage chips (`보관 위치 필터`) and status filters, the full inventory list; tapping a row opens the food detail sheet.
- `식단` and `장보기` are full screens (`MealPlanSheet presentation="screen"`, `ShoppingListSheet` inside `TabSheetScreen`), labelled regions `오늘의 식단` / `장보기 목록`, not dialogs. Their wrapper keeps the `bottom-sheet`/`sheet-content` classes for the shared visual system; use `nearestScrollContainer` (`src/appScroll.ts`) rather than `.closest(".sheet-content")` when scrolling inside them.
- `나` (the avatar at the top right of every tab, class `connection-pill`) opens the account sheet: theme, account, notification settings (their only entry point; the notification center no longer links to settings) and advanced settings such as the inventory-app (Grocy) connection.
- The add sheet opens on quick add (food chips plus a one-line entry); the photo (receipt, barcode, label) and manual methods are one tap away from there.
- A date typed in manual entry is not saved until its meaning (printed use-by, best-before, personal reminder, …) is chosen.
- After a receipt or quick-add save, the app leads through date checks for the foods just added, one food at a time.
- Sheets are only for quick tasks: add (`+`), food detail, date check, amount eaten, guidance, notifications and `나`. Generic add entry points call `openAdd()` so they get the add sheet's default first view.

## Motion

- All entrance and transition motion lives in `src/motion.css` and only runs under `prefers-reduced-motion: no-preference`. Home opens like a fridge door (panel curtain, `RevealText` letter-by-letter headline, `CountUp` number, cards dealt from the right); buttons and headings wipe in left to right; sheet content rises in order after the sheet spring; tab changes pop the nav pill and give the incoming screen a short rise (`playScreenEntrance`, motion-gated); the Home headline replays when Home is shown again.
- Use `animation-fill-mode: backwards` (never `both`/`forwards`) so clip paths and transforms never linger after an entrance. Generic rules sit in `:where()` so a component's own animation wins.
- Entrance motion is keyed off `html[data-motion="on"]`, which `RevealText.tsx` sets only when `navigator.webdriver` is false, so UI suites measure settled layout exactly as before; `tests/motion.spec.ts` opts back in and checks the choreography.

## Current product visual direction

- Example foods belong to the explicit demo preview. New guest and account record spaces start empty; a configured API must not show demo food while waiting for personal records. Preserve existing saved records and owner-scoped offline snapshots. Background workspace refreshes must not invent a device or food-change attribution.

- Do not join visible metadata with bullet or middle-dot separators. Lay out status, period, quantity, storage, and provenance as separate fields, lines, or controls with spacing. Avoid obvious or repeated explanatory copy; retain material date meaning, safety, storage mismatch, unsaved-state, and persistence information where the relevant action happens.

- The selected direction (user-requested "디자인 대격변", 2026-11) is **Inside the fridge**: Home opens on a deep leek-green panel (`--kitchen-hero`) holding today's count in Jua (yolk `--kitchen-yolk`), the week's rescued count and a `Carousel` of food photo cards (`RescueDeck`); the rest of the app is a cool paper surface (`--fresh-bg`) with leek-green actions (`--fresh-primary-strong`). Tomato/orange/yolk only mean "how soon to look at this". There is no blue accent any more: `kitchen.css` re-points the legacy `--atelier-*`, `--sheet-*` and `--meal-*` tokens at the kitchen palette with a tripled theme selector so it wins over `prototype.css`. The bottom bar floats as a dark pill with a centre yolk `+` (aria-label `식품 추가하기`) that replaces the old home add button.
- Rescue deck quick actions: foods without a date question offer `먹었어요` (a second tap within 4s confirms `다 먹음`) and `요리`; foods whose printed date passed or needs review only offer `날짜 확인` — never record eating them in one tap.
- Durable product feedback: use natural, consumer-friendly copy and authentic food photography. Do not use AI-esque copy, synthetic-looking food imagery, or isolated synthetic food cutouts. Preserve food safety and date semantics.
- Estimated use-first dates are ordering hints, not deadlines or expiry dates. Use `우선순위 참고` / `먼저 살펴볼 시점` language; do not frame estimates as `...까지 먼저 먹기`. Keep printed and user-confirmed dates clearly distinct.
- Home food rows state what the date means and where it came from, then give one short, concrete thing to do, such as `날짜 확인` or `보관 확인`. Keep the reason beside the food details and avoid repeated status labels.
- Keep Home's counts scoped and separate from the all-inventory review count. Show every review-required food in the home safety summary (`trust-card`) and open that summary directly to the 냉장고 tab's filtered review list.
- In the needs-review pantry filter, keep a compact check order (printed date, storage/opened state, and food/package condition) beside the flagged rows and link to the full guidance; use neutral information styling and never imply the app judges safety.
- When connected meal planning shows unknown allergen metadata, offer a contextual way to open allergen preferences without saving. Preference changes only apply after the user explicitly chooses `식단 조건 저장`; guest mode must not show a nonfunctional settings action.
- Planner option refreshes must preserve unsaved allergen selections within the same workspace. If saved preferences cannot be read, keep editing and saving disabled until a successful retry; never treat an unknown read as an empty preference set.
- Use licensed real-food photographs under `public/assets/food/` and the existing icon library; do not replace visible imagery with CSS or text approximations. Current local photo sources and photographer credits are tracked in `public/assets/food/README.md`.
- The product-wide visual system applies consistently to Home, intake/review, food detail, meal plan, shopping list, notifications, guidance, account, and recipe-review sheets. Preserve the existing safety copy and state semantics while improving hierarchy, spacing, touch targets, and recovery affordances.
- The AddFoodSheet header description follows the selected source: receipt copy explains checking extracted items and quantities; barcode copy explains confirming product information and storage; label copy keeps the date-meaning safety boundary; manual-entry copy must not imply a purchase record.
- Keep the three-step input/review/save rail only for receipt, barcode, and label methods. Direct manual entry is one editable form and saves from its add action; do not imply another screen there. Before saving, show the exact food name, any suggested brand, quantity, and storage beside the action in readable text, linked to the button. Keep product information clearly marked as a reference.
- In receipt review, keep product names ahead of secondary controls: original-receipt navigation sits on its own row, with a 44px minimum touch target and the selected accent. Zoom centers on the selected read area; taps on the receipt stay connected to that area. Receipt highlighting stays separate from save selection: an unchecked row may still stay highlighted, but only selected rows are saved. Keep each row's wording consistent after it is read. The save note names the items that still need attention and says dates from receipts are not recorded as consumption dates; keep it at 12px and linked to the save button. Buttons that move to an item needing correction use a 44px target and focus that field.
- Switching input-method tabs within the same AddFood sheet must preserve an in-progress receipt review, including line edits, selections, safe source observations, and the ephemeral preview. Keep it memory-only: explicit receipt replacement or sheet close can discard it, and do not persist raw photo bytes across reload.
- Keep mobile capture-choice labels concise enough to stay readable beside the camera action. For receipt intake, show `사진·PDF 선택` as one label rather than a second tiny PDF badge that wraps.
- Product-information lookup controls in receipt review remain secondary actions: use a neutral raised surface and at least 44px targets, reserving accent emphasis for hover/focus and required review/commit actions; do not leave a white tile in dark mode.
- Barcode candidates and parsed dates must stay bound to the current input: editing the code clears prior results and invalidates pending lookups. Keep a completed lookup in the same intake session across tabs; in demo mode, only the explicit example code may return the sample product.
- Use an information/warning icon for barcode no-match and recovery states; reserve check icons for a matched candidate or completed confirmation.
- Food detail is responsive to the live phone viewport: tall iPhone sheets keep the primary and destructive actions above the home-indicator boundary, while `max-width: 360px` tightens only repeated supporting-card rhythm. Preserve the 44px action hit boxes and keep destructive actions visually secondary.
- In Food Detail, do not reserve a second disabled `변경 없음` button when there are no saved-state edits. Let the only actionable record control use the full row and keep the explanation below; reveal `변경 저장` only when a storable change exists.
- Keep the safety boundary beside date-gated consume recording readable at mobile size (12px minimum for its explanatory text); do not reduce critical action guidance to tiny helper text.
- At common narrow mobile widths up to 420px, place the printed-date recheck action below the date warning copy so the explanation is not squeezed into a side column. Keep that explanation at 12px and the action at least 44px high.
- A completed label/date review remains in memory while the user checks another intake method, preserving its date meaning and explicit lot target when they return. Retaking or closing the sheet may discard it; do not persist raw label photos across reload.
- When a label result is present, foreground the date meaning and which 식품 기록 will change. Keep a persistent 12px `저장할 내용` note beside the save button with the date, new or existing food and quantity, and storage, linked to the button even when the keyboard is closed. If the date meaning is missing, keep the number and ask which label it names; do not guess. Collapse retake instructions/actions behind a clear 44px `다른 라벨로 다시 읽기` disclosure.
