const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Traffic light for one component: equal -> GREEN, surplus -> YELLOW, shortage -> RED. */
export function evaluate(expected, actual) {
  if (!isCount(expected)) throw new RangeError("expected must be a non-negative integer");
  if (!isCount(actual)) throw new RangeError("actual must be a non-negative integer");
  if (actual === expected) return "GREEN";
  return actual > expected ? "YELLOW" : "RED";
}

/**
 * Hard-stop gate. True only if every item is counted and none is RED.
 * Status is always recomputed from the quantities; a stored or client-sent status is ignored.
 * When requiredComponentIds is given, every one of those components must have an item.
 */
export function canApprove(items, requiredComponentIds) {
  if (!Array.isArray(items) || items.length === 0) return false;

  for (const item of items) {
    if (item.actualQty === null || item.actualQty === undefined) return false; // uncounted
    if (!isCount(item.expectedQty) || !isCount(item.actualQty)) return false;
    if (evaluate(item.expectedQty, item.actualQty) === "RED") return false;
  }

  if (requiredComponentIds) {
    const present = new Set(items.map((i) => i.componentId));
    if (!requiredComponentIds.every((id) => present.has(id))) return false; // missing component
  }

  return true;
}
