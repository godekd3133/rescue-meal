type RuntimeConfigurationGuardProps = {
  message: string;
};

export default function RuntimeConfigurationGuard({ message }: RuntimeConfigurationGuardProps) {
  return (
    <main className="runtime-configuration-screen" aria-label="Rescue Meal 운영 설정 오류">
      <div className="runtime-configuration-mark" aria-hidden="true">r</div>
      <span className="runtime-configuration-kicker">RESCUE MEAL · 운영 설정 확인</span>
      <h1>운영 앱 설정을<br /><em>확인해 주세요</em></h1>
      <p>기록을 안전하게 보호하기 위해 임시 데이터를 보여주지 않고 있어요. 설정을 확인한 뒤 다시 확인해 주세요.</p>
      <div className="runtime-configuration-alert" role="alert">
        <strong>서비스 연결 설정이 필요해요</strong>
        <span>운영 API 연결이 준비되지 않아 데이터를 불러올 수 없어요.</span>
      </div>
      <button className="primary-sheet-button runtime-configuration-reload" type="button" onClick={() => window.location.reload()}>다시 확인하기</button>
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
