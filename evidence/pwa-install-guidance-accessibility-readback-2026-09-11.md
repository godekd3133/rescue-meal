# PWA install guidance accessibility readback — 2026-09-11

## Scope

Expose the iOS Add to Home Screen instruction state to assistive technology while preserving the existing compact install prompt and user-controlled dismissal.

## Change

- The iOS `설치 방법` action now exposes `aria-expanded`.
- The action points to the conditional instruction copy through `aria-controls="install-prompt-steps"`.
- The instruction copy has a stable ID and `role="note"`.
- The guidance remains user-triggered; opening it does not navigate or force installation.

## Readback

- iPhone Safari user-agent simulation at `393 x 852` rendered the prompt with `aria-expanded=false`.
- Clicking `설치 방법` changed the same button to `aria-expanded=true` and exposed the linked note.
- Clicking `닫기` restored `aria-expanded=false` and removed the note from the DOM.
- Focused iOS guidance regression: **1 passed**.
- Production build: **passed**, protected runtime **28 files**, Vite **759 modules**.
- Existing iPhone prompt capture remains accepted at `evidence/design-qa-2026-09-11/native/native-ios-install-prompt.png`.

## Limits

This verifies the DOM accessibility state and user-agent simulation. Actual Safari spoken output, VoiceOver rotor behavior, and Add to Home Screen on a physical iPhone remain device acceptance gates.
