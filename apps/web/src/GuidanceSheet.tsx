import { InfoCircledIcon, LightningBoltIcon } from "@radix-ui/react-icons";

export default function GuidanceSheet() {
  return (
    <div className="guidance-sheet">
      <div className="guidance-lead"><div className="guidance-icon"><InfoCircledIcon width={22} height={22} /></div><div><p>먹어도 되는지는 앱에서 판단할 수 없어요. 포장지 날짜와 보관 방법, 식품 상태를 함께 살펴봐 주세요.</p></div></div>
      <div className="guidance-list" role="list" aria-label="식품 날짜와 보관 상태 확인 방법">
        <div className="guidance-row" role="listitem"><span className="guidance-number">01</span><span><strong>포장지 날짜</strong><small>날짜와 소비기한·유통기한·품질유지기한 같은 표시 이름을 함께 기록해요.</small></span></div>
        <div className="guidance-row" role="listitem"><span className="guidance-number">02</span><span><strong>내가 정한 날짜</strong><small>포장지에 적힌 날짜와 달리, 다시 살펴볼 날로 직접 정한 날짜예요.</small></span></div>
        <div className="guidance-row" role="listitem"><span className="guidance-number">03</span><span><strong>먼저 살펴볼 시점</strong><small>식품 종류와 보관 정보를 참고한 순서예요. 소비기한과는 달라요.</small></span></div>
      </div>
      <div className="guidance-warning" role="note" aria-label="식품 상태 안내"><LightningBoltIcon width={16} height={16} /><span style={{ display: "grid", gap: 2 }}><strong>이상한 점이 있으면 먹지 마세요</strong><small style={{ fontSize: 12 }}>포장이 부풀었거나 냄새·색이 이상하면 맛보지 말고 버리세요.</small></span></div>
    </div>
  );
}
