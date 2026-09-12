import { broadcastWorkspaceMutation, type WorkspaceSyncChannel } from "./workspaceSync";

export type ApiStorageType = "ambient" | "refrigerated" | "frozen";
export type ApiStorageLocation = {
  id: string;
  name: string;
  storage_type: ApiStorageType;
  temperature_celsius: number | null;
  temperature_source: "sensor" | "user_input" | "not_measured";
  created_at: string;
};
export type ApiStorageLocationRevision = {
  revision: number;
};
export type ApiDateKind = "production_date" | "packaging_date" | "sell_by" | "use_by" | "best_before" | "unknown" | "estimated_use_first" | "user_reminder";
export type ApiBarcodeDateKind = Extract<ApiDateKind, "production_date" | "packaging_date" | "sell_by" | "use_by" | "best_before">;
export type ApiGrocySyncStatus = "not_configured" | "needs_mapping" | "queued" | "in_flight" | "succeeded" | "dead_letter" | "needs_reconciliation";
export type ApiGrocyLocationMapping = {
  storage_type: ApiStorageType;
  grocy_location_id: number;
  source: "user_confirmed" | "admin";
  updated_at: string;
};
export type ApiGrocyStatus = {
  configured: boolean;
  status: "disabled" | "ok" | "unavailable";
  version: string | null;
  detail: string;
};
export type ApiGrocyProductMapping = {
  canonical_name: string;
  grocy_product_id: number;
  grocy_unit: string | null;
  barcode: string | null;
  source: "user_confirmed" | "grocy_barcode" | "admin";
  updated_by?: string | null;
  updated_by_email?: string | null;
  updated_at: string;
};
export type ApiGrocyProductMappingAuditEvent = {
  id: string;
  canonical_name: string;
  action: "created" | "updated";
  actor_id: string;
  actor_email: string | null;
  occurred_at: string;
  before: ApiGrocyProductMapping | null;
  after: ApiGrocyProductMapping;
};
export type ApiGrocyOutboxStatus = "blocked" | "pending" | "in_flight" | "succeeded" | "dead_letter" | "reconciliation_required";
export type ApiGrocyOutboxRecord = {
  id: string;
  operation: "receipt_add" | "consume" | "open" | "transfer";
  aggregate_id: string;
  idempotency_key: string;
  canonical_name: string;
  grocy_product_id: number | null;
  quantity: number;
  unit: string;
  spoiled: boolean;
  from_grocy_location_id: number | null;
  to_grocy_location_id: number | null;
  payload: Record<string, unknown>;
  status: ApiGrocyOutboxStatus;
  attempts: number;
  last_error: string | null;
  last_dead_letter_error: string | null;
  manual_retry_count: number;
  last_retry_note: string | null;
  last_retry_at: string | null;
  in_flight_started_at: string | null;
  last_in_flight_started_at: string | null;
  reconciliation_count: number;
  last_reconciliation_decision: "already_applied" | "not_applied" | null;
  last_reconciliation_note: string | null;
  last_reconciled_at: string | null;
  grocy_transaction_id: string | null;
  created_at: string;
  updated_at: string;
};
export type ApiGrocyOutboxProcess = {
  processed: number;
  succeeded: number;
  retried: number;
  dead_lettered: number;
  blocked: number;
  records: ApiGrocyOutboxRecord[];
};
export type ApiGrocyWorkerHeartbeat = {
  workspace_id: string;
  worker_id: string;
  last_tick_at: string;
  last_success_at: string | null;
  lease_acquired: boolean;
  grocy_configured: boolean;
  scanned: number;
  reconciliation_marked: number;
  processed: number;
  succeeded: number;
  retried: number;
  dead_lettered: number;
  blocked: number;
  last_error: string | null;
};
export type ApiGrocyReconcileScan = {
  scanned: number;
  marked: number;
  records: ApiGrocyOutboxRecord[];
};

export type ApiProductSource = "local_fixture" | "open_food_facts" | "mfds_c005" | "mfds_i1250";
export type ApiProductProvenanceSource = ApiProductSource | "user_confirmed_alias" | "local_rule" | "parser";
export type ApiProductProvenance = {
  source: ApiProductProvenanceSource;
  source_url: string | null;
  confidence: number;
  note: string;
  storage_hint: ApiStorageType | null;
  source_freshness: "current" | "legacy" | "unknown";
};
export type ApiProductProvenanceAuditEvent = {
  id: string;
  food_id: string;
  action: "applied" | "replaced" | "removed";
  actor_id: string;
  actor_role: "guest" | "user" | "recipe_admin";
  occurred_at: string;
  before: ApiProductProvenance | null;
  after: ApiProductProvenance | null;
  reason: string;
};
export type ApiFoodProductInfoSnapshot = {
  canonical_name: string;
  display_name: string;
  brand: string;
  category: string;
  product_provenance: ApiProductProvenance | null;
};
export type ApiFoodProductInfoAuditEvent = {
  id: string;
  food_id: string;
  action: "updated";
  actor_id: string;
  actor_role: "guest" | "user" | "recipe_admin";
  occurred_at: string;
  before: ApiFoodProductInfoSnapshot;
  after: ApiFoodProductInfoSnapshot;
  reason: string;
};

export type ApiFood = {
  id: string;
  parent_lot_id?: string | null;
  source_receipt_id?: string | null;
  source_receipt_line_id?: string | null;
  purchased_at?: string | null;
  barcode?: string | null;
  barcode_lot?: string | null;
  product_provenance?: ApiProductProvenance | null;
  canonical_name: string;
  display_name: string;
  brand: string;
  quantity: number;
  unit: string;
  storage_type: ApiStorageType;
  storage_location_id?: string | null;
  opened: boolean;
  opened_at?: string | null;
  date_assertion: {
    kind: ApiDateKind;
    value: string | null;
    display_label: string;
    source: string;
    source_detail: string;
    confidence: number;
    user_confirmed: boolean;
    applicable_storage_type: ApiStorageType | null;
    storage_condition_text: string | null;
  };
  date_assertion_history?: Array<{
    kind: ApiDateKind;
    value: string | null;
    display_label: string;
    source: string;
    source_detail: string;
    confidence: number;
    user_confirmed: boolean;
    applicable_storage_type: ApiStorageType | null;
    storage_condition_text: string | null;
  }>;
  estimated_use_first_window: {
    start_date: string;
    end_date: string;
    basis: string;
    confidence: number;
    safety_disclaimer: string;
    inference_trace?: {
      provider: string;
      provider_version: string;
      rule_id: string | null;
      evidence_refs: string[];
      reasoning: string[];
      input_sha256: string;
    } | null;
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
  storage_locations?: ApiStorageLocation[];
};

export type ApiDashboardRevision = {
  revision: number;
};

export type ApiInventorySearch = {
  items: ApiFood[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  query: string;
  storage_type: ApiStorageType | null;
  storage_location_id?: string | null;
};

export type ApiDashboardCache = {
  payload: ApiDashboard;
  saved_at: string;
};

export type ApiNotification = {
  id: string;
  kind: "date_due" | "date_check" | "storage_mismatch" | "grocy_sync";
  severity: "urgent" | "attention" | "info";
  title: string;
  message: string;
  canonical_name: string;
  food_id: string | null;
  due_date: string | null;
  source: "printed_date" | "user_reminder" | "estimated_window" | "unknown_date" | "storage_condition" | "grocy_outbox";
  action: "food" | "grocy" | "none";
  read_at: string | null;
  created_at: string;
};

export type ApiNotificationReadAll = {
  marked: number;
};

export type ApiNotificationPreferences = {
  in_app_enabled: boolean;
  push_enabled: boolean;
  lead_days: number;
  timezone: string;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export type ApiNotificationWorkerHeartbeat = {
  workspace_id: string;
  worker_id: string;
  last_tick_at: string;
  last_success_at: string | null;
  lease_acquired: boolean;
  push_configured: boolean;
  queued: number;
  processed: number;
  succeeded: number;
  retried: number;
  dead_lettered: number;
  cancelled: number;
  removed_subscriptions: number;
  recovered_in_flight: number;
  last_error: string | null;
};

export type ApiPushSubscriptionSummary = {
  endpoint_fingerprint: string;
  created_at: string;
  updated_at: string;
};

export type ApiPushSubscriptionDelete = {
  endpoint_fingerprint: string;
  removed: boolean;
};

export type ApiAuthSession = {
  mode: "guest" | "account";
  user_id?: string;
  email?: string;
  workspace_id: string;
  role?: "guest" | "user" | "recipe_admin";
  access_token: string;
  token_type: "bearer";
  expires_at: string;
};

export type ApiAccountDeletion = {
  status: "deleted";
  message: string;
};

export type ApiAuthMe = {
  mode: "guest" | "account";
  user_id?: string;
  email?: string;
  workspace_id: string;
  role?: "guest" | "user" | "recipe_admin";
  account_status?: "active" | "deleting";
};

export type ApiGuestTransferPreview = {
  status: "ready" | "empty" | "already_transferred" | "conflict";
  food_count: number;
  receipt_count: number;
  storage_event_count: number;
  meal_plan_count: number;
  multi_day_plan_count: number;
  shopping_list_count: number;
  shopping_receive_operation_count: number;
  storage_location_count?: number;
  meal_preferences_changed: boolean;
  push_subscription_count: number;
  notification_preferences_changed: boolean;
  message: string;
};

export type ApiGuestTransfer = {
  status: "completed" | "already_transferred";
  imported_food_count: number;
  imported_receipt_count: number;
  imported_storage_event_count: number;
  imported_meal_plan_count: number;
  imported_multi_day_plan_count: number;
  imported_shopping_list_count: number;
  imported_shopping_receive_operation_count: number;
  imported_storage_location_count?: number;
  imported_meal_preferences: boolean;
  imported_push_subscription_count: number;
  imported_notification_preferences: boolean;
  message: string;
};

export type ApiPasswordResetRequestResponse = {
  accepted: true;
  delivery_status: "accepted";
  message: string;
};

export type ApiStorageEvent = {
  id: string;
  food_id: string;
  event_type: "moved" | "opened" | "frozen" | "thawed" | "consumed" | "discarded";
  from_storage_type: ApiStorageType | null;
  to_storage_type: ApiStorageType | null;
  from_storage_location_id?: string | null;
  to_storage_location_id?: string | null;
  quantity: number | null;
  occurred_at: string;
  source: "user_input";
  created_child_food_id: string | null;
  meal_plan_id?: string | null;
  grocy_sync_status?: ApiGrocySyncStatus;
  inventory?: ApiFood[];
};

export type ApiStorageEventSequence = {
  events: ApiStorageEvent[];
  final_food_id: string;
  idempotency_replayed: boolean;
};

export type ApiMealPlan = {
  id: string;
  snapshot_hash: string;
  recipe_source_name?: string;
  recipe_source_url?: string | null;
  recipe_license?: string;
  recipe_source_revision?: string;
  saved_at: string | null;
  completed_at: string | null;
  consumed_food_ids: string[];
  completed_skipped_ingredients: string[];
  consumed_allocations: Array<{ food_id: string; quantity: number; unit?: string }>;
  bundle_id?: string | null;
  bundle_day_index?: number | null;
  allergens?: string[] | null;
  allergen_metadata_status?: "known" | "unknown";
  preference_filtered?: boolean;
  preference_note?: string | null;
  date_review_required?: boolean;
  date_review_foods?: string[];
  date_review_note?: string | null;
  recipe_id: string;
  planner_version: string;
  source: string;
  title: string;
  minutes: number;
  max_minutes: number;
  servings?: number;
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
    quantity_match?: "exact" | "converted" | "incompatible" | "missing";
    allocations?: Array<{ food_id: string; quantity: number; unit?: string }>;
  }>;
  missing_ingredients: string[];
  matched_ratio: number;
  score: number;
  reason: string;
  steps: string[];
  safety_note: string;
};

export type ApiMealPlanOptions = {
  options: ApiMealPlan[];
  max_minutes: number;
  servings?: number;
  inventory_ids: string[];
};

export type ApiMultiDayMealPlan = {
  id: string;
  snapshot_hash: string;
  generated_at: string;
  saved_at: string | null;
  optimization_engine?: "or-tools-cp-sat" | "deterministic-greedy";
  servings?: number;
  max_minutes: number;
  inventory_ids: string[];
  days: Array<{
    day_index: number;
    plan_date: string;
    plan: ApiMealPlan;
    status: "planned" | "saved" | "completed";
    meal_plan_id: string | null;
    completed_at: string | null;
  }>;
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
  grocy_sync_status?: ApiGrocySyncStatus;
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

export type ApiRecipeDraftIngredient = {
  raw_text: string;
  parsed_name: string | null;
  parsed_amount: number | null;
  parsed_unit: string | null;
  canonical_name: string | null;
  canonical_amount: number | null;
  canonical_unit: string | null;
  review_status: "pending" | "approved" | "rejected";
};

export type ApiRecipeDraft = {
  id: string;
  source_id: string;
  title: string;
  category: string | null;
  cooking_method: string | null;
  ingredients: ApiRecipeDraftIngredient[];
  steps: string[];
  image_url: string | null;
  source_name: string;
  source_url: string;
  license: string;
  source_revision: string;
  retrieved_at: string;
  status: "pending" | "approved" | "rejected";
  reviewer_note: string;
  safety_note: string | null;
  estimated_minutes: number | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  claimed_by: string | null;
  claimed_by_email: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
};

export type ApiRecipeReviewAuditEvent = {
  id: string;
  draft_id: string;
  action: "imported" | "updated" | "approved" | "rejected" | "claimed" | "released";
  actor_id: string;
  actor_email: string | null;
  occurred_at: string;
  before_status: "pending" | "approved" | "rejected" | null;
  after_status: "pending" | "approved" | "rejected" | null;
  changed_fields: string[];
  draft_snapshot_hash: string;
};

export type ApiRecipeSourceStatus = {
  provider: "cookrcp01";
  service_id: string;
  configured: boolean;
  status: "disabled" | "ready";
  source_name: string;
  source_url: string;
  detail: string;
};

export type ApiRecipeReviewCapabilities = {
  can_review: boolean;
  can_publish: boolean;
  publisher_policy: "all_recipe_admins" | "publisher_allowlist";
  ownership_enabled: boolean;
  actor_type: "account" | "legacy_token";
};

export type ApiRecipeReviewRevision = {
  revision: number;
};

export type ApiMealPlanRevision = {
  revision: number;
};

export type ApiNotificationRevision = {
  revision: number;
};

export type ApiRecipeDraftImportResponse = {
  total_count: number;
  accepted_count: number;
  persisted_count: number;
  rejected_count: number;
  draft_ids: string[];
  rejected_rows: Array<{ row_index: number; reason: string }>;
  source_name: string;
  source_url: string;
  source_revision: string;
  retrieved_at: string;
};

export type ApiRecipeReviewAssignment = "all" | "mine" | "unassigned";

export type ApiReceiptLineInput = {
  raw_name: string;
  quantity: number;
  unit: string;
  barcode?: string | null;
  unit_price?: number;
  total_price?: number;
  line_type?: "product" | "discount" | "refund" | "subtotal" | "payment" | "unknown";
  canonical_name?: string;
  match_confidence: number;
  match_source?: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched";
};

export type ApiReceiptDraft = {
  id: string;
  fingerprint: string;
  status: string;
  source_filename: string;
  purchased_at: string | null;
  template_id?: "grocery-mart-v1" | "retail-beverage-v1" | "restaurant-card-v1" | "grocery-generic-v1" | "generic-v1";
  template_confidence?: number;
  merchant_name?: string | null;
  lines: Array<{
    id: string;
    raw_name: string;
    barcode: string | null;
    canonical_name: string | null;
    quantity: number;
    unit: string;
    storage_suggestion: ApiStorageType | null;
    unit_price: number | null;
    total_price: number | null;
    line_type: string;
    match_confidence: number;
    review_status: string;
    review_reason: string | null;
    match_source: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched";
    source_observation_ids?: string[];
    match_candidates: Array<{
      source: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched";
      source_url?: string | null;
      canonical_name: string;
      brand?: string | null;
      category?: string | null;
      quantity_text?: string | null;
      confidence: number;
      provenance_note: string;
      shelf_life_text: string | null;
      storage_hint: ApiStorageType | null;
      source_freshness: "current" | "legacy" | "unknown";
    }>;
  }>;
  stock_created: boolean;
};

export type ApiReceiptSummary = {
  id: string;
  status: "uploaded" | "extracting" | "review_required" | "confirmed" | "committed" | "rejected";
  purchased_at: string | null;
  merchant_name?: string | null;
  stock_created: boolean;
  line_count: number;
  source_redacted: boolean;
};

export type ApiReceiptRevision = {
  revision: number;
};

export type ApiReceiptCommitResponse = {
  receipt_id: string;
  status: "committed";
  commit_transaction_id: string;
  created_lot_ids: string[];
  skipped_line_ids: string[];
  inventory: ApiFood[];
  grocy_sync_status: ApiGrocySyncStatus;
  idempotency_replayed: boolean;
};

export type ApiOcrReviewObservation = {
  id: string;
  bbox: [number, number, number, number];
  confidence: number;
};

export type ApiProductEnrichmentJob = {
  id: string;
  receipt_id: string;
  line_ids: string[];
  status: "queued" | "in_flight" | "succeeded" | "dead_letter";
  attempts: number;
  processed_lines: number;
  enriched_candidates: number;
  last_error: string | null;
  next_attempt_at: string;
  in_flight_started_at: string | null;
  last_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApiReceiptPrivacyPolicy = {
  raw_upload_retention: "transient";
  raw_upload_retention_days: 0;
  draft_metadata: "user_deletable";
  committed_receipt_behavior: "redact_source_preserve_inventory";
  message: string;
};

export type ApiReceiptPrivacyErase = {
  receipt_id: string;
  status: "deleted_draft" | "redacted_pending" | "redacted_committed";
  inventory_preserved: boolean;
  raw_upload_retained: boolean;
  redacted_fields: string[];
};

export type ApiWorkspaceExport = {
  schema_version: "rescue-meal-export-v1";
  exported_at: string;
  workspace_id: string;
  inventory: ApiFood[];
  storage_locations?: ApiStorageLocation[];
  receipt_summaries: ApiReceiptSummary[];
  product_provenance_events: ApiProductProvenanceAuditEvent[];
  product_info_events: ApiFoodProductInfoAuditEvent[];
  storage_events: ApiStorageEvent[];
  commit_transactions: Array<{
    id: string;
    receipt_id: string;
    fingerprint: string;
    status: "pending" | "committed" | "needs_reconciliation" | "rolled_back";
    error_code: string | null;
    grocy_sync_status: ApiGrocySyncStatus;
  }>;
  meal_plans: ApiMealPlan[];
  multi_day_meal_plans: ApiMultiDayMealPlan[];
  shopping_list: ApiShoppingListItem[];
  shopping_receive_operations: Array<{
    id: string;
    shopping_item_id: string;
    food_id: string;
    canonical_name: string;
    unit: string;
    quantity: number;
    storage_type: ApiStorageType;
    storage_location_id?: string | null;
    request_fingerprint: string;
    idempotency_key_digest: string | null;
    request_payload_fingerprint: string | null;
    occurred_at: string;
  }>;
  manual_food_operations: Array<{
    id: string;
    food_id: string;
    lot_action: "create" | "correct";
    idempotency_key_digest: string;
    request_payload_fingerprint: string;
    occurred_at: string;
  }>;
  meal_preferences: ApiMealPreferences;
  notification_preferences: ApiNotificationPreferences;
  push_subscriptions: ApiPushSubscriptionSummary[];
};

export type ApiShoppingListSource = {
  source_type: "meal_plan" | "multi_day" | "manual";
  source_id: string;
  day_index: number | null;
  quantity: number;
};

export type ApiShoppingListItem = {
  id: string;
  canonical_name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  sources: ApiShoppingListSource[];
  created_at: string;
  updated_at: string;
};

export type ApiShoppingListRevision = {
  revision: number;
};

export type ApiShoppingListMutation = {
  items: ApiShoppingListItem[];
  added_count: number;
  updated_count: number;
  removed_count: number;
};

export type ApiShoppingListReceiveResponse = {
  status: "received";
  shopping_item_id: string;
  received_quantity: number;
  inventory_lot: ApiFood;
  items: ApiShoppingListItem[];
  removed_planned_source_count: number;
  idempotency_replayed: boolean;
};

export type ApiAllergenCode = "soy" | "egg" | "milk" | "fish" | "shellfish" | "wheat" | "peanut" | "tree_nut";

export type ApiMealPreferences = {
  avoid_allergens: ApiAllergenCode[];
};

export type MealApiDeploymentMode = "demo" | "production";
export type ClientErrorKind = "error" | "type_error" | "range_error" | "reference_error" | "syntax_error" | "chunk_load_error" | "unknown";

export type ApiClientErrorReport = {
  status: "accepted" | "disabled";
  request_id: string;
};

export type ApiWorkspaceConflict = {
  code: "workspace_revision_conflict";
  detail: string;
  retryable: true;
  action: "reload_and_retry";
  expected_revision?: number;
  current_revision?: number;
};

export class MealApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;
  readonly expectedRevision: number | null;
  readonly currentRevision: number | null;
  readonly currentCatalogRevision: number | null;

  constructor(
    status: number,
    message = `Rescue Meal API ${status}`,
    metadata: {
      code?: string | null;
      retryable?: boolean;
      expectedRevision?: number | null;
      currentRevision?: number | null;
      currentCatalogRevision?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "MealApiError";
    this.status = status;
    this.code = metadata.code ?? null;
    this.retryable = metadata.retryable ?? false;
    this.expectedRevision = metadata.expectedRevision ?? null;
    this.currentRevision = metadata.currentRevision ?? null;
    this.currentCatalogRevision = metadata.currentCatalogRevision ?? null;
  }
}

export function isMealApiAuthError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.status === 401;
}

export function isMealApiExportRateLimitError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "account_export_rate_limited";
}

export function isMealApiConflictError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.status === 409;
}

export function isMealApiWorkspaceConflictError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "workspace_revision_conflict";
}

export function isMealApiGuestTransferPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "guest_transfer_persistence_unavailable";
}

export function isMealApiAccountDeletionPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "account_deletion_persistence_unavailable";
}

export function isMealApiReceiptCommitPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && (
    error.code === "receipt_commit_persistence_unavailable"
    || error.code === "receipt_commit_reconciliation_unavailable"
  );
}

export function isMealApiMealPlanCompletionPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "meal_plan_completion_persistence_unavailable";
}

export function isMealApiMealPlanPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "meal_plan_persistence_unavailable";
}

export function isMealApiMultiDayPlanPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "multi_day_plan_persistence_unavailable";
}

export function isMealApiRecipeCatalogConflictError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "recipe_catalog_revision_conflict";
}

export function isMealApiFoodLotSelectionError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "food_lot_selection_required";
}

export function isMealApiFoodDateConfirmedError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "food_date_already_confirmed";
}

export function isMealApiFoodDatePersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "food_date_persistence_unavailable";
}

export function isMealApiShoppingListPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && (
    error.code === "shopping_list_item_persistence_unavailable"
    || error.code === "shopping_list_persistence_unavailable"
  );
}

export function isMealApiShoppingReceivePersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "shopping_receive_persistence_unavailable";
}

export function isMealApiStorageEventPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && (
    error.code === "storage_event_persistence_unavailable"
    || error.code === "storage_event_sequence_persistence_unavailable"
  );
}

export function isMealApiStorageLocationPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "storage_location_persistence_unavailable";
}

export function isMealApiManualFoodPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "manual_food_persistence_unavailable";
}

export function isMealApiReceiptDraftPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "receipt_draft_persistence_unavailable";
}

export function isMealApiReceiptPrivacyPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "receipt_privacy_persistence_unavailable";
}

export function isMealApiProductEnrichmentPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "product_enrichment_persistence_unavailable";
}

export function isMealApiProductInfoPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "product_info_persistence_unavailable";
}

export function isMealApiProductProvenancePersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "product_provenance_persistence_unavailable";
}

export function isMealApiMealPreferencesPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "meal_preferences_persistence_unavailable";
}

export function isMealApiNotificationPreferencesPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "notification_preferences_persistence_unavailable";
}

export function isMealApiPushSubscriptionPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "push_subscription_persistence_unavailable";
}

export function isMealApiNotificationReadPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "notification_read_persistence_unavailable";
}

export function isMealApiGrocyMappingPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "grocy_mapping_persistence_unavailable";
}

export function isMealApiGrocyLocationMappingPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "grocy_location_mapping_persistence_unavailable";
}

export function isMealApiGrocyOutboxPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "grocy_outbox_persistence_unavailable";
}

export function isMealApiRecipeReviewPersistenceError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "recipe_review_persistence_unavailable";
}

export function isMealApiRecipeReviewClaimError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && (
    error.code === "recipe_review_claim_required"
    || error.code === "recipe_review_claim_conflict"
    || error.code === "recipe_review_claim_expired"
    || error.code === "recipe_review_claim_unavailable"
  );
}

export function isMealApiRecipePublishError(error: unknown): error is MealApiError {
  return error instanceof MealApiError && error.code === "recipe_review_publish_forbidden";
}

export const MEAL_API_WORKSPACE_CONFLICT_MESSAGE = "다른 기기에서 먼저 변경했어요. 최신 목록을 불러왔습니다. 내용을 확인한 뒤 다시 시도해 주세요.";

export type ApiOcrReceiptIntake = {
  status: "review_required" | "needs_ocr_engine" | "failed";
  source_filename: string;
  file_sha256: string;
  engine: string;
  model_version: string | null;
  observations_count: number;
  message: string;
  quality: ApiQualityReport;
  ocr_input_profile?: "source" | "low_contrast_enhanced";
  receipt_kind: string | null;
  review_observations?: ApiOcrReviewObservation[];
  draft: ApiReceiptDraft | null;
};

export type ApiLabelDateCandidate = {
  kind: string;
  value: string;
  raw_text: string;
  confidence: number;
  requires_review: boolean;
  context: string;
  source_observation_ids?: string[];
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
  storage_condition_text: string | null;
  date_candidates: ApiLabelDateCandidate[];
  consumption_date_candidate: ApiLabelDateCandidate | null;
  review_observations?: ApiOcrReviewObservation[];
  warnings: string[];
  requires_review: boolean;
  quality: ApiQualityReport | null;
  ocr_input_profile?: "source" | "low_contrast_enhanced";
};

export type ApiPriorityInference = {
  provider: string;
  provider_version: string;
  input_sha256: string;
  canonical_name: string | null;
  category: string | null;
  storage_type: ApiStorageType | null;
  storage_confidence: number;
  estimated_use_first_window: {
    start_date: string;
    end_date: string;
    range_days: string;
    rule_id: string;
  } | null;
  reasoning: string[];
  evidence_refs: string[];
  requires_confirmation: boolean;
  abstained: boolean;
  abstain_reason: string | null;
  safety_disclaimer: string;
};

export type ApiQualityReport = {
  status: "pass" | "review_required" | "reject";
  width: number | null;
  height: number | null;
  format: string | null;
  brightness: number | null;
  contrast: number | null;
  edge_energy: number | null;
  blur_score?: number | null;
  orientation_corrected?: boolean;
  warnings: string[];
};

export type ApiBarcodeParse = {
  raw_scan: string;
  barcode_type: "gtin" | "gs1_data_carrier" | "restricted_circulation" | "unknown";
  gtin: string | null;
  lot: string | null;
  date_assertions: Array<{ kind: ApiBarcodeDateKind; value: string; ai: string; confidence: number }>;
  warnings: string[];
  requires_review: boolean;
};

export type ApiProductLookup = {
  barcode: string;
  status: "matched" | "partial" | "not_found" | "provider_unavailable";
  candidates: Array<{
    source: ApiProductSource;
    source_url: string | null;
    canonical_name: string;
    brand: string | null;
    category: string | null;
    quantity_text: string | null;
    confidence: number;
    provenance_note: string;
    shelf_life_text: string | null;
    storage_hint: "ambient" | "refrigerated" | "frozen" | null;
    source_freshness: "current" | "legacy" | "unknown";
  }>;
  warnings: string[];
  requires_review: boolean;
  provider_statuses: Record<string, "matched" | "not_found" | "unavailable" | "rate_limited" | "disabled">;
};

export type ApiProductNameLookup = {
  query: string;
  provider: "mfds_i1250" | "open_food_facts";
  status: "matched" | "not_found" | "unavailable" | "rate_limited" | "disabled";
  candidates: ApiProductLookup["candidates"];
  warnings: string[];
  requires_review: boolean;
};

const configuredBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const baseUrl = configuredBaseUrl ? configuredBaseUrl.replace(/\/$/, "") : "";
const configuredDeploymentMode = (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined)?.trim().toLowerCase() ?? "";
const deploymentMode: MealApiDeploymentMode | "invalid" = !configuredDeploymentMode
  ? (import.meta.env.PROD ? "invalid" : "demo")
  : configuredDeploymentMode === "demo"
    ? "demo"
    : configuredDeploymentMode === "production"
      ? "production"
      : "invalid";

function runtimeConfigurationError() {
  if (deploymentMode === "invalid") {
    return import.meta.env.PROD && !configuredDeploymentMode
      ? "production 빌드에는 VITE_DEPLOYMENT_MODE를 명시해야 해요. demo 또는 production 중 하나를 선택해 주세요."
      : "VITE_DEPLOYMENT_MODE는 demo 또는 production이어야 해요.";
  }
  if (deploymentMode !== "production") return null;
  if (!configuredBaseUrl) return "production 모드에는 VITE_API_BASE_URL이 필요해요. API가 없는 상태로 데모 fixture를 실행하지 않습니다.";
  try {
    const apiUrl = new URL(configuredBaseUrl);
    if (apiUrl.protocol !== "https:") return "production 모드의 VITE_API_BASE_URL은 HTTPS 주소여야 해요.";
    if (apiUrl.username || apiUrl.password) return "API URL에 계정 정보를 직접 넣을 수 없어요.";
  } catch {
    return "VITE_API_BASE_URL은 완전한 HTTPS URL이어야 해요.";
  }
  return null;
}

const configurationError = runtimeConfigurationError();
const API_TIMEOUT_MS = 8_000;
const GUEST_TOKEN_STORAGE_KEY = "rescue-meal.guest-token";
const AUTH_MODE_STORAGE_KEY = "rescue-meal.auth-mode";
const DASHBOARD_CACHE_KEY_PREFIX = "rescue-meal.dashboard-cache.v1";
const WORKSPACE_REVISION_REQUEST_HEADER = "If-Rescue-Meal-Revision";
const WORKSPACE_REVISION_RESPONSE_HEADER = "X-Rescue-Meal-Workspace-Revision";
const RECIPE_CATALOG_REVISION_REQUEST_HEADER = "If-Rescue-Meal-Recipe-Catalog-Revision";
const RECIPE_CATALOG_REVISION_RESPONSE_HEADER = "X-Rescue-Meal-Recipe-Catalog-Revision";
export const RECIPE_REVIEW_SYNC_WORKSPACE_KEY = "recipe-catalog";
const WORKSPACE_MUTATION_BROADCAST_EXEMPT_PATHS = new Set([
  "/api/account/guest-transfer/preview",
  "/api/barcodes/parse",
  "/api/inference/priority",
  "/api/labels/intake",
  "/api/labels/parse-text",
  "/api/meal-plans/multi-day-preview",
  "/api/meal-plans/options",
  "/api/meal-plans/preview",
]);
const WORKSPACE_REVISION_EXEMPT_PATHS = new Set([
  "/api/account/delete",
  "/api/account/guest-transfer/preview",
  "/api/auth/password/change",
  "/api/barcodes/parse",
  "/api/inference/priority",
  "/api/labels/intake",
  "/api/labels/parse-text",
  "/api/meal-plans/multi-day-preview",
  "/api/meal-plans/options",
  "/api/meal-plans/preview",
]);

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
  workspaceRevision = null;
  recipeCatalogRevision = null;
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
let workspaceRevision: number | null = null;
let recipeCatalogRevision: number | null = null;

function dashboardWorkspaceNamespace(token: string | null) {
  if (!token) return "anonymous";
  const parts = token.split(".");
  if (parts[0] === "rm1" && parts[1]) return `guest-${parts[1]}`;
  if (parts[0] === "ra1" && parts[2]) return `account-${parts[2]}`;
  return "anonymous";
}

function shouldSendWorkspaceRevision(path: string, method: string) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  if (path.split("?", 1)[0].startsWith("/api/recipe-review/")) return false;
  return !WORKSPACE_REVISION_EXEMPT_PATHS.has(path.split("?", 1)[0]);
}

function shouldSendRecipeCatalogRevision(path: string, method: string) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return path.split("?", 1)[0].startsWith("/api/recipe-review/");
}

function workspaceMutationChannels(path: string): WorkspaceSyncChannel[] | "all" {
  const route = path.split("?", 1)[0];
  if (route.startsWith("/api/recipe-review/")) {
    return ["recipe-review"];
  }
  if (route.startsWith("/api/shopping-list")) {
    return ["dashboard", "shopping-list", "inventory-search", "notifications"];
  }
  if (route.startsWith("/api/storage-locations")) {
    return ["dashboard", "storage-locations", "inventory-search"];
  }
  if (route.startsWith("/api/notifications") || route.startsWith("/api/notification-preferences") || route.startsWith("/api/push/")) {
    return ["dashboard", "notifications", "account-notification-preferences"];
  }
  if (route === "/api/meal-plans" || route.startsWith("/api/meal-plans/")) {
    return ["dashboard", "meal-plan", "notifications", "shopping-list", "inventory-search"];
  }
  if (route.startsWith("/api/receipts")) {
    return ["dashboard", "inventory-search", "notifications", "receipt-summaries", "account-receipt-privacy"];
  }
  if (route.startsWith("/api/foods/")) {
    return ["dashboard", "inventory-search", "notifications", "receipt-summaries"];
  }
  if (route.startsWith("/api/integrations/grocy")) {
    return ["dashboard", "inventory-search", "notifications", "account-grocy"];
  }
  if (route.startsWith("/api/privacy")) {
    return ["receipt-summaries", "account-receipt-privacy"];
  }
  if (route.startsWith("/api/meal-preferences")) {
    return ["dashboard", "meal-plan"];
  }
  return "all";
}

function shouldBroadcastWorkspaceMutation(path: string, method: string) {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  return !WORKSPACE_MUTATION_BROADCAST_EXEMPT_PATHS.has(path.split("?", 1)[0]);
}

function mutationWorkspaceKey(path: string) {
  return path.split("?", 1)[0].startsWith("/api/recipe-review/")
    ? RECIPE_REVIEW_SYNC_WORKSPACE_KEY
    : dashboardWorkspaceNamespace(guestToken);
}

function dashboardCacheKey() {
  return `${DASHBOARD_CACHE_KEY_PREFIX}:${dashboardWorkspaceNamespace(guestToken)}`;
}

function isApiDashboard(value: unknown): value is ApiDashboard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ApiDashboard>;
  return typeof candidate.generated_at === "string"
    && typeof candidate.food_count === "number"
    && typeof candidate.rescue_count === "number"
    && Array.isArray(candidate.rescue_queue)
    && Array.isArray(candidate.inventory);
}

function cacheDashboard(payload: ApiDashboard) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(dashboardCacheKey(), JSON.stringify({ payload, saved_at: new Date().toISOString() } satisfies ApiDashboardCache));
  } catch {
    // A private browsing or quota policy should not make the API request fail.
  }
}

function readDashboardCache(): ApiDashboardCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(dashboardCacheKey());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ApiDashboardCache>;
    if (!parsed || typeof parsed.saved_at !== "string" || !isApiDashboard(parsed.payload)) return null;
    const savedAt = new Date(parsed.saved_at);
    if (Number.isNaN(savedAt.getTime())) return null;
    return { payload: parsed.payload, saved_at: savedAt.toISOString() };
  } catch {
    return null;
  }
}

export function createReceiptCommitIdempotencyKey(): string {
  const suffix = typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `receipt-commit:${suffix}`;
}

export const mealApi = {
  get isConfigured() {
    return Boolean(baseUrl) && !configurationError;
  },

  get deploymentMode(): MealApiDeploymentMode {
    return deploymentMode === "production" ? "production" : "demo";
  },

  get configurationError() {
    return configurationError;
  },

  get guestToken() {
    return accessTokenMode === "guest" && guestToken;
  },

  get workspaceKey() {
    return dashboardWorkspaceNamespace(guestToken);
  },

  get recipeCatalogRevision() {
    return recipeCatalogRevision;
  },

  get workspaceRevision() {
    return workspaceRevision;
  },

  async prepareWorkspace() {
    await ensureGuestToken();
    return dashboardWorkspaceNamespace(guestToken);
  },

  async reportClientError(input: { surface: "prototype"; error_kind: ClientErrorKind; release: string }) {
    if (!baseUrl || configurationError) return null;
    const headers = new Headers({ "Content-Type": "application/json" });
    if (guestToken) headers.set("Authorization", `Bearer ${guestToken}`);
    try {
      const response = await fetchWithTimeout(`${baseUrl}/api/client-errors`, {
        method: "POST",
        headers,
        body: JSON.stringify(input),
      }, undefined, 1_500);
      if (!response.ok) return null;
      return await response.json() as ApiClientErrorReport;
    } catch {
      return null;
    }
  },

  async registerAccount(input: { email: string; password: string }) {
    return accountRequest("/api/auth/register", input);
  },

  async loginAccount(input: { email: string; password: string }) {
    return accountRequest("/api/auth/login", input);
  },

  async changePassword(input: { current_password: string; new_password: string }) {
    const session = await request<ApiAuthSession>("/api/auth/password/change", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (session) persistAccessToken(session.access_token, "account");
    return session;
  },

  async deleteAccount(input: { current_password: string; confirmation: "DELETE" }) {
    return request<ApiAccountDeletion>("/api/account/delete", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async requestPasswordReset(email: string) {
    return publicRequest<ApiPasswordResetRequestResponse>("/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async completePasswordReset(token: string, newPassword: string) {
    const session = await publicRequest<ApiAuthSession>("/api/auth/password-reset/complete", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    if (session) persistAccessToken(session.access_token, "account");
    return session;
  },

  async getAuthMe() {
    return request<ApiAuthMe>("/api/auth/me");
  },

  async previewGuestTransfer(session: ApiAuthSession, guestAccessToken: string, signal?: AbortSignal) {
    const response = await requestWithAccessToken<ApiGuestTransferPreview>(
      "/api/account/guest-transfer/preview",
      session.access_token,
      { guest_access_token: guestAccessToken },
      signal,
    );
    if (!response) throw new Error("guest-transfer-preview-empty");
    return response;
  },

  async transferGuestWorkspace(session: ApiAuthSession, guestAccessToken: string, signal?: AbortSignal) {
    const response = await requestWithAccessToken<ApiGuestTransfer>(
      "/api/account/guest-transfer",
      session.access_token,
      { guest_access_token: guestAccessToken, confirm: true },
      signal,
    );
    if (!response) throw new Error("guest-transfer-empty");
    return response;
  },

  clearSession() {
    clearAccessToken({ clearDashboardCache: true });
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
    clearAccessToken({ clearDashboardCache: true });
    return revoked;
  },

  async getDashboard(signal?: AbortSignal) {
    const payload = await request<ApiDashboard>("/api/dashboard", { signal });
    if (payload) cacheDashboard(payload);
    return payload;
  },

  async getDashboardRevision(signal?: AbortSignal) {
    return request<ApiDashboardRevision>("/api/dashboard/revision", { signal });
  },

  async getStorageLocations(signal?: AbortSignal) {
    return request<ApiStorageLocation[]>("/api/storage-locations", { signal });
  },

  async getStorageLocationRevision(signal?: AbortSignal) {
    return request<ApiStorageLocationRevision>("/api/storage-locations/revision", { signal });
  },

  async createStorageLocation(name: string, storageType: ApiStorageType) {
    return request<ApiStorageLocation>("/api/storage-locations", {
      method: "POST",
      body: JSON.stringify({ name, storage_type: storageType }),
    });
  },

  async updateStorageLocation(locationId: string, name: string) {
    return request<ApiStorageLocation>(`/api/storage-locations/${encodeURIComponent(locationId)}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  },

  async deleteStorageLocation(locationId: string) {
    return request<{ deleted: boolean }>(`/api/storage-locations/${encodeURIComponent(locationId)}`, {
      method: "DELETE",
    });
  },

  async searchInventory(query: string, storageType?: ApiStorageType, offset = 0, limit = 40, signal?: AbortSignal, storageLocationId?: string | null) {
    const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
    if (query.trim()) params.set("q", query.trim());
    if (storageType) params.set("storage_type", storageType);
    if (storageLocationId) params.set("storage_location_id", storageLocationId);
    return request<ApiInventorySearch>(`/api/inventory/search?${params.toString()}`, { signal });
  },

  async exportWorkspaceData(signal?: AbortSignal) {
    return request<ApiWorkspaceExport>("/api/account/export", { signal });
  },

  async getShoppingList(signal?: AbortSignal) {
    return request<ApiShoppingListItem[]>("/api/shopping-list", { signal });
  },

  async getShoppingListRevision(signal?: AbortSignal) {
    return request<ApiShoppingListRevision>("/api/shopping-list/revision", { signal });
  },

  async getMealPreferences(signal?: AbortSignal) {
    return request<ApiMealPreferences>("/api/meal-preferences", { signal });
  },

  async updateMealPreferences(preferences: ApiMealPreferences) {
    return request<ApiMealPreferences>("/api/meal-preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    });
  },

  async addShoppingList(sourceType: "meal_plan" | "multi_day", sourceId: string) {
    return request<ApiShoppingListMutation>("/api/shopping-list", {
      method: "POST",
      body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
    });
  },

  async addManualShoppingListItem(canonicalName: string, quantity: number, unit: string) {
    return request<ApiShoppingListMutation>("/api/shopping-list/manual", {
      method: "POST",
      body: JSON.stringify({ canonical_name: canonicalName, quantity, unit }),
    });
  },

  async receiveShoppingListItem(itemId: string, quantity: number, storageType: ApiStorageType, idempotencyKey: string, storageLocationId?: string | null) {
    return request<ApiShoppingListReceiveResponse>(`/api/shopping-list/${encodeURIComponent(itemId)}/receive`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ quantity, storage_type: storageType, storage_location_id: storageLocationId ?? null }),
    });
  },

  async updateShoppingListItem(itemId: string, checked: boolean) {
    return request<ApiShoppingListItem>(`/api/shopping-list/${encodeURIComponent(itemId)}`, {
      method: "PATCH",
      body: JSON.stringify({ checked }),
    });
  },

  async deleteShoppingListItem(itemId: string) {
    return request<{ removed: boolean }>(`/api/shopping-list/${encodeURIComponent(itemId)}`, {
      method: "DELETE",
    });
  },

  getCachedDashboard() {
    return readDashboardCache();
  },

  async getNotifications(unreadOnly = false, limit = 50, signal?: AbortSignal) {
    return request<ApiNotification[]>(`/api/notifications?unread_only=${unreadOnly ? "true" : "false"}&limit=${limit}`, { signal });
  },

  async getNotificationRevision(signal?: AbortSignal) {
    return request<ApiNotificationRevision>("/api/notifications/revision", { signal });
  },

  async markNotificationRead(notificationId: string) {
    return request<ApiNotification>(`/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async markAllNotificationsRead() {
    return request<ApiNotificationReadAll>("/api/notifications/read-all", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },

  async getNotificationPreferences(signal?: AbortSignal) {
    return request<ApiNotificationPreferences>("/api/notification-preferences", { signal });
  },

  async updateNotificationPreferences(preferences: ApiNotificationPreferences) {
    return request<ApiNotificationPreferences>("/api/notification-preferences", {
      method: "PUT",
      body: JSON.stringify(preferences),
    });
  },

  async getPushSubscriptions(signal?: AbortSignal) {
    return request<ApiPushSubscriptionSummary[]>("/api/push/subscriptions", { signal });
  },

  async getNotificationWorkerStatus(signal?: AbortSignal) {
    return request<ApiNotificationWorkerHeartbeat[]>("/api/integrations/notifications/worker/status", { signal });
  },

  async registerPushSubscription(input: { endpoint: string; p256dh: string; auth: string }) {
    return request<ApiPushSubscriptionSummary>("/api/push/subscriptions", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async removePushSubscription(endpointFingerprint: string) {
    return request<ApiPushSubscriptionDelete>(`/api/push/subscriptions/${encodeURIComponent(endpointFingerprint)}`, {
      method: "DELETE",
    });
  },

  async createReceiptDraft(input: { source_filename: string; purchased_at: string; lines: ApiReceiptLineInput[] }) {
    return request<ApiReceiptDraft>("/api/receipts/drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getReceiptDraft(receiptId: string) {
    return request<ApiReceiptDraft>(`/api/receipts/${encodeURIComponent(receiptId)}`);
  },

  async enqueueProductEnrichment(receiptId: string) {
    return request<ApiProductEnrichmentJob>(`/api/receipts/${encodeURIComponent(receiptId)}/product-enrichment`, {
      method: "POST",
    });
  },

  async getProductEnrichmentJob(receiptId: string) {
    return request<ApiProductEnrichmentJob>(`/api/receipts/${encodeURIComponent(receiptId)}/product-enrichment`);
  },

  async retryProductEnrichment(receiptId: string) {
    return request<ApiProductEnrichmentJob>(`/api/receipts/${encodeURIComponent(receiptId)}/product-enrichment/retry`, {
      method: "POST",
    });
  },

  async intakeReceipt(file: File, signal?: AbortSignal) {
    return upload<ApiOcrReceiptIntake>("/api/receipts/intake", file, true, signal);
  },

  async intakeLabel(file: File, signal?: AbortSignal) {
    return upload<ApiLabelIntake>("/api/labels/intake", file, true, signal);
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

  async resolveProductName(productName: string) {
    return request<ApiProductNameLookup>(`/api/products/resolve-name/${encodeURIComponent(productName)}`);
  },

  async inferPriority(input: { product_name: string; storage_type?: ApiStorageType; opened?: boolean; opened_at?: string; reference_date?: string }) {
    return request<ApiPriorityInference>("/api/inference/priority", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async getProductAliases(query?: string) {
    const suffix = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    return request<Array<{
      raw_name_key: string;
      raw_name: string;
      canonical_name: string;
      source: "user_confirmed" | "local_rule";
      confidence: number;
      use_count: number;
      created_at: string;
      updated_at: string;
    }>>(`/api/product-aliases${suffix}`);
  },

  async commitReceipt(receiptId: string, confirmedLineIds: string[], overrides: Record<string, { canonical_name: string; quantity?: number; unit?: string; storage_type?: ApiStorageType; storage_location_id?: string | null; match_source?: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched"; match_candidates?: Array<{ source: "user_confirmed_alias" | "local_rule" | "parser" | "local_fixture" | "mfds_c005" | "mfds_i1250" | "open_food_facts" | "unmatched"; canonical_name: string; confidence: number; provenance_note: string }>; barcode?: string | null }>, idempotencyKey = createReceiptCommitIdempotencyKey()) {
    return request<ApiReceiptCommitResponse>(`/api/receipts/${receiptId}/commit`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ confirmed_line_ids: confirmedLineIds, overrides }),
    });
  },

  async getReceiptSummaries(signal?: AbortSignal) {
    return request<ApiReceiptSummary[]>("/api/receipts", { signal });
  },

  async getReceiptRevision(signal?: AbortSignal) {
    return request<ApiReceiptRevision>("/api/receipts/revision", { signal });
  },

  async getReceiptPrivacyPolicy(signal?: AbortSignal) {
    return request<ApiReceiptPrivacyPolicy>("/api/privacy/receipt-policy", { signal });
  },

  async privacyEraseReceipt(receiptId: string) {
    return request<ApiReceiptPrivacyErase>(`/api/receipts/${encodeURIComponent(receiptId)}/privacy-erase`, {
      method: "POST",
      body: JSON.stringify({ confirm: true }),
    });
  },

  async getGrocyStatus(signal?: AbortSignal) {
    return request<ApiGrocyStatus>("/api/integrations/grocy/status", { signal });
  },

  async getGrocyWorkerStatus(signal?: AbortSignal) {
    return request<ApiGrocyWorkerHeartbeat[]>("/api/integrations/grocy/worker/status", { signal });
  },

  async getGrocyProductMappings(signal?: AbortSignal) {
    return request<ApiGrocyProductMapping[]>("/api/integrations/grocy/mappings", { signal });
  },

  async getGrocyProductMappingEvents(canonicalName: string, limit = 20) {
    return request<ApiGrocyProductMappingAuditEvent[]>(`/api/integrations/grocy/mappings/${encodeURIComponent(canonicalName)}/events?limit=${limit}`);
  },

  async upsertGrocyProductMapping(canonicalName: string, input: { grocy_product_id: number; grocy_unit: string }) {
    return request<ApiGrocyProductMapping>(`/api/integrations/grocy/mappings/${encodeURIComponent(canonicalName)}`, {
      method: "PUT",
      body: JSON.stringify({ ...input, source: "user_confirmed" }),
    });
  },

  async getGrocyLocationMappings(signal?: AbortSignal) {
    return request<ApiGrocyLocationMapping[]>("/api/integrations/grocy/location-mappings", { signal });
  },

  async upsertGrocyLocationMapping(storageType: ApiStorageType, grocyLocationId: number) {
    return request<ApiGrocyLocationMapping>(`/api/integrations/grocy/location-mappings/${storageType}`, {
      method: "PUT",
      body: JSON.stringify({ grocy_location_id: grocyLocationId, source: "user_confirmed" }),
    });
  },

  async getGrocyOutbox(outboxStatus?: ApiGrocyOutboxStatus, signal?: AbortSignal) {
    const query = outboxStatus ? `?status=${outboxStatus}` : "";
    return request<ApiGrocyOutboxRecord[]>(`/api/integrations/grocy/outbox${query}`, { signal });
  },

  async processGrocyOutbox(limit = 20) {
    return request<ApiGrocyOutboxProcess>("/api/integrations/grocy/outbox/process", {
      method: "POST",
      body: JSON.stringify({ limit }),
    });
  },

  async retryGrocyOutbox(outboxId: string, operatorNote?: string) {
    return request<ApiGrocyOutboxRecord>(`/api/integrations/grocy/outbox/${encodeURIComponent(outboxId)}/retry`, {
      method: "POST",
      body: JSON.stringify({ operator_note: operatorNote?.trim() || null }),
    });
  },

  async scanGrocyOutboxReconciliation(staleAfterSeconds = 900, limit = 100) {
    return request<ApiGrocyReconcileScan>("/api/integrations/grocy/outbox/reconciliation-scan", {
      method: "POST",
      body: JSON.stringify({ stale_after_seconds: staleAfterSeconds, limit }),
    });
  },

  async reconcileGrocyOutbox(outboxId: string, input: { decision: "already_applied" | "not_applied"; grocy_transaction_id?: string; operator_note?: string }) {
    return request<ApiGrocyOutboxRecord>(`/api/integrations/grocy/outbox/${encodeURIComponent(outboxId)}/reconcile`, {
      method: "POST",
      body: JSON.stringify({ ...input, grocy_transaction_id: input.grocy_transaction_id?.trim() || null, operator_note: input.operator_note?.trim() || null }),
    });
  },

  async createStorageEvent(foodId: string, input: { event_type: "moved" | "opened" | "frozen" | "thawed" | "consumed" | "discarded"; to_storage_type?: ApiStorageType; to_storage_location_id?: string | null; quantity?: number }, idempotencyKey?: string) {
    return request<ApiStorageEvent>(`/api/foods/${foodId}/storage-events`, {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(input),
    });
  },

  async createStorageEventSequence(foodId: string, events: Array<{ event_type: "moved" | "opened" | "frozen" | "thawed" | "consumed" | "discarded"; to_storage_type?: ApiStorageType; to_storage_location_id?: string | null; quantity?: number }>, idempotencyKey: string) {
    return request<ApiStorageEventSequence>(`/api/foods/${encodeURIComponent(foodId)}/storage-event-sequence`, {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ events }),
    });
  },

  async getStorageEvents(foodId: string) {
    return request<ApiStorageEvent[]>(`/api/foods/${encodeURIComponent(foodId)}/storage-events`);
  },

  async getProductProvenanceEvents(foodId: string, limit = 50) {
    return request<ApiProductProvenanceAuditEvent[]>(`/api/foods/${encodeURIComponent(foodId)}/product-provenance/events?limit=${Math.min(100, Math.max(1, limit))}`);
  },

  async clearProductProvenance(foodId: string) {
    return request<ApiFood>(`/api/foods/${encodeURIComponent(foodId)}/product-provenance`, {
      method: "DELETE",
    });
  },

  async getProductInfoEvents(foodId: string, limit = 50) {
    return request<ApiFoodProductInfoAuditEvent[]>(`/api/foods/${encodeURIComponent(foodId)}/product-info/events?limit=${Math.min(100, Math.max(1, limit))}`);
  },

  async updateProductInfo(foodId: string, input: { canonical_name: string; brand: string; category: string }) {
    return request<ApiFood>(`/api/foods/${encodeURIComponent(foodId)}/product-info`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async updateDateAssertion(foodId: string, input: { kind: "sell_by" | "use_by" | "best_before" | "user_reminder"; date_value: string; source_detail?: string; applicable_storage_type?: ApiStorageType; storage_condition_text?: string }) {
    return request<ApiFood>(`/api/foods/${encodeURIComponent(foodId)}/date-assertion`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
  },

  async createManualFood(input: {
    canonical_name: string;
    lot_action?: "create" | "correct";
    target_food_id?: string;
    quantity: number;
    unit: string;
    storage_type: ApiStorageType;
    storage_location_id?: string | null;
    category: string;
    note: string;
    brand?: string;
    image_path?: string;
    barcode?: string;
    barcode_lot?: string;
    product_provenance?: ApiProductProvenance;
    date_kind?: ApiDateKind;
    date_value?: string;
    date_source?: string;
    date_source_detail?: string;
    applicable_storage_type?: ApiStorageType;
    storage_condition_text?: string;
    user_confirmed?: boolean;
    idempotencyKey?: string;
  }) {
    const { idempotencyKey, ...payload } = input;
    return request<ApiFood>("/api/foods", {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: JSON.stringify(payload),
    });
  },

  async previewMealPlan<T = ApiMealPlan>(inventoryIds: string[], maxMinutes = 30, path = "/api/meal-plans/preview", servings = 1, signal?: AbortSignal) {
    return request<T>(path, {
      method: "POST",
      signal,
      body: JSON.stringify({ inventory_ids: inventoryIds, max_minutes: maxMinutes, servings }),
    });
  },

  async saveMealPlan(inventoryIds: string[], planId?: string, snapshotHash?: string, maxMinutes = 30, recipeId?: string, bundleId?: string, bundleDayIndex?: number, servings = 1) {
    return request<ApiMealPlan>("/api/meal-plans", {
      method: "POST",
      body: JSON.stringify({ inventory_ids: inventoryIds, max_minutes: maxMinutes, servings, ...(planId ? { plan_id: planId } : {}), ...(recipeId ? { recipe_id: recipeId } : {}), ...(bundleId ? { bundle_id: bundleId } : {}), ...(bundleDayIndex != null ? { bundle_day_index: bundleDayIndex } : {}), ...(snapshotHash ? { snapshot_hash: snapshotHash } : {}) }),
    });
  },

  async saveMultiDayMealPlan(inventoryIds: string[], bundleId?: string, snapshotHash?: string, maxMinutes = 30, servings = 1) {
    return request<ApiMultiDayMealPlan>("/api/meal-plans/multi-day", {
      method: "POST",
      body: JSON.stringify({ inventory_ids: inventoryIds, max_minutes: maxMinutes, servings, ...(bundleId ? { bundle_id: bundleId } : {}), ...(snapshotHash ? { snapshot_hash: snapshotHash } : {}) }),
    });
  },

  async getLatestMultiDayMealPlan(signal?: AbortSignal) {
    return request<ApiMultiDayMealPlan | null>("/api/meal-plans/multi-day/latest", { signal });
  },

  async getMealPlanRevision(signal?: AbortSignal) {
    return request<ApiMealPlanRevision>("/api/meal-plans/revision", { signal });
  },

  async getMultiDayMealPlanHistory(limit = 10, signal?: AbortSignal) {
    return request<ApiMultiDayMealPlan[]>(`/api/meal-plans/multi-day/history?limit=${limit}`, { signal });
  },

  async getLatestMealPlan(signal?: AbortSignal) {
    return request<ApiMealPlan | null>("/api/meal-plans/latest", { signal });
  },

  async getMealPlanHistory(limit = 10, signal?: AbortSignal) {
    return request<ApiMealPlan[]>(`/api/meal-plans/history?limit=${limit}`, { signal });
  },

  async getMealPlanEvents(planId: string, signal?: AbortSignal) {
    return request<ApiMealPlanAuditEvent[]>(`/api/meal-plans/${encodeURIComponent(planId)}/events`, { signal });
  },

  async completeMealPlan(planId: string, consumptions?: Array<{ food_id: string; quantity: number }>) {
    return request<ApiMealPlanCompletion>(`/api/meal-plans/${encodeURIComponent(planId)}/complete`, {
      method: "POST",
      body: JSON.stringify(consumptions ? { consumptions } : {}),
    });
  },

  async getRecipeReviewDrafts(reviewToken = "", status?: "pending" | "approved" | "rejected", assignment: ApiRecipeReviewAssignment = "all") {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (assignment !== "all") params.set("assignment", assignment);
    const query = params.toString() ? `?${params.toString()}` : "";
    return request<ApiRecipeDraft[]>(`/api/recipe-review/drafts${query}`, {
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async getRecipeSourceStatus() {
    return request<ApiRecipeSourceStatus>("/api/integrations/recipes/cookrcp/status");
  },

  async getRecipeReviewCapabilities(reviewToken = "") {
    return request<ApiRecipeReviewCapabilities>("/api/recipe-review/capabilities", {
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async getRecipeReviewRevision(reviewToken = "") {
    return request<ApiRecipeReviewRevision>("/api/recipe-review/revision", {
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async importRecipeReviewDrafts(reviewToken: string | undefined, input: {
    start_idx: number;
    end_idx: number;
    menu_name?: string;
    ingredient_text?: string;
    changed_after?: string;
    category?: string;
  }) {
    return request<ApiRecipeDraftImportResponse>("/api/recipe-review/drafts/import", {
      method: "POST",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
      body: JSON.stringify(input),
    });
  },

  async getRecipeReviewEvents(reviewToken = "", draftId: string) {
    return request<ApiRecipeReviewAuditEvent[]>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}/events`, {
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async claimRecipeReviewDraft(reviewToken: string | undefined, draftId: string) {
    return request<ApiRecipeDraft>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}/claim`, {
      method: "POST",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async releaseRecipeReviewDraft(reviewToken: string | undefined, draftId: string) {
    return request<ApiRecipeDraft>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}/release`, {
      method: "POST",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
    });
  },

  async updateRecipeReviewDraft(reviewToken: string | undefined, draftId: string, input: {
    title?: string;
    safety_note?: string;
    estimated_minutes?: number;
    reviewer_note?: string;
    ingredients?: Array<{
      index: number;
      canonical_name?: string;
      canonical_amount?: number;
      canonical_unit?: string;
      review_status?: "pending" | "approved" | "rejected";
    }>;
  }) {
    return request<ApiRecipeDraft>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}`, {
      method: "PATCH",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
      body: JSON.stringify(input),
    });
  },

  async approveRecipeReviewDraft(reviewToken: string | undefined, draftId: string, licenseConfirmed: boolean) {
    return request<ApiRecipeDraft>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}/approve`, {
      method: "POST",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
      body: JSON.stringify({ license_confirmed: licenseConfirmed }),
    });
  },

  async rejectRecipeReviewDraft(reviewToken: string | undefined, draftId: string, reviewerNote: string) {
    return request<ApiRecipeDraft>(`/api/recipe-review/drafts/${encodeURIComponent(draftId)}/reject`, {
      method: "POST",
      headers: reviewToken ? { "X-Rescue-Meal-Recipe-Review-Token": reviewToken } : undefined,
      body: JSON.stringify({ reviewer_note: reviewerNote }),
    });
  },
};

function parseWorkspaceRevision(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d{1,19}$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function rememberWorkspaceRevision(response: Response) {
  const nextRevision = parseWorkspaceRevision(response.headers.get(WORKSPACE_REVISION_RESPONSE_HEADER));
  if (nextRevision === null) return;
  // A slower read must never move the client back to an older revision.
  workspaceRevision = workspaceRevision === null ? nextRevision : Math.max(workspaceRevision, nextRevision);
}

function rememberRecipeCatalogRevision(response: Response) {
  const nextRevision = parseWorkspaceRevision(response.headers.get(RECIPE_CATALOG_REVISION_RESPONSE_HEADER));
  if (nextRevision === null) return;
  recipeCatalogRevision = recipeCatalogRevision === null ? nextRevision : Math.max(recipeCatalogRevision, nextRevision);
}

function safeErrorMessage(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 300) : fallback;
}

async function throwMealApiError(response: Response): Promise<never> {
  let body: unknown = null;
  try {
    body = await response.clone().json();
  } catch {
    // A proxy or gateway may return a non-JSON error body; keep the typed
    // status error without exposing that body to the UI.
  }
  const payload = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const nestedDetail = payload.detail && typeof payload.detail === "object" ? payload.detail as Record<string, unknown> : {};
  const currentRevision = parseWorkspaceRevision(payload.current_revision)
    ?? parseWorkspaceRevision(nestedDetail.current_revision)
    ?? parseWorkspaceRevision(response.headers.get(WORKSPACE_REVISION_RESPONSE_HEADER));
  const code = typeof payload.code === "string" ? payload.code : typeof nestedDetail.code === "string" ? nestedDetail.code : null;
  const currentCatalogRevision = parseWorkspaceRevision(payload.current_catalog_revision)
    ?? parseWorkspaceRevision(nestedDetail.current_catalog_revision)
    ?? (code === "recipe_catalog_revision_conflict" ? parseWorkspaceRevision(payload.current_revision) : null)
    ?? parseWorkspaceRevision(response.headers.get(RECIPE_CATALOG_REVISION_RESPONSE_HEADER));
  const expectedRevision = parseWorkspaceRevision(payload.expected_revision)
    ?? parseWorkspaceRevision(nestedDetail.expected_revision);
  const retryable = payload.retryable === true || nestedDetail.retryable === true;
  const message = safeErrorMessage(nestedDetail.detail ?? payload.detail, `Rescue Meal API ${response.status}`);
  throw new MealApiError(response.status, message, {
    code,
    retryable,
    expectedRevision,
    currentRevision,
    currentCatalogRevision,
  });
}

async function request<T>(path: string, init: RequestInit = {}, canRefresh = true, networkRetries = 0) {
  if (!baseUrl) return null;
  const token = await ensureGuestToken();
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toString().toUpperCase();
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (shouldSendWorkspaceRevision(path, method) && workspaceRevision !== null && !headers.has(WORKSPACE_REVISION_REQUEST_HEADER)) {
    headers.set(WORKSPACE_REVISION_REQUEST_HEADER, String(workspaceRevision));
  }
  if (shouldSendRecipeCatalogRevision(path, method) && recipeCatalogRevision !== null && !headers.has(RECIPE_CATALOG_REVISION_REQUEST_HEADER)) {
    headers.set(RECIPE_CATALOG_REVISION_REQUEST_HEADER, String(recipeCatalogRevision));
  }
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}${path}`, {
      ...init,
      headers,
    }, init.signal);
  } catch (error) {
    if (networkRetries < 1 && headers.has("Idempotency-Key") && !init.signal?.aborted) {
      return request<T>(path, init, canRefresh, networkRetries + 1);
    }
    throw error;
  }
  rememberWorkspaceRevision(response);
  rememberRecipeCatalogRevision(response);
  if (response.status === 401 && token && canRefresh && accessTokenMode === "guest") {
    clearAccessToken();
    return request<T>(path, init, false, networkRetries);
  }
  if (!response.ok) {
    return throwMealApiError(response);
  }
  if (shouldBroadcastWorkspaceMutation(path, method)) {
    broadcastWorkspaceMutation(mutationWorkspaceKey(path), workspaceMutationChannels(path));
  }
  return response.json() as Promise<T>;
}

async function requestWithAccessToken<T>(path: string, accessToken: string, body: Record<string, unknown>, signal?: AbortSignal) {
  if (!baseUrl) return null;
  const method = "POST";
  const headers = new Headers({
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  });
  if (shouldSendWorkspaceRevision(path, method) && workspaceRevision !== null) {
    headers.set(WORKSPACE_REVISION_REQUEST_HEADER, String(workspaceRevision));
  }
  if (shouldSendRecipeCatalogRevision(path, method) && recipeCatalogRevision !== null) {
    headers.set(RECIPE_CATALOG_REVISION_REQUEST_HEADER, String(recipeCatalogRevision));
  }
  const response = await fetchWithTimeout(`${baseUrl}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  }, signal);
  rememberWorkspaceRevision(response);
  rememberRecipeCatalogRevision(response);
  if (!response.ok) return throwMealApiError(response);
  if (shouldBroadcastWorkspaceMutation(path, method)) {
    broadcastWorkspaceMutation(mutationWorkspaceKey(path), workspaceMutationChannels(path));
  }
  return response.json() as Promise<T>;
}

async function publicRequest<T>(path: string, init: RequestInit = {}) {
  if (!baseUrl) return null;
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetchWithTimeout(`${baseUrl}${path}`, { ...init, headers });
  if (!response.ok) return throwMealApiError(response);
  return response.json() as Promise<T>;
}

async function upload<T>(path: string, file: File, canRefresh = true, signal?: AbortSignal) {
  if (!baseUrl) return null;
  const token = await ensureGuestToken();
  const formData = new FormData();
  formData.append("file", file);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (shouldSendWorkspaceRevision(path, "POST") && workspaceRevision !== null) {
    headers.set(WORKSPACE_REVISION_REQUEST_HEADER, String(workspaceRevision));
  }
  const response = await fetchWithTimeout(`${baseUrl}${path}`, { method: "POST", body: formData, headers }, signal);
  rememberWorkspaceRevision(response);
  if (response.status === 401 && token && canRefresh && accessTokenMode === "guest") {
    clearAccessToken();
    return upload<T>(path, file, false, signal);
  }
  if (!response.ok) {
    return throwMealApiError(response);
  }
  if (shouldBroadcastWorkspaceMutation(path, "POST")) {
    broadcastWorkspaceMutation(mutationWorkspaceKey(path), workspaceMutationChannels(path));
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
    return throwMealApiError(response);
  }
  const payload = await response.json() as ApiAuthSession;
  persistAccessToken(payload.access_token, payload.mode);
  return payload;
}

function clearAccessToken(options: { clearDashboardCache?: boolean } = {}) {
  if (options.clearDashboardCache && typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(dashboardCacheKey());
    } catch {
      // Storage policy can reject removal in private browsing contexts.
    }
  }
  guestToken = null;
  accessTokenMode = null;
  workspaceRevision = null;
  recipeCatalogRevision = null;
  try {
    window.localStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(AUTH_MODE_STORAGE_KEY);
  } catch {
    // Storage policy can reject removal in private browsing contexts.
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, externalSignal?: AbortSignal | null, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) abortFromCaller();
    else externalSignal.addEventListener("abort", abortFromCaller, { once: true });
  }
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromCaller);
  }
}
