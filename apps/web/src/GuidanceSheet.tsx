import { InfoCircledIcon, LightningBoltIcon } from "@radix-ui/react-icons";

export default function GuidanceSheet() {
  return (
    <div className="guidance-sheet">
      <div className="guidance-lead"><div className="guidance-icon"><InfoCircledIcon width={22} height={22} /></div><div><h3>날짜와 보관 방법을 살펴봐 주세요</h3><p>먹어도 되는지는 앱에서 판단할 수 없어요. 포장지 날짜와 식품 상태를 살펴보세요. 목록의 먼저 살펴볼 식품은 참고용이에요.</p></div></div>
      <div className="guidance-list" role="list" aria-label="식품 날짜와 보관 상태 확인 방법">
        <div className="guidance-row" role="listitem"><span className="guidance-number">01</span><span><strong>포장지 날짜</strong><small>소비기한·유통기한·품질유지기한이 보이면 적힌 날짜를 기록해요.</small></span></div>
        <div className="guidance-row" role="listitem"><span className="guidance-number">02</span><span><strong>내가 기록한 날짜</strong><small>포장지에서 읽은 날짜와 직접 입력한 날짜를 구분해 기록해요.</small></span></div>
        <div className="guidance-row" role="listitem"><span className="guidance-number">03</span><span><strong>먼저 살펴볼 식품</strong><small>날짜가 없는 식품은 종류와 보관 방법을 바탕으로 목록 앞에 보여드려요.</small></span></div>
      </div>
      <div className="guidance-warning" role="note" aria-label="식품 상태 안내"><LightningBoltIcon width={16} height={16} /><span style={{ display: "grid", gap: 2 }}><strong>이상한 점이 있으면 먹지 마세요</strong><small style={{ fontSize: 12 }}>포장이 부풀었거나 냄새·색이 이상하면 맛보지 말고 버리세요.</small></span></div>
    </div>
  );
}
