import { useEffect, useState } from "react";
import { ArrowRightIcon, CheckCircledIcon, InfoCircledIcon, ReaderIcon } from "@radix-ui/react-icons";
import { KeyboardInput, useKeyboard } from "./mobile";
import { mealApi, type ApiAuthMe, type ApiAuthSession } from "./mealApi";

type AccountMode = "login" | "register";

export default function AccountSheet({
  onAuthenticated,
  onSignedOut,
}: {
  onAuthenticated: (session: ApiAuthSession) => void | Promise<void>;
  onSignedOut: () => void | Promise<void>;
}) {
  const keyboard = useKeyboard();
  const [authMe, setAuthMe] = useState<ApiAuthMe | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [mode, setMode] = useState<AccountMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!mealApi.isConfigured) {
      setCheckingSession(false);
      return;
    }
    let active = true;
    void mealApi.getAuthMe().then((session) => {
      if (active) {
        setAuthMe(session);
        setCheckingSession(false);
      }
    }).catch(() => {
      if (active) {
        mealApi.clearSession();
        setAuthMe(null);
        setCheckingSession(false);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    keyboard.hide();
    setError("");
    if (!mealApi.isConfigured) {
      setError("계정 기능을 사용하려면 API 연결이 필요해요.");
      return;
    }
    if (password.length < 8) {
      setError("비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const session = mode === "login"
        ? await mealApi.loginAccount({ email, password })
        : await mealApi.registerAccount({ email, password });
      if (!session) throw new Error("account-session-missing");
      await onAuthenticated(session);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(message.includes("409") ? "이미 가입된 이메일이에요." : mode === "login" ? "이메일 또는 비밀번호를 확인해 주세요." : "계정을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    keyboard.hide();
    setBusy(true);
    try {
      await onSignedOut();
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return <div className="account-loading" role="status">현재 workspace를 확인하고 있어요</div>;
  }

  if (authMe?.mode === "account" && authMe.email) {
    return <div className="account-sheet-content"><div className="account-lead"><div className="capture-visual compact"><CheckCircledIcon width={23} height={23} /></div><div><h3>계정 workspace에 연결됨</h3><p>{authMe.email}의 식품 기록을 이어가고 있어요.</p></div></div><div className="account-profile"><span className="account-profile-icon"><ReaderIcon width={18} height={18} /></span><span><strong>{authMe.email}</strong><small>다른 기기에서도 같은 workspace를 열 수 있어요.</small></span></div><button className="secondary-sheet-button" type="button" disabled={busy} onClick={() => void signOut()}>로그아웃</button><div className="account-note"><InfoCircledIcon width={15} height={15} /><span>로그아웃하면 새 게스트 workspace로 전환됩니다. 현재 계정 기록은 삭제되지 않아요.</span></div></div>;
  }

  return <div className="account-sheet-content"><div className="account-lead"><div className="capture-visual compact"><ReaderIcon width={23} height={23} /></div><div><h3>내 식품을 안전하게 이어가기</h3><p>계정을 만들면 다른 기기에서도 같은 workspace를 다시 열 수 있어요.</p></div></div><div className="account-tabs" role="tablist" aria-label="계정 방법"><button type="button" role="tab" aria-selected={mode === "login"} className={`account-tab ${mode === "login" ? "account-tab-active" : ""}`} onClick={() => { setMode("login"); setError(""); }}>로그인</button><button type="button" role="tab" aria-selected={mode === "register"} className={`account-tab ${mode === "register" ? "account-tab-active" : ""}`} onClick={() => { setMode("register"); setError(""); }}>회원가입</button></div><form className="account-form" onSubmit={(event) => { event.preventDefault(); void submit(); }}><label className="app-input-label" htmlFor="account-email-input">이메일</label><KeyboardInput id="account-email-input" className="app-input" type="email" autoComplete="email" value={email} placeholder="name@example.com" onChange={(event) => setEmail(event.target.value)} onBlur={() => keyboard.hide()} /><label className="app-input-label" htmlFor="account-password-input">비밀번호</label><KeyboardInput id="account-password-input" className="app-input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} placeholder="8자 이상" onChange={(event) => setPassword(event.target.value)} onBlur={() => keyboard.hide()} />{error ? <div className="account-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span></div> : null}<button className="primary-sheet-button" type="submit" disabled={busy || !email.trim() || !password} onPointerDown={(event) => event.preventDefault()}>{busy ? "확인하는 중이에요" : mode === "login" ? "로그인" : "계정 만들기"}<ArrowRightIcon width={17} height={17} /></button></form><div className="account-note"><CheckCircledIcon width={15} height={15} /><span>현재 게스트 기록은 계정에 자동 병합하지 않아요. 데이터가 섞이지 않도록 별도 workspace로 시작합니다.</span></div></div>;
}
