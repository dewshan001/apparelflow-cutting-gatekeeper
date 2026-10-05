const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Traffic light for one component: equal -> GREEN, surplus -> YELLOW, shortage -> RED. */
export function evaluate(expected, actual) {
  if (!isCount(expected)) throw new RangeError("expected must be a non-negative integer");
  if (!isCount(actual)) throw new RangeError("actual must be a non-negative integer");
  if (actual === expected) return "GREEN";
  return actual > expected ? "YELLOW" : "RED";
}

/**
 * Everything that currently blocks approval, as [{ componentId, reason }]:
 *   UNCOUNTED  no count recorded yet
 *   INVALID    count is not a non-negative whole number
 *   SHORTAGE   RED: actual below expected
 *   MISSING    a required component has no item at all (also reported for an empty item list)
 * Status is always recomputed from the quantities; a stored or client-sent status is ignored.
 */
export function approvalBlockers(items, requiredComponentIds) {
  if (!Array.isArray(items) || items.length === 0) {
    return (requiredComponentIds ?? []).map((componentId) => ({ componentId, reason: "MISSING" }));
  }

  const blockers = [];
  for (const item of items) {
    if (item.actualQty === null || item.actualQty === undefined) {
      blockers.push({ componentId: item.componentId, reason: "UNCOUNTED" });
    } else if (!isCount(item.expectedQty) || !isCount(item.actualQty)) {
      blockers.push({ componentId: item.componentId, reason: "INVALID" });
    } else if (evaluate(item.expectedQty, item.actualQty) === "RED") {
      blockers.push({ componentId: item.componentId, reason: "SHORTAGE" });
    }
  }

  if (requiredComponentIds) {
    const present = new Set(items.map((i) => i.componentId));
    for (const id of requiredComponentIds) {
      if (!present.has(id)) blockers.push({ componentId: id, reason: "MISSING" });
    }
  }
  return blockers;
}

/**
 * Hard-stop gate. True only if every item is counted and none is RED
 * (and, when requiredComponentIds is given, none of those components is missing).
 * An empty item list can never be approved.
 */
export function canApprove(items, requiredComponentIds) {
  if (!Array.isArray(items) || items.length === 0) return false;
  return approvalBlockers(items, requiredComponentIds).length === 0;
}
