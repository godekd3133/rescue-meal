import { ExclamationTriangleIcon } from "@radix-ui/react-icons";
import "./guidanceScreen.css";

/** 날짜를 읽는 방법: what each kind of date in the app means, and the one rule that overrides them. */
export default function GuidanceSheet() {
  return (
    <div className="guidance-sheet guide">
      <p className="guide-intro">먹어도 되는지는 앱이 판단하지 않아요. 포장지 날짜와 보관 방법, 식품 상태를 함께 봐 주세요.</p>
      <ul className="guide-terms" aria-label="식품 날짜와 보관 상태 확인 방법">
        <li><strong>포장지 날짜</strong><p>포장에 적힌 날짜예요. 소비기한, 유통기한, 품질유지기한 중 어떤 표시인지도 함께 기록해요.</p></li>
        <li><strong>내가 정한 날짜</strong><p>포장지 날짜와 별개로, 다시 살펴볼 날로 직접 정한 날짜예요.</p></li>
        <li><strong>먼저 살펴볼 시점</strong><p>식품 종류와 보관 정보로 정한 순서예요. 소비기한이 아니에요.</p></li>
      </ul>
      <div className="guide-warning" role="note" aria-label="식품 상태 안내">
        <ExclamationTriangleIcon width={16} height={16} aria-hidden="true" />
        <p><strong>이상하면 먹지 마세요</strong> 포장이 부풀었거나 냄새나 색이 이상하면 맛보지 말고 버려 주세요.</p>
      </div>
    </div>
  );
}
