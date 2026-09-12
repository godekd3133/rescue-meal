# Android Pixel preview readback — 2026-09-11

## Scope

Confirm that the app-owned bottom navigation respects the Android preview runtime's already-reserved navigation-bar viewport instead of reserving the same safe area a second time.

## Root cause

The Android mobile-app-viewport already ends at the top of the 48px system navigation bar. The app navigation still used bottom: var(--device-safe-area-bottom), leaving a second 48px gap above the Android bar.

## Change

- Scoped .app-shell-preview .mobile-app-viewport[data-platform="android"] .app-bottom-nav { bottom: 0; }.
- iPhone/native safe-area positioning remains unchanged.
- Added a Playwright regression for Pixel device selection and viewport-edge placement.

## Readback

- Pixel screen: 427x952.
- Android app viewport bottom: 1028px.
- Android navigation top: 1029px.
- App bottom navigation: top=950px, bottom=1028px.
- Device state: pixel-10.
- Console/page errors: 0.
- Pixel edge regression: 1 passed.
- Production build: passed, protected runtime 28 files, Vite 760 modules.
- Accepted capture: evidence/design-qa-2026-09-11/pixel-touch-target-home.png.
- Pixel meal sheet capture: evidence/design-qa-2026-09-11/pixel-meal-sheet.png.
- Pixel meal sheet bottom and app viewport bottom both measured `1028px`; Android navigation top measured `1029px`; sheet content reserved `67px` bottom padding.

## Limits

This proves the desktop Pixel simulator geometry. Physical Android gesture navigation modes, OEM insets, and real Android device rendering remain device acceptance gates.
