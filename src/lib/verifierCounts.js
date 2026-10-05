import { approvalBlockers, evaluate } from "@/server/domain/traffic";
import { MAX_COUNT } from "./limits";

/**
 * Parses one count input. Blank is "not counted yet" (not an error, not 0).
 * Only whole numbers 0..MAX_COUNT are valid. UX only: the server re-validates everything.
 */
export function validateCount(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return { blank: true, value: null, error: null };
  if (text.startsWith("-")) return { blank: false, value: null, error: "Cannot be negative" };
  if (text.includes(".")) return { blank: false, value: null, error: "Whole numbers only (no decimals)" };
  if (!/^\d+$/.test(text)) return { blank: false, value: null, error: "Digits only" };
  if (text.length > 9 || Number(text) > MAX_COUNT) {
    return { blank: false, value: null, error: `Must be ${MAX_COUNT.toLocaleString("en-US")} or fewer` };
  }
  return { blank: false, value: Number(text), error: null };
}

/**
 * Live traffic-light summary for one batch.
 * items:  [{ componentId, componentName, expectedQty }]
 * inputs: { [componentId]: string } (what the verifier has typed)
 * Uses the same evaluate/approvalBlockers as the server so the button can never disagree with it.
 */
export function summarizeCounts(items, inputs) {
  const rows = items.map((item) => {
    const parsed = validateCount(inputs[item.componentId]);
    const counted = parsed.value !== null;
    return {
      componentId: item.componentId,
      value: parsed.value,
      error: parsed.error,
      status: counted ? evaluate(item.expectedQty, parsed.value) : null,
      variance: counted ? parsed.value - item.expectedQty : null,
    };
  });

  const blockers = approvalBlockers(
    items.map((item, i) => ({
      componentId: item.componentId,
      expectedQty: item.expectedQty,
      actualQty: rows[i].value,
    })),
    items.map((item) => item.componentId),
  );

  const errorCount = rows.filter((r) => r.error).length;
  const shortages = blockers.filter((b) => b.reason === "SHORTAGE").length;
  const uncounted = blockers.filter((b) => b.reason !== "SHORTAGE").length;

  return {
    rows,
    blockers,
    errorCount,
    shortages,
    uncounted,
    countedCount: rows.filter((r) => r.value !== null).length,
    // Same rule as the server's canApprove: an empty batch can never be approved.
    canApprove: items.length > 0 && errorCount === 0 && blockers.length === 0,
  };
}

/** Why Approve is disabled, in words ("1 shortage, 2 not counted"); empty when it is allowed. */
export function approveBlockedReason(summary) {
  const parts = [];
  if (summary.shortages) parts.push(`${summary.shortages} ${summary.shortages === 1 ? "shortage" : "shortages"}`);
  if (summary.errorCount) parts.push(`${summary.errorCount} invalid ${summary.errorCount === 1 ? "entry" : "entries"}`);
  const blank = summary.uncounted - summary.errorCount;
  if (blank > 0) parts.push(`${blank} not counted`);
  return parts.join(", ");
}

/** Counts that are valid and differ from what the server already has saved. */
export function changedCounts(items, saved, inputs) {
  const changes = [];
  for (const item of items) {
    const parsed = validateCount(inputs[item.componentId]);
    if (parsed.value === null) continue;
    if (saved[item.componentId] !== parsed.value) {
      changes.push({ componentId: item.componentId, actualQty: parsed.value });
    }
  }
  return changes;
}

const REASON_TEXT = {
  SHORTAGE: "shortage",
  UNCOUNTED: "not counted",
  MISSING: "missing from this order",
  INVALID: "invalid count",
};

/** Turns an API error response into { title, lines } for display. Never hides the server's reason. */
export function describeServerError(status, data) {
  const message = data?.error;
  const details = data?.details;

  if (status === 401) return { title: "Your session has expired. Please sign in again.", lines: [] };
  if (status === 403) return { title: "Forbidden: your role cannot perform this action.", lines: [] };

  if (status === 422 && Array.isArray(details?.blockers)) {
    return {
      title: message ?? "Approval blocked",
      lines: details.blockers.map((b) => {
        const name = b.componentName ?? `Component ${b.componentId}`;
        const reason = REASON_TEXT[b.reason] ?? b.reason;
        const counts =
          b.expectedQty !== null && b.expectedQty !== undefined
            ? ` (expected ${b.expectedQty}, counted ${b.actualQty ?? "none"})`
            : "";
        return `${name}: ${reason}${counts}`;
      }),
    };
  }

  if (status === 422 && details && typeof details === "object") {
    return {
      title: message ?? "Invalid request",
      lines: Object.entries(details).flatMap(([field, msgs]) =>
        (Array.isArray(msgs) ? msgs : [msgs]).map((m) => (field === "_" ? m : `${field}: ${m}`)),
      ),
    };
  }

  if (status === 409) return { title: message ?? "This batch was already processed.", lines: [] };
  return { title: message ?? "Something went wrong. Please try again.", lines: [] };
}
