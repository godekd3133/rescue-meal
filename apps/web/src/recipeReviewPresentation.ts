export function recipeLicenseLabel(license: string) {
  if (license === "public-api-terms-review-required") return "이용 조건 확인 필요";
  if (license === "local-test-fixture") return "검증용 자료";
  if (!license.trim() || license === "unknown") return "이용 조건 미확인";
  return license;
}
