import { InfoCircledIcon, LightningBoltIcon } from "@radix-ui/react-icons";

export default function GuidanceSheet() {
  return (
    <div className="guidance-sheet">
      <div className="guidance-lead"><div className="guidance-icon"><InfoCircledIcon width={22} height={22} /></div><div><h3>안전한 기록의 순서</h3><p>Rescue Meal은 ‘먹어도 된다’를 판정하지 않아요. 확인된 날짜와 먼저 먹을 순서를 나눠서 보여드려요.</p></div></div>
      <div className="guidance-list">
        <div className="guidance-row"><span className="guidance-number">01</span><span><strong>포장지 표시</strong><small>소비기한·유통기한·유효년월일이 보이면 실제 날짜를 가장 먼저 기록해요.</small></span><span className="guidance-badge badge-green">확인됨</span></div>
        <div className="guidance-row"><span className="guidance-number">02</span><span><strong>사용자 확인</strong><small>직접 입력하거나 사진에서 확인한 날짜는 출처와 함께 남겨요.</small></span><span className="guidance-badge badge-blue">사용자</span></div>
        <div className="guidance-row"><span className="guidance-number">03</span><span><strong>AI 소비 우선순위</strong><small>날짜가 없을 때 상품 유형·보관 방식으로 ‘먼저 볼 순서’만 추정해요.</small></span><span className="guidance-badge badge-coral">추정</span></div>
      </div>
      <div className="guidance-warning"><LightningBoltIcon width={16} height={16} /><span>냄새·색·포장 팽창 등 상태가 이상하면 날짜와 관계없이 먹지 말고 폐기 여부를 확인하세요.</span></div>
    </div>
  );
}
