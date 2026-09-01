export type ApiStorageType = "ambient" | "refrigerated" | "frozen";
export type ApiDateKind = "production_date" | "packaging_date" | "sell_by" | "use_by" | "best_before" | "unknown" | "estimated_use_first" | "user_reminder";

export type ApiFood = {
  id: string;
  parent_lot_id?: string | null;
  canonical_name: string;
  display_name: string;
  brand: string;
  quantity: number;
  unit: string;
  storage_type: ApiStorageType;
  opened: boolean;
  date_assertion: {
    kind: ApiDateKind;
    value: string | null;
    display_label: string;
    source: string;
    source_detail: string;
    confidence: number;
    user_confirmed: boolean;
  };
  date_assertion_history?: Array<{
    kind: ApiDateKind;
    value: string | null;
    display_label: string;
    source: string;
    source_detail: string;
    confidence: number;
    user_confirmed: boolean;
  }>;
  estimated_use_first_window: {
    start_date: string;
    end_date: string;
    basis: string;
    confidence: number;
    safety_disclaimer: string;
  } | null;
  priority: number;
  category: string;
  image_path: string;
  note: string;
};

export type ApiDashboard = {
  generated_at: string;
  food_count: number;
  rescue_count: number;
  rescue_queue: ApiFood[];
  inventory: ApiFood[];
};

export type ApiAuthSession = {
  mode: "guest" | "account";
  user_id?: string;
  email?: string;
  workspace_id: string;
  access_token: string;
  token_type: "bearer";
  expires_at: string;
};

export type ApiAuthMe = {
  mode: "guest" | "account";
  user_id?: string;
  email?: string;
  workspace_id: string;
};

export type ApiStorageEvent = {
  id: string;
  food_id: string;
  event_type: "moved" | "opened" | "frozen" | "thawed" | "consumed" | "discarded";
  from_storage_type: ApiStorageType | null;
  to_storage_type: ApiStorageType | null;
  quantity: number | null;
  occurred_at: string;
  source: "user_input";
  created_child_food_id: string | null;
  meal_plan_id?: string | null;
};

export type ApiMealPlan = {
  id: string;
  snapshot_hash: string;
  saved_at: string | null;
  completed_at: string | null;
  consumed_food_ids: string[];
  completed_skipped_ingredients: string[];
  consumed_allocations: Array<{ food_id: string; quantity: number; unit?: string }>;
  recipe_id: string;
  planner_version: string;
  source: string;
  title: string;
  minutes: number;
  inventory_ids: string[];
  ingredients: Array<{
    canonical_name: string;
    amount: number;
    unit: string;
    available: boolean;
    available_food_id: string | null;
    available_quantity?: number | null;
    available_unit?: string | null;
    match_type?: "exact" | "alias" | "none";
    allocations?: Array<{ food_id: string; quantity: number; unit?: string }>;
  }>;
  missing_ingredients: string[];
  matched_ratio: number;
  score: number;
  reason: string;
  steps: string[];
  safety_note: string;
};

export type ApiMealPlanCompletion = {
  plan_id: string;
  status: "completed" | "already_completed";
  completed_at: string;
  consumed_food_ids: string[];
  consumed_allocations: Array<{ food_id: string; quantity: number; unit?: string }>;
  skipped_ingredients: Array<{
    canonical_name: string;
    food_id: string | null;
    reason: string;
  }>;
};

export type ApiMealPlanAuditEvent = {
  id: string;
  plan_id: string;
  event_type: "saved" | "completed";
  occurred_at: string;
  snapshot_hash: string;
  consumed_allocations: Array<{ food_id: string; quantity: number; unit?: string }>;
  skipped_ingredients: string[];
};

export type ApiReceiptLineInput = {
  raw_name: string;
  quantity: number;
  unit: string;
  unit_price?: number;
  total_price?: number;
  line_type?: "product" | "discount" | "refund" | "subtotal" | "payment" | "unknown";
  canonical_name?: string;
  match_confidence: number;
};

export type ApiReceiptDraft = {
  id: string;
  fingerprint: string;
  status: string;
  source_filename: string;
  purchased_at: string | null;
  lines: Array<{
    id: string;
    raw_name: string;
    canonical_name: string | null;
    quantity: number;
    unit: string;
    unit_price: number | null;
    total_price: number | null;
    line_type: string;
    match_confidence: number;
    review_status: string;
    review_reason: string | null;
  }>;
  stock_created: boolean;
};

export type ApiOcrReceiptIntake = {
  status: "review_required" | "needs_ocr_engine" | "failed";
  source_filename: string;
  file_sha256: string;
  engine: string;
  model_version: string | null;
  observations_count: number;
  message: string;
  quality: ApiQualityReport;
  receipt_kind: string | null;
  draft: ApiReceiptDraft | null;
};

export type ApiLabelDateCandidate = {
  kind: string;
  value: string;
  raw_text: string;
  confidence: number;
  requires_review: boolean;
  context: string;
};

export type ApiLabelIntake = {
  status: "review_required" | "needs_ocr_engine" | "failed";
  source_filename: string;
  file_sha256: string | null;
  engine: string;
  model_version: string | null;
  observations_count: number;
  product_name: string | null;
  barcode: string | null;
  storage_hint: string;
  date_candidates: ApiLabelDateCandidate[];
  consumption_date_candidate: ApiLabelDateCandidate | null;
  warnings: string[];
  requires_review: boolean;
  quality: ApiQualityReport | null;
};

export type ApiQualityReport = {
  status: "pass" | "review_required" | "reject";
  width: number | null;
  height: number | null;
  format: string | null;
  brightness: number | null;
  contrast: number | null;
  edge_energy: number | null;
  warnings: string[];
};

export type ApiBarcodeParse = {
  raw_scan: string;
  barcode_type: "gtin" | "gs1_data_carrier" | "restricted_circulation" | "unknown";
  gtin: string | null;
  lot: string | null;
  date_assertions: Array<{ kind: string; value: string; ai: string; confidence: number }>;
  warnings: string[];
  requires_review: boolean;
};

export type ApiProductLookup = {
  barcode: string;
  status: "matched" | "partial" | "not_found" | "provider_unavailable";
  candidates: Array<{
    source: string;
    source_url: string | null;
    canonical_name: string;
    brand: string | null;
    category: string | null;
    quantity_text: string | null;
    confidence: number;
    provenance_note: string;
  }>;
  warnings: string[];
  requires_review: boolean;
};

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const baseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, "") : "";
const API_TIMEOUT_MS = 8_000;
const GUEST_TOKEN_STORAGE_KEY = "rescue-meal.guest-token";
const AUTH_MODE_STORAGE_KEY = "rescue-meal.auth-mode";

function readGuestToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readAuthMode(): "guest" | "account" {
  if (typeof window === "undefined") return "guest";
  try {
    return window.localStorage.getItem(AUTH_MODE_STORAGE_KEY) === "account" ? "account" : "guest";
  } catch {
    return "guest";
  }
}

function persistAccessToken(token: string, mode: "guest" | "account") {
  guestToken = token;
  accessTokenMode = mode;
  try {
    window.localStorage.setItem(GUEST_TOKEN_STORAGE_KEY, token);
    window.localStorage.setItem(AUTH_MODE_STORAGE_KEY, mode);
  } catch {
    // Private browsing or storage policy can reject persistence.
  }
}

let guestToken = readGuestToken();
let accessTokenMode: "guest" | "account" | null = guestToken ? readAuthMode() : null;
let guestSessionPromise: Promise<string | null> | null = null;

export const mealApi = {
  get isConfigured() {
    return Boolean(baseUrl);
  },

  async registerAccount(input: { email: string; password: string }) {
    return accountRequest("/api/auth/register", input);
  },

  async loginAccount(input: { email: string; password: string }) {
    return accountRequest("/api/auth/login", input);
  },

  async getAuthMe() {
    return request<ApiAuthMe>("/api/auth/me");
  },

  clearSession() {
    clearAccessToken();
  },

  async logoutSession() {
    const token = guestToken;
    let revoked = false;
    if (baseUrl && token) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        revoked = response.ok || response.status === 401;
      } catch {
        // The local token is still cleared, but the caller can explain that
        // the server-side revoke could not be confirmed.
      }
    }
    clearAccessToken();
    return revoked;
  },

  async getDashboard() {
    return request<ApiDashboard>("/api/dashboard");
  },

  async createReceiptDraft(input: { source_filename: string; purchased_at: string; lines: ApiReceiptLineInput[] }) {
    return request<ApiReceiptDraft>("/api/receipts/drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async intakeReceipt(file: File) {
    return upload<ApiOcrReceiptIntake>("/api/receipts/intake", file);
  },

  async intakeLabel(file: File) {
    return upload<ApiLabelIntake>("/api/labels/intake", file);
  },

  async parseBarcode(rawScan: string) {
    return request<ApiBarcodeParse>("/api/barcodes/parse", {
      method: "POST",
      body: JSON.stringify({ raw_scan: rawScan }),
    });
  },

  async resolveProduct(barcode: string) {
    return request<ApiProductLookup>(`/api/products/resolve/${encodeURIComponent(barcode)}`);
  },

  async commitReceipt(receiptId: string, confirmedLineIds: string[], overrides: Record<string, { canonical_name: string }>) {
    return request<{ created_lot_ids: string[] }>(`/api/receipts/${receiptId}/commit`, {
      method: "POST",
      body: JSON.stringify({ confirmed_line_ids: confirmedLineIds, overrides }),
    });
  },

  async createStorageEvent(foodId: string, input: { event_type: "moved" | "opened" | "consumed" | "discarded"; to_storage_type?: ApiStorageType; quantity?: number }) {
    return request<ApiStorageEvent>(`/api/foods/${foodId}/storage-events`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getStorageEvents(foodId: string) {
    return request<ApiStorageEvent[]>(`/api/foods/${encodeURIComponent(foodId)}/storage-events`);
  },

  async updateDateAssertion(foodId: string, input: { kind: "use_by" | "best_before" | "user_reminder"; date_value: string; source_detail?: string }) {
    return request<ApiFood>(`/api/foods/${encodeURIComponent(foodId)}/date-assertion`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async createManualFood(input: {
    canonical_name: string;
    quantity: number;
    unit: string;
    storage_type: ApiStorageType;
    category: string;
    note: string;
    brand?: string;
    image_path?: string;
    date_kind?: ApiDateKind;
    date_value?: string;
    date_source?: string;
    date_source_detail?: string;
    user_confirmed?: boolean;
  }) {
    return request<ApiFood>("/api/foods", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async previewMealPlan(inventoryIds: string[]) {
    return request<ApiMealPlan>("/api/meal-plans/preview", {
      method: "POST",
      body: JSON.stringify({ inventory_ids: inventoryIds, max_minutes: 30 }),
    });
  },

  async saveMealPlan(inventoryIds: string[], planId?: string, snapshotHash?: string) {
    return request<ApiMealPlan>("/api/meal-plans", {
      method: "POST",
      body: JSON.stringify({ inventory_ids: inventoryIds, max_minutes: 30, ...(planId ? { plan_id: planId } : {}), ...(snapshotHash ? { snapshot_hash: snapshotHash } : {}) }),
    });
  },

  async getLatestMealPlan() {
    return request<ApiMealPlan | null>("/api/meal-plans/latest");
  },

  async getMealPlanEvents(planId: string) {
    return request<ApiMealPlanAuditEvent[]>(`/api/meal-plans/${encodeURIComponent(planId)}/events`);
  },

  async completeMealPlan(planId: string, consumptions?: Array<{ food_id: string; quantity: number }>) {
    return request<ApiMealPlanCompletion>(`/api/meal-plans/${encodeURIComponent(planId)}/complete`, {
      method: "POST",
      body: JSON.stringify(consumptions ? { consumptions } : {}),
    });
  },
};

async function request<T>(path: string, init: RequestInit = {}, canRefresh = true) {
  if (!baseUrl) return null;
  const token = await ensureGuestToken();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
  if (response.status === 401 && token && canRefresh && accessTokenMode === "guest") {
    clearAccessToken();
    return request<T>(path, init, false);
  }
  if (!response.ok) {
    throw new Error(`Rescue Meal API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function upload<T>(path: string, file: File, canRefresh = true) {
  if (!baseUrl) return null;
  const token = await ensureGuestToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    body: formData,
    headers,
  });
  if (response.status === 401 && token && canRefresh && accessTokenMode === "guest") {
    clearAccessToken();
    return upload<T>(path, file, false);
  }
  if (!response.ok) {
    throw new Error(`Rescue Meal API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function ensureGuestToken() {
  if (!baseUrl || guestToken) return guestToken;
  if (guestSessionPromise) return guestSessionPromise;
  guestSessionPromise = (async () => {
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/auth/guest`, { method: "POST" });
      if (!response.ok) return null;
      const payload = await response.json() as { access_token?: string };
      if (!payload.access_token) return null;
      persistAccessToken(payload.access_token, "guest");
      return guestToken;
    } catch {
      return null;
    } finally {
      guestSessionPromise = null;
    }
  })();
  return guestSessionPromise;
}

async function accountRequest(path: string, input: { email: string; password: string }) {
  if (!baseUrl) return null;
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(`Rescue Meal Auth API ${response.status}`);
  }
  const payload = await response.json() as ApiAuthSession;
  persistAccessToken(payload.access_token, payload.mode);
  return payload;
}

function clearAccessToken() {
  guestToken = null;
  accessTokenMode = null;
  try {
    window.localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_MODE_STORAGE_KEY);
  } catch {
    // Storage policy can reject removal in private browsing contexts.
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}
