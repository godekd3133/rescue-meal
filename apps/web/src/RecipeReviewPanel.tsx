import { MetadataText } from "./Metadata";
import { useEffect, useRef, useState } from "react";
import { CheckCircledIcon, InfoCircledIcon, ReaderIcon, UploadIcon } from "@radix-ui/react-icons";
import { KeyboardInput, KeyboardTextarea } from "./mobile";
import {
  MEAL_API_WORKSPACE_CONFLICT_MESSAGE,
  MealApiError,
  isMealApiRecipeCatalogConflictError,
  isMealApiRecipeReviewClaimError,
  isMealApiRecipePublishError,
  isMealApiRecipeReviewPersistenceError,
  isMealApiWorkspaceConflictError,
  mealApi,
  type ApiRecipeDraft,
  type ApiRecipeReviewAssignment,
  type ApiRecipeReviewAuditEvent,
  type ApiRecipeSourceStatus,
} from "./mealApi";
import { RECIPE_REVIEW_SYNC_WORKSPACE_KEY } from "./mealApi";
import type { WorkspaceSyncInvalidation, WorkspaceSyncTransport } from "./workspaceSync";

type DraftIngredientEditor = ApiRecipeDraft["ingredients"][number];
type ImportFormState = {
  startIdx: string;
  endIdx: string;
  menuName: string;
  ingredientText: string;
  changedAfter: string;
  category: string;
};

type ReviewRetryAction = "save" | "approve" | "reject";

const initialImportForm: ImportFormState = {
  startIdx: "1",
  endIdx: "20",
  menuName: "",
  ingredientText: "",
  changedAfter: "",
  category: "",
};

function errorMessage(error: unknown) {
  if (!(error instanceof Error)) return "레시피를 불러오지 못했어요.";
  if (isMealApiWorkspaceConflictError(error)) return MEAL_API_WORKSPACE_CONFLICT_MESSAGE;
  if (isMealApiRecipeCatalogConflictError(error)) return "다른 사람이 먼저 수정했어요. 레시피를 다시 불러와 살펴봐 주세요.";
  if (isMealApiRecipeReviewClaimError(error)) {
    if (error instanceof MealApiError && error.code === "recipe_review_claim_conflict") return "다른 사람이 이 레시피를 수정 중이에요. 끝난 뒤 다시 시도해 주세요.";
    if (error instanceof MealApiError && error.code === "recipe_review_claim_expired") return "수정 시간이 끝났어요. 다시 수정을 시작해 주세요.";
    if (error instanceof MealApiError && error.code === "recipe_review_claim_unavailable") return "수정할 레시피를 먼저 골라 주세요.";
    return "내용을 수정하려면 먼저 수정을 시작해 주세요.";
  }
  if (isMealApiRecipePublishError(error)) return "현재 계정으로는 레시피를 저장할 수 있지만 공개하거나 제외할 수는 없어요.";
  if (isMealApiRecipeReviewPersistenceError(error)) return "레시피를 저장하지 못했어요. 기존 내용은 그대로예요.";
  if (error instanceof MealApiError && error.status === 503) return "레시피를 불러올 수 없어요.";
  if (error instanceof MealApiError && error.status === 403) return "레시피 관리 계정이나 확인 코드를 확인해 주세요.";
  return "레시피 작업을 마치지 못했어요. 잠시 후 다시 시도해 주세요.";
}

function formatRetrievedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

function formatClaimExpiry(value: string | null) {
  if (!value) return "수정 기한 없음";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "만료 시각을 확인할 수 없음" : `${date.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}까지`;
}

function auditEventDetail(action: ApiRecipeReviewAuditEvent["action"]) {
  if (action === "imported") return "공개 레시피 원본에서 가져왔어요.";
  if (action === "updated") return "레시피 초안을 수정했어요.";
  if (action === "approved") return "식단 추천에 공개했어요.";
  if (action === "rejected") return "식단 추천에서 제외했어요.";
  if (action === "claimed") return "수정을 시작했어요.";
  return "수정을 마쳤어요.";
}

function reviewDraftChanged(before: ApiRecipeDraft, after: ApiRecipeDraft) {
  return before.updated_at !== after.updated_at
    || before.status !== after.status
    || before.claimed_by !== after.claimed_by
    || before.claim_expires_at !== after.claim_expires_at;
}

type RecipeReviewPanelProps = {
  workspaceTransport: WorkspaceSyncTransport | null;
};

export default function RecipeReviewPanel({ workspaceTransport }: RecipeReviewPanelProps) {
  const [reviewToken, setReviewToken] = useState("");
  const [actorId, setActorId] = useState<string | null>(null);
  const [canPublish, setCanPublish] = useState(true);
  const [drafts, setDrafts] = useState<ApiRecipeDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState<ApiRecipeDraft | null>(null);
  const [licenseConfirmed, setLicenseConfirmed] = useState(false);
  const [reviewerNote, setReviewerNote] = useState("");
  const [auditEvents, setAuditEvents] = useState<ApiRecipeReviewAuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<ApiRecipeSourceStatus | null>(null);
  const [importForm, setImportForm] = useState<ImportFormState>(initialImportForm);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAction, setRetryAction] = useState<ReviewRetryAction | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [queueFilter, setQueueFilter] = useState<ApiRecipeReviewAssignment>("all");
  const [editorRefreshRequired, setEditorRefreshRequired] = useState(false);
  const [catalogRevision, setCatalogRevision] = useState<number | null>(null);
  const draftsRef = useRef<ApiRecipeDraft[]>([]);
  const editorRef = useRef<ApiRecipeDraft | null>(null);
  const catalogRevisionRef = useRef<number | null>(null);
  const pollingInFlightRef = useRef(false);
  const busyRef = useRef(false);
  draftsRef.current = drafts;
  editorRef.current = editor;
  catalogRevisionRef.current = catalogRevision;
  busyRef.current = loading || saving || importing || claiming;

  const rememberCatalogRevision = (revision: number | null | undefined) => {
    if (revision === null || revision === undefined || !Number.isSafeInteger(revision) || revision < 0) return;
    catalogRevisionRef.current = revision;
    setCatalogRevision(revision);
  };

  const rememberObservedCatalogRevision = () => {
    rememberCatalogRevision(mealApi.recipeCatalogRevision);
  };

  const loadSourceStatus = async () => {
    if (!mealApi.isConfigured) return null;
    setSourceLoading(true);
    try {
      const response = await mealApi.getRecipeSourceStatus();
      setSourceStatus(response);
      return response;
    } catch {
      setSourceStatus(null);
      return null;
    } finally {
      setSourceLoading(false);
    }
  };

  const loadDrafts = async (
    token = reviewToken,
    nextNotice?: string,
    assignment: ApiRecipeReviewAssignment = queueFilter,
    options: { preserveEditor?: boolean } = {},
  ) => {
    const normalizedToken = token.trim();
    if (!mealApi.isConfigured) {
      setError("서비스에 연결한 뒤 사용할 수 있어요.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    void loadSourceStatus();
    try {
      let nextActorId = normalizedToken ? "legacy-review-token" : null;
      if (!normalizedToken) {
        const auth = await mealApi.getAuthMe();
        if (auth?.role !== "recipe_admin") {
          setError("레시피 관리 계정으로 로그인하거나 관리 코드를 입력해 주세요.");
          return;
        }
        if (!auth.user_id) {
          setError("레시피 관리 계정 정보를 확인할 수 없어요. 다시 로그인해 주세요.");
          return;
        }
        nextActorId = auth.user_id;
      }
      let nextCanPublish = true;
      try {
        const capabilities = await mealApi.getRecipeReviewCapabilities(normalizedToken);
        nextCanPublish = capabilities?.can_publish ?? true;
      } catch {
        // Keep the pre-capability compatibility behavior when an older API is
        // serving the review screen; the server remains the final gate.
      }
      const response = await mealApi.getRecipeReviewDrafts(normalizedToken, "pending", assignment);
      if (!response) throw new Error("recipe-review-response-missing");
      rememberObservedCatalogRevision();
      setReviewToken(normalizedToken);
      setActorId(nextActorId);
      setCanPublish(nextCanPublish);
      const currentDraft = selectedId ? draftsRef.current.find((draft) => draft.id === selectedId) : null;
      const nextSelectedDraft = selectedId ? response.find((draft) => draft.id === selectedId) : null;
      const preserveCurrentEditor = Boolean(options.preserveEditor && selectedId && editorRef.current);
      setDrafts(response);
      if (preserveCurrentEditor) {
        if (!nextSelectedDraft || !currentDraft || reviewDraftChanged(currentDraft, nextSelectedDraft)) {
          setEditorRefreshRequired(true);
        }
        setNotice(nextNotice ?? "다른 운영자가 목록을 바꿨어요. 작성 중인 내용은 보관했어요. 저장하기 전에 새로 불러와 주세요.");
      } else {
        setEditorRefreshRequired(false);
        setSelectedId(response[0]?.id ?? null);
        setEditor(response[0] ?? null);
        setAuditEvents([]);
        setLicenseConfirmed(false);
        setReviewerNote(response[0]?.reviewer_note ?? "");
        if (response[0]) void loadAudit(response[0].id, normalizedToken);
      setNotice(nextNotice ?? (response.length ? `확인할 레시피 ${response.length}개를 불러왔어요.` : "확인할 레시피가 없어요."));
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!workspaceTransport || !actorId) return;
    return workspaceTransport.subscribe((message: WorkspaceSyncInvalidation) => {
      if (message.workspaceKey !== RECIPE_REVIEW_SYNC_WORKSPACE_KEY) return;
      if (message.channels !== "all" && !message.channels.includes("recipe-review")) return;
      void loadDrafts(reviewToken, undefined, queueFilter, { preserveEditor: true });
    });
  }, [actorId, queueFilter, reviewToken, selectedId, workspaceTransport]);

  useEffect(() => {
    if (!actorId || !mealApi.isConfigured || typeof window === "undefined") return;
    const pollRevision = async () => {
      if (document.visibilityState === "hidden" || pollingInFlightRef.current || busyRef.current) return;
      pollingInFlightRef.current = true;
      try {
        const response = await mealApi.getRecipeReviewRevision(reviewToken);
        if (!response) return;
        const previousRevision = catalogRevisionRef.current;
        rememberCatalogRevision(response.revision);
        if (previousRevision !== null && response.revision !== previousRevision) {
          await loadDrafts(reviewToken, undefined, queueFilter, { preserveEditor: true });
        }
      } catch {
        // A background probe must not replace a usable queue with an offline
        // error; the next visibility change or interval retries it.
      } finally {
        pollingInFlightRef.current = false;
      }
    };
    const interval = window.setInterval(() => void pollRevision(), 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void pollRevision();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [actorId, queueFilter, reviewToken]);

  const importDrafts = async () => {
    if (loading || importing) return;
    const normalizedToken = reviewToken.trim();
    if (!mealApi.isConfigured) {
      setError("서비스에 연결한 뒤 사용할 수 있어요.");
      return;
    }
    const startIdx = Number(importForm.startIdx);
    const endIdx = Number(importForm.endIdx);
    if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx) || startIdx < 1 || endIdx < startIdx || endIdx > 100) {
      setError("불러올 범위는 1부터 100까지이며, 시작 번호가 끝 번호보다 클 수 없어요.");
      return;
    }
    setImporting(true);
    setError("");
    setNotice("");
    try {
      if (!normalizedToken) {
        const auth = await mealApi.getAuthMe();
        if (auth?.role !== "recipe_admin") {
          setError("레시피 관리 계정으로 로그인하거나 관리 코드를 입력해 주세요.");
          return;
        }
      }
      const response = await mealApi.importRecipeReviewDrafts(normalizedToken || undefined, {
        start_idx: startIdx,
        end_idx: endIdx,
        ...(importForm.menuName.trim() ? { menu_name: importForm.menuName.trim() } : {}),
        ...(importForm.ingredientText.trim() ? { ingredient_text: importForm.ingredientText.trim() } : {}),
        ...(importForm.changedAfter.trim() ? { changed_after: importForm.changedAfter.trim() } : {}),
        ...(importForm.category.trim() ? { category: importForm.category.trim() } : {}),
      });
      if (!response) throw new Error("recipe-review-import-response-missing");
      const summary = `레시피 ${response.accepted_count}개를 살펴봤고, 새 레시피 ${response.persisted_count}개를 가져왔어요.`;
      const rejected = response.rejected_count ? ` 가져오지 못한 항목 ${response.rejected_count}개가 있어요.` : "";
      await loadDrafts(normalizedToken, `${summary}${rejected}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setImporting(false);
    }
  };

  const selectDraft = (draft: ApiRecipeDraft) => {
    setSelectedId(draft.id);
    setEditor(draft);
    setEditorRefreshRequired(false);
    setLicenseConfirmed(false);
    setReviewerNote(draft.reviewer_note);
    setAuditEvents([]);
    void loadAudit(draft.id);
    setError("");
    setNotice("");
  };

  const loadAudit = async (draftId: string, token = reviewToken) => {
    try {
      const response = await mealApi.getRecipeReviewEvents(token.trim(), draftId);
      if (response) setAuditEvents(response);
    } catch {
      setAuditEvents([]);
    }
  };

  const updateIngredient = (index: number, changes: Partial<DraftIngredientEditor>) => {
    setEditor((current) => current ? {
      ...current,
      ingredients: current.ingredients.map((ingredient, ingredientIndex) => ingredientIndex === index ? { ...ingredient, ...changes } : ingredient),
    } : current);
  };

  const activeClaim = Boolean(editor?.claimed_by && (!editor.claim_expires_at || new Date(editor.claim_expires_at).getTime() > Date.now()));
  const claimIsMine = Boolean(activeClaim && editor?.claimed_by && actorId && editor.claimed_by === actorId);
  const claimExpired = Boolean(editor?.claimed_by && !activeClaim);
  const canEdit = claimIsMine && !editorRefreshRequired;

  const updateDraftState = (response: ApiRecipeDraft) => {
    setEditor(response);
    setEditorRefreshRequired(false);
    rememberObservedCatalogRevision();
    setDrafts((current) => current.map((draft) => draft.id === response.id ? response : draft));
    setReviewerNote(response.reviewer_note);
    void loadAudit(response.id);
  };

  const claim = async () => {
    if (!editor || claiming || saving) return;
    setClaiming(true);
    setError("");
    setNotice("");
    try {
      const response = await mealApi.claimRecipeReviewDraft(reviewToken || undefined, editor.id);
      if (!response) throw new Error("recipe-review-claim-missing");
      updateDraftState(response);
      setNotice("이 레시피를 맡았어요. 다른 운영자는 수정할 수 없어요.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setClaiming(false);
    }
  };

  const release = async () => {
    if (!editor || claiming || saving || !claimIsMine) return;
    setClaiming(true);
    setError("");
    setNotice("");
    try {
      const response = await mealApi.releaseRecipeReviewDraft(reviewToken || undefined, editor.id);
      if (!response) throw new Error("recipe-review-release-missing");
      updateDraftState(response);
      setNotice("수정을 마쳤어요. 다른 사람이 이어서 수정할 수 있어요.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setClaiming(false);
    }
  };

  const saveReview = async () => {
    if (!editor || saving || !canEdit) return;
    setSaving(true);
    setError("");
    setRetryAction(null);
    setNotice("");
    try {
      const response = await mealApi.updateRecipeReviewDraft(reviewToken || undefined, editor.id, {
        title: editor.title,
        safety_note: editor.safety_note ?? "",
        estimated_minutes: editor.estimated_minutes ?? undefined,
        reviewer_note: reviewerNote,
        ingredients: editor.ingredients.map((ingredient, index) => ({
          index,
          canonical_name: ingredient.canonical_name ?? undefined,
          canonical_amount: ingredient.canonical_amount ?? undefined,
          canonical_unit: ingredient.canonical_unit ?? undefined,
          review_status: ingredient.review_status,
        })),
      });
      if (!response) throw new Error("recipe-review-save-missing");
      rememberObservedCatalogRevision();
      setEditor(response);
      setDrafts((current) => current.map((draft) => draft.id === response.id ? response : draft));
      setReviewerNote(response.reviewer_note);
      void loadAudit(response.id);
      setNotice("변경 내용을 저장했어요.");
    } catch (reason) {
      setError(errorMessage(reason));
      setRetryAction(isMealApiRecipeReviewPersistenceError(reason) ? "save" : null);
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    if (!editor || saving || !canEdit || !canPublish) return;
    setSaving(true);
    setError("");
    setRetryAction(null);
    setNotice("");
    try {
      const reviewed = await mealApi.updateRecipeReviewDraft(reviewToken || undefined, editor.id, {
        title: editor.title,
        safety_note: editor.safety_note ?? "",
        estimated_minutes: editor.estimated_minutes ?? undefined,
        reviewer_note: reviewerNote,
        ingredients: editor.ingredients.map((ingredient, index) => ({
          index,
          canonical_name: ingredient.canonical_name ?? undefined,
          canonical_amount: ingredient.canonical_amount ?? undefined,
          canonical_unit: ingredient.canonical_unit ?? undefined,
          review_status: ingredient.review_status,
        })),
      });
      if (!reviewed) throw new Error("recipe-review-save-before-approve-missing");
      const response = await mealApi.approveRecipeReviewDraft(reviewToken || undefined, editor.id, licenseConfirmed);
      if (!response) throw new Error("recipe-review-approve-missing");
      rememberObservedCatalogRevision();
      setDrafts((current) => current.filter((draft) => draft.id !== response.id));
      setSelectedId(null);
      setEditor(null);
      setEditorRefreshRequired(false);
      setNotice("식단에 공개했어요. 이제 추천 목록에서 볼 수 있어요.");
    } catch (reason) {
      setError(errorMessage(reason));
      setRetryAction(isMealApiRecipeReviewPersistenceError(reason) ? "approve" : null);
    } finally {
      setSaving(false);
    }
  };

  const reject = async () => {
    if (!editor || saving || !canEdit || !canPublish) return;
    const note = reviewerNote.trim();
    if (!note) {
      setError("공개하지 않는 이유를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    setRetryAction(null);
    setNotice("");
    try {
      const response = await mealApi.rejectRecipeReviewDraft(reviewToken || undefined, editor.id, note);
      if (!response) throw new Error("recipe-review-reject-missing");
      rememberObservedCatalogRevision();
      setDrafts((current) => current.filter((draft) => draft.id !== response.id));
      setSelectedId(null);
      setEditor(null);
      setEditorRefreshRequired(false);
      setNotice("공개하지 않기로 했어요. 식단 추천에는 표시되지 않아요.");
    } catch (reason) {
      setError(errorMessage(reason));
      setRetryAction(isMealApiRecipeReviewPersistenceError(reason) ? "reject" : null);
    } finally {
      setSaving(false);
    }
  };

  const retry = () => {
    if (retryAction === "save") void saveReview();
    else if (retryAction === "approve") void approve();
    else if (retryAction === "reject") void reject();
  };

  const changeQueueFilter = (assignment: ApiRecipeReviewAssignment) => {
    setQueueFilter(assignment);
    void loadDrafts(reviewToken, undefined, assignment);
  };

  const reloadSelectedEditor = () => {
    if (!editorRefreshRequired) return;
    const latest = selectedId ? draftsRef.current.find((draft) => draft.id === selectedId) : null;
    if (latest) {
      setEditor(latest);
      setReviewerNote(latest.reviewer_note);
      setLicenseConfirmed(false);
      setEditorRefreshRequired(false);
      void loadAudit(latest.id);
      setNotice("새 레시피 내용을 불러왔어요. 살펴본 뒤 이어서 수정해 주세요.");
      return;
    }
    void loadDrafts(reviewToken, undefined, queueFilter);
  };

  return (
    <div className="recipe-review-panel">
      <div className="recipe-review-lead">
        <div className="capture-visual compact"><ReaderIcon width={22} height={22} /></div>
        <div><h3>공개할 레시피</h3><p>내용을 살펴본 레시피만 식단에 보여요.</p></div>
      </div>
      <div className="recipe-review-warning"><InfoCircledIcon width={16} height={16} /><span>코드는 이 화면을 닫으면 지워져요. 기기나 앱 설정에는 저장하지 않아요.</span></div>
      <form className="recipe-review-token-form" onSubmit={(event) => { event.preventDefault(); void loadDrafts(); }}>
        <label className="app-input-label" htmlFor="recipe-review-token">레시피 관리 코드</label>
        <KeyboardInput id="recipe-review-token" className="app-input" type="password" autoComplete="off" value={reviewToken} onChange={(event) => setReviewToken(event.target.value)} placeholder="관리 코드" />
        <small className="recipe-review-token-hint">레시피 관리 계정으로 로그인했다면 코드를 입력하지 않아도 돼요.</small>
        <button className="primary-sheet-button" type="submit" disabled={loading}>{loading ? "불러오는 중이에요" : "확인할 레시피 불러오기"}<CheckCircledIcon width={17} height={17} /></button>
      </form>
      {sourceStatus ? <section className="recipe-review-source-status" aria-label="레시피 정보 연결">
        <div className="recipe-review-source-status-heading">
          <div><span className={`recipe-review-status-dot ${sourceStatus.configured ? "recipe-review-status-ready" : "recipe-review-status-disabled"}`} /> <strong>{sourceStatus.configured ? "레시피 정보에 연결됨" : "레시피 정보를 불러올 수 없음"}</strong><small>{sourceStatus.source_name}</small></div>
          <a href={sourceStatus.source_url} target="_blank" rel="noreferrer">서비스 안내</a>
        </div>
        <p>{sourceStatus.detail}</p>
      </section> : null}
      {sourceStatus?.configured ? <form className="recipe-review-import-form" onSubmit={(event) => { event.preventDefault(); void importDrafts(); }}>
        <div className="recipe-review-import-heading"><span className="recipe-review-section-label">공개 레시피 가져오기</span><small>가져온 레시피는 바로 공개되지 않아요. 내용을 확인한 뒤 식단에 추가할 수 있어요.</small></div>
        <div className="recipe-review-import-range">
          <label className="app-input-label" htmlFor="recipe-import-start">첫 번째 항목</label>
          <KeyboardInput id="recipe-import-start" className="app-input" type="number" min="1" max="100" value={importForm.startIdx} onChange={(event) => setImportForm((current) => ({ ...current, startIdx: event.target.value }))} />
          <label className="app-input-label" htmlFor="recipe-import-end">마지막 항목</label>
          <KeyboardInput id="recipe-import-end" className="app-input" type="number" min="1" max="100" value={importForm.endIdx} onChange={(event) => setImportForm((current) => ({ ...current, endIdx: event.target.value }))} />
        </div>
        <div className="recipe-review-import-fields">
          <label className="app-input-label" htmlFor="recipe-import-menu">메뉴명으로 좁히기</label>
          <KeyboardInput id="recipe-import-menu" className="app-input" value={importForm.menuName} onChange={(event) => setImportForm((current) => ({ ...current, menuName: event.target.value }))} placeholder="예: 두부" />
          <label className="app-input-label" htmlFor="recipe-import-ingredient">재료명으로 좁히기</label>
          <KeyboardInput id="recipe-import-ingredient" className="app-input" value={importForm.ingredientText} onChange={(event) => setImportForm((current) => ({ ...current, ingredientText: event.target.value }))} placeholder="예: 시금치" />
          <label className="app-input-label" htmlFor="recipe-import-category">분류</label>
          <KeyboardInput id="recipe-import-category" className="app-input" value={importForm.category} onChange={(event) => setImportForm((current) => ({ ...current, category: event.target.value }))} placeholder="예: 반찬" />
          <label className="app-input-label" htmlFor="recipe-import-changed-after">변경일 이후</label>
          <KeyboardInput id="recipe-import-changed-after" className="app-input" value={importForm.changedAfter} onChange={(event) => setImportForm((current) => ({ ...current, changedAfter: event.target.value }))} placeholder="YYYYMMDD" inputMode="numeric" />
        </div>
        <button className="secondary-sheet-button recipe-review-import-button" type="submit" disabled={loading || importing || sourceLoading}>{importing ? "레시피를 확인하고 있어요" : "레시피 가져오기"}<UploadIcon width={16} height={16} /></button>
      </form> : sourceStatus ? <div className="recipe-review-source-disabled"><InfoCircledIcon width={15} height={15} /><span>레시피 정보 연결이 완료되면 공개 레시피를 가져올 수 있어요.</span></div> : null}
      {error ? <div className="recipe-error" role="alert"><InfoCircledIcon width={16} height={16} /><span>{error}</span>{retryAction ? <button className="account-error-action" type="button" onClick={retry}>다시 시도</button> : null}</div> : null}
      {notice ? <div className="recipe-review-notice" role="status"><CheckCircledIcon width={16} height={16} />{notice}</div> : null}
      {actorId ? <div className="recipe-review-filter-bar" aria-label="레시피 확인 목록">
          <span className="recipe-review-section-label">수정 상태</span>
        <small className="recipe-review-sync-hint">{catalogRevision === null ? "다른 기기의 변경 사항을 확인하고 있어요." : "다른 기기에서 목록이 바뀌면 알려드려요. 화면으로 돌아올 때도 새로 확인해요."}</small>
        <div>
          {(["all", "mine", "unassigned"] as const).map((assignment) => <button key={assignment} className={queueFilter === assignment ? "recipe-review-filter-active" : ""} type="button" aria-pressed={queueFilter === assignment} onClick={() => changeQueueFilter(assignment)}>{assignment === "all" ? "전체" : assignment === "mine" ? "내가 수정 중" : "수정자 없음"}</button>)}
        </div>
      </div> : null}
      {drafts.length ? <div className="recipe-review-layout">
        <div className="recipe-review-list" aria-label="살펴볼 레시피 목록">
          <span className="recipe-review-section-label">레시피 목록 {drafts.length}</span>
          {drafts.map((draft) => <button type="button" className={`recipe-review-list-item ${draft.id === selectedId ? "recipe-review-list-item-active" : ""}`} key={draft.id} onClick={() => selectDraft(draft)}><strong>{draft.title}</strong><small><MetadataText text={<>가져온 날 · {formatRetrievedAt(draft.retrieved_at)}</>} /></small></button>)}
        </div>
        {editor ? <div className="recipe-review-editor">
          <div className="recipe-review-source"><strong>{editor.title}</strong><small><MetadataText text={<>{editor.source_name} · {editor.license}</>} /></small><a href={editor.source_url} target="_blank" rel="noreferrer">원본 레시피 보기</a></div>
          {editorRefreshRequired ? <div className="recipe-review-editor-stale" role="alert"><div><strong>레시피 내용이 바뀌었어요</strong><small>다른 사람이 내용을 바꿨어요. 작성 중인 내용은 그대로 보관했어요. 새 내용을 불러와 이어서 수정해 주세요.</small></div><button className="recipe-review-claim-button" type="button" disabled={claiming || saving} onClick={reloadSelectedEditor}>새 내용 불러오기</button></div> : <div className={`recipe-review-claim-bar ${claimIsMine ? "recipe-review-claim-mine" : claimExpired ? "recipe-review-claim-expired" : activeClaim ? "recipe-review-claim-other" : "recipe-review-claim-open"}`} role="status">
            <div><strong>{claimIsMine ? "내가 수정 중" : activeClaim ? "다른 사람이 수정 중" : claimExpired ? "수정 시간이 끝났어요" : "수정 중인 사람 없음"}</strong><small><MetadataText text={<>{claimIsMine ? `${formatClaimExpiry(editor.claim_expires_at)} · ${canPublish ? "저장·공개·제외를 할 수 있어요." : "저장할 수 있지만 공개하거나 제외할 권한은 없어요."}` : activeClaim ? `${editor.claimed_by_email ?? "다른 운영자"} · ${formatClaimExpiry(editor.claim_expires_at)}` : "내용을 고치려면 수정을 시작해 주세요."}</>} /></small></div>
            {claimIsMine ? <button className="recipe-review-claim-button" type="button" disabled={claiming || saving} onClick={() => void release()}>수정 마치기</button> : activeClaim ? null : <button className="recipe-review-claim-button" type="button" disabled={claiming || saving} onClick={() => void claim()}>{claiming ? "수정 중" : "수정 시작"}</button>}
          </div>}
          <div className="recipe-review-fields"><label className="app-input-label" htmlFor="recipe-review-title">제목</label><KeyboardInput id="recipe-review-title" className="app-input" disabled={!canEdit} value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} /><label className="app-input-label" htmlFor="recipe-review-minutes">예상 조리시간(분)</label><KeyboardInput id="recipe-review-minutes" className="app-input" disabled={!canEdit} type="number" min="5" max="180" value={editor.estimated_minutes ?? ""} onChange={(event) => setEditor({ ...editor, estimated_minutes: event.target.value ? Number(event.target.value) : null })} /><label className="app-input-label" htmlFor="recipe-review-safety">안전 메모</label><KeyboardTextarea id="recipe-review-safety" className="app-input recipe-review-textarea" disabled={!canEdit} value={editor.safety_note ?? ""} onChange={(event) => setEditor({ ...editor, safety_note: event.target.value })} /></div>
          <div className="recipe-review-ingredients"><span className="recipe-review-section-label">재료 정보</span>{editor.ingredients.map((ingredient, index) => <div className="recipe-review-ingredient" key={`${editor.id}-${index}`}><div className="recipe-review-raw"><strong>{index + 1}. {ingredient.raw_text}</strong><small><MetadataText text={<>{ingredient.parsed_name ? `읽은 재료명: ${ingredient.parsed_name} ${ingredient.parsed_amount ?? ""}${ingredient.parsed_unit ?? ""} · 내용을 확인해 주세요.` : "재료명을 읽지 못했어요. 직접 입력해 주세요."}</>} /></small></div><div className="recipe-review-ingredient-inputs"><KeyboardInput className="app-input" disabled={!canEdit} aria-label={`${index + 1}번 상품명`} placeholder="상품명" value={ingredient.canonical_name ?? ""} onChange={(event) => updateIngredient(index, { canonical_name: event.target.value || null })} /><KeyboardInput className="app-input" disabled={!canEdit} aria-label={`${index + 1}번 수량`} type="number" min="0.001" step="0.001" placeholder="수량" value={ingredient.canonical_amount ?? ""} onChange={(event) => updateIngredient(index, { canonical_amount: event.target.value ? Number(event.target.value) : null })} /><KeyboardInput className="app-input" disabled={!canEdit} aria-label={`${index + 1}번 단위`} placeholder="단위" value={ingredient.canonical_unit ?? ""} onChange={(event) => updateIngredient(index, { canonical_unit: event.target.value || null })} /></div><button className={`recipe-review-ingredient-status ${ingredient.review_status === "approved" ? "recipe-review-ingredient-status-approved" : ""}`} disabled={!canEdit} type="button" onClick={() => updateIngredient(index, { review_status: ingredient.review_status === "approved" ? "pending" : "approved" })}>{ingredient.review_status === "approved" ? "확인 완료" : "재료 확인"}</button></div>)}</div>
          {auditEvents.length ? <div className="recipe-review-audit" aria-label="레시피 변경 기록"><span className="recipe-review-section-label">최근 변경</span>{auditEvents.slice().reverse().map((event) => <div className="recipe-review-audit-row" key={event.id}><span><strong>{event.action === "imported" ? "원본 가져옴" : event.action === "updated" ? "내용 수정" : event.action === "approved" ? "식단 공개" : event.action === "rejected" ? "공개 안 함" : event.action === "claimed" ? "수정 시작" : "수정 마침"}</strong><small><MetadataText text={<>{event.actor_email ?? event.actor_id} · {new Date(event.occurred_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</>} /></small></span><small>{auditEventDetail(event.action)}</small></div>)}</div> : null}
          <label className="recipe-review-checkbox"><input type="checkbox" disabled={!canEdit} checked={licenseConfirmed} onChange={(event) => setLicenseConfirmed(event.target.checked)} /><span>원본 이용조건·이미지 재사용 권한을 확인했습니다.</span></label>
          <label className="app-input-label" htmlFor="recipe-review-note">검토 메모</label><KeyboardTextarea id="recipe-review-note" className="app-input recipe-review-textarea" disabled={!canEdit} value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} placeholder="수정한 내용이나 공개하지 않을 이유를 적어 주세요." />
          <div className="recipe-review-actions"><button className="secondary-sheet-button" type="button" disabled={saving || !canEdit} onClick={() => void saveReview()}>저장</button><button className="primary-sheet-button" type="button" disabled={saving || !canEdit || !canPublish} onClick={() => void approve()}>식단에 공개</button><button className="recipe-review-reject-button" type="button" disabled={saving || !canEdit || !canPublish} onClick={() => void reject()}>공개 안 함</button></div>
        </div> : null}
      </div> : null}
    </div>
  );
}
