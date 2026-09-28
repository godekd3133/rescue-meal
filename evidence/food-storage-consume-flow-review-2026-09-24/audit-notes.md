# Food detail saved/pending state review — 2026-09-24

## Scope and user goal

Mobile Home → spinach detail → storage/opened status → consume-record confirmation, on the isolated native-shell demo at 320×740 and 393×852. The goal was to make the state users are about to review visible and distinguish saved values from unsaved edits. No food, storage, date, or consume record was saved.

## Flow readback

1. **Home — healthy.** The 320px home presents spinach with a date-check cue and opens the matching detail. See `01-home.png`.
2. **Food detail before edit — needs clearer state exposure.** The printed date, date-review reason, and primary action are visible. Storage appears in the hero, but opened state only appears below the fold near its control. See `02-detail-before-edit.png`.
3. **Pending storage edit — misleading before the change.** Selecting frozen storage changed the separate save action to `저장 필요 · 보관 위치`, while the hero still said `냉동 보관 중`. This implied the draft was already persisted. The save action remained explicit and separate. See `03-pending-storage-before.png`.
4. **Consume confirmation — healthy safety boundary, with state warning.** The confirmation repeats spinach and `1팩`, says an unsaved storage change is excluded, preserves “only record it if already eaten” and “the app does not judge safety,” and offers `돌아가서 변경 저장`. The final `먹었어요` action was not activated. See `04-confirmation-before.png` and `08-confirmation-refined.png`.
5. **Updated detail — improved at 320px and 393px, light and dark.** The hero now shows storage plus opened state; a pending storage value reads `저장 전 · 냉동` in amber, while an opened draft reads `개봉 상태 저장 전`. State text is 11px and the storage badge is 10px. The header uses the available width at 393px. Final captures: `07-detail-pending-storage-light-top.png`, `11-detail-pending-storage-dark-top.png`, `14-detail-393-dark-expanded-confirmed.png`, `15-detail-320-dark-final.png`, and `16-detail-320-light-final.png`.

## Findings and limits

- The primary review and consume actions remain in the first detail viewport at 320×740 after adding the state summary.
- Storage and opened-state editing controls remain lower in the scroll area; the hero summary provides context but does not move those controls.
- Screenshots and DOM readback do not establish VoiceOver/TalkBack announcement quality, physical-device safe-area behavior, or actual user comprehension. Automated UI tests were not run by preference.
- `13-detail-393-dark-expanded.png` was rejected: it captured a transient blank page during Vite hot reload. The local server returned HTTP 200; re-navigation restored the app and `14-detail-393-dark-expanded-confirmed.png` is the accepted capture.
- Demo state was returned to seven fixture foods with spinach refrigerated; no save or consume mutation occurred.
