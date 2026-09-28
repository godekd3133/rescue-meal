# Label image read failure and recovery — 2026-09-24

## Scope

Isolated dark-mode local demo at `320×740`: Home → spinach detail → printed-date recheck → choose a local food photo to exercise the unreadable-label failure → open direct-entry fallback → close without saving. The image was a local fixture; no dynamic/API request, date correction, food addition, storage change, or consumption record was made.

## Flow readback

1. **Home and detail — unchanged.** Home showed seven foods. Spinach detail showed the printed date `2026.09.02` and the existing date-review reason. See `01-home.png` and `03-detail-after-close.png`.
2. **Failure and recovery — improved.** Before the error callout was moved ahead of the photo preview, the recovery control was below the first fold (around y=1073) and only 28px tall. It now appears before photo actions/preview, with a full-width 44px `직접 입력으로 계속` control. The first recovery layout still placed the label instruction too close to the sticky header; see intermediate `02-error-recovery-320-after.png`.
3. **Panel-based scroll and focus — improved.** The failure effect now scrolls the whole error callout into view, then focuses its recovery action. At 320×740, the heading begins at y=260.7 below the sheet header bottom at y=228; the focused 44px action spans y=497.1–541.1. See `05-error-recovery-320-after-panel-anchor.png`.
4. **Fallback and return — healthy.** Direct entry states `기존 시금치 날짜는 그대로예요` and explains that another input method adds a new food; it offers `라벨 날짜 확인으로 돌아가기`. Closing the sheet without entering or saving returned to the same spinach date. Closing detail returned Home to seven foods with spinach still refrigerated and the original printed date. See `04-home-after-no-save.png`.

## Evidence limits

- The unreadable image path was tested using a local fixture. Real package photography, device file-picker behavior, camera permission, OCR accuracy, server persistence, VoiceOver/TalkBack, and physical-device layout remain unverified.
- A React hook dependency-length message appeared in the pre-reload hot-reload console session. It did not recur after a full page navigation and reopening detail; the cause of the earlier log is not confirmed. The fresh interaction produced no new JavaScript errors; a mobile-web-app-capable metadata deprecation warning remains.
- The focused regression assertion for heading/header separation, 44px target size, focus, and unchanged date was added but automated UI tests were not run by preference.
- `npm run check:runtime` passed (28 protected files); `npm run build` passed (770 Vite modules and Sites output); `git diff --check` passed.
