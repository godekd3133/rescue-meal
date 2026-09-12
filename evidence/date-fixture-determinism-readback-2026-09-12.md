# Printed-date fixture determinism readback — 2026-09-12

## Finding

The connected test for preserving the printed date meaning used a fixed
`2026-09-12` fixture. When the host date reached that day, the product correctly
changed the Home label to its urgent date-review state, while the test still
expected the non-urgent `표시 유통기한` badge. The test was coupled to calendar
passage rather than the contract it intended to verify.

## Change

The test now derives a local-calendar date seven days from the execution date and
uses that same value for `date_assertion.value` and `display_label`. The product's
today/expired warning behavior is unchanged; the test now isolates printed-date
meaning from urgency timing.

## Verification

- Printed-date connected regression repeated: **3 passed** on ports `8149/4549`
- Full API suite on current source: **508 passed, 8 warnings**
- Latest full connected source baseline: **108 passed**
- `git diff --check`: passed

## Acceptance boundary

This fixes test-fixture determinism only. It does not change date safety rules,
printed-date semantics, or production calendar behavior.
