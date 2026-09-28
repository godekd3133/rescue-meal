# Date recheck flow review — 2026-09-24

## Scope and user goal

Isolated local demo flow: Home → spinach detail → printed-date recheck → sample label candidate → cancel and return. The goal was to make the pre-save decision and return point unmistakable. No camera/OCR request or durable date, food, storage, or consumption change was made.

## Flow readback

1. **Home — healthy.** The spinach priority row shows its printed-date meaning and a separate `날짜 확인` action. See `01-home.png`.
2. **Food detail — healthy.** The sheet presents `표시 소비기한`, `2026.09.02`, and `포장지 표시` together, then the exact review reason and a 44px recheck action. See `02-detail.png`.
3. **Date recheck entry — improved.** The header names the existing food and says the record does not change before `확인 후 저장`. The label method has a clear input → review → save rail and the package/date safety boundary. The supporting instruction now reads as one sentence for visual and assistive-technology output. See `03-date-recheck-entry.png` (before copy update), `06-date-recheck-entry-final.png` (393px), and `12-label-entry-320-current.png` (320px).
4. **Sample label result — improved.** The local candidate shows `2026.09.02`, the matching existing spinach lot (1 pack), and refrigerated storage. The sticky line begins `저장 전 확인 요약` and describes the exact candidate/lot/storage attached to `확인 후 기존 식품 수정`. At 320px the summary wraps to two lines but the primary action remains visible. See `04-sample-label-result.png` (before summary label), `07-label-result-saved-summary.png` (393px), `08-label-result-320.png` (prior 320px capture), and `13-label-result-320-current.png` (current 320px capture).
5. **Cancel and return — healthy after focus fix.** Closing without saving returns to the detail with the same printed date and storage; focus lands on `포장지에서 날짜 다시 확인` rather than the sheet close button. See `10-return-focus-restored-320.png` and the final post-effect rerun `14-focus-restored-after-final-effect.png`.

## Evidence limits

- The result came from the local sample-label fixture; actual camera permissions, package photography, OCR accuracy, and server persistence were not exercised.
- Browser accessibility snapshots and `document.activeElement` confirmed the return-focus target. VoiceOver/TalkBack announcement quality and physical-device behavior remain unverified.
- The final `확인 후 기존 식품 수정` action was never activated. After closing the sample, Home still showed seven foods and spinach retained the original printed date `2026.09.02` and refrigerated state.
- The code fallback that focuses the printed-date proof when a successful correction removes the review action was not manually exercised because the sample was not saved. A regression assertion for a future date clearing the warning and focusing the date proof was authored but not run.
- Automated UI tests were not run by preference; focused regression assertions were added but remain unexecuted.
