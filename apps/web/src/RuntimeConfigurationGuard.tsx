type RuntimeConfigurationGuardProps = {
  message: string;
};

export default function RuntimeConfigurationGuard({ message }: RuntimeConfigurationGuardProps) {
  return (
    <main className="runtime-configuration-screen" aria-label="Rescue Meal 서비스 연결 안내">
      <div className="runtime-configuration-mark" aria-hidden="true">r</div>
      <span className="runtime-configuration-kicker">RESCUE MEAL</span>
      <h1>서비스에 연결할 수<br /><em>없어요</em></h1>
      <p>저장한 식품 기록을 불러오지 못했어요. 서비스 연결을 살펴본 뒤 다시 시도해 주세요.</p>
      <div className="runtime-configuration-alert" role="alert">
        <strong>식품 기록을 불러오지 못했어요</strong>
        <span>서비스 연결 설정이 되어 있지 않거나 현재 사용할 수 없어요.</span>
      </div>
      <button className="primary-sheet-button runtime-configuration-reload" type="button" onClick={() => window.location.reload()}>다시 시도하기</button>
      <details className="runtime-configuration-details" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", color: "inherit", fontSize: 11, fontWeight: 800 }}>배포 담당자용 설정 보기</summary>
        <div style={{ display: "grid", gap: 12, paddingTop: 10 }}>
          <div className="runtime-configuration-alert" role="note">
            <strong>상세 설정 메시지</strong>
            <span>{message}</span>
          </div>
          <div className="runtime-configuration-checklist">
            <span><b>01</b><span><strong>API 주소</strong><small>VITE_API_BASE_URL에 운영 API의 HTTPS 주소를 넣어 주세요.</small></span></span>
            <span><b>02</b><span><strong>다시 빌드</strong><small>환경변수는 프론트엔드 빌드 시점에 반영돼요.</small></span></span>
          </div>
          <small className="runtime-configuration-footnote">개발·시연 화면이 필요하면 VITE_DEPLOYMENT_MODE=demo를 사용하세요.</small>
        </div>
      </details>
    </main>
  );
}
