type RuntimeConfigurationGuardProps = {
  message: string;
};

export default function RuntimeConfigurationGuard({ message }: RuntimeConfigurationGuardProps) {
  return (
    <main className="runtime-configuration-screen" aria-label="Rescue Meal 운영 설정 오류">
      <div className="runtime-configuration-mark" aria-hidden="true">r</div>
      <span className="runtime-configuration-kicker">RESCUE MEAL · PRODUCTION CHECK</span>
      <h1>운영 앱 설정을<br /><em>확인해 주세요</em></h1>
      <p>데이터가 저장되지 않는 임시 화면으로 잘못 실행하지 않도록 앱을 잠시 멈췄어요.</p>
      <div className="runtime-configuration-alert" role="alert">
        <strong>서버 연결 설정이 필요해요</strong>
        <span>{message}</span>
      </div>
      <div className="runtime-configuration-checklist">
        <span><b>01</b><span><strong>API 주소</strong><small>VITE_API_BASE_URL에 운영 API의 HTTPS 주소를 넣어 주세요.</small></span></span>
        <span><b>02</b><span><strong>다시 빌드</strong><small>환경변수는 프론트엔드 빌드 시점에 반영돼요.</small></span></span>
      </div>
      <button className="primary-sheet-button runtime-configuration-reload" type="button" onClick={() => window.location.reload()}>다시 확인하기</button>
      <small className="runtime-configuration-footnote">개발·시연 화면이 필요하면 VITE_DEPLOYMENT_MODE=demo를 사용하세요.</small>
    </main>
  );
}
