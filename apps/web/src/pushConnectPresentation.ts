export function pushConnectAvailability(supported: boolean, publicKey: string) {
  if (!supported) return { available: false, message: "이 브라우저에서는 기기 알림을 사용할 수 없어요." };
  if (!publicKey.trim()) return { available: false, message: "기기 알림은 현재 연결할 수 없어요." };
  return { available: true, message: "" };
}

export function showPushConnectionControls(available: boolean, subscriptionCount: number, savedEnabled: boolean) {
  return available || subscriptionCount > 0 || savedEnabled;
}
