/** The only legal order status changes. Anything not listed here is rejected. */
export const ALLOWED_TRANSITIONS = Object.freeze({
  PENDING_VERIFICATION: Object.freeze(["VERIFIED", "REJECTED"]),
  REJECTED: Object.freeze(["PENDING_VERIFICATION"]),
  VERIFIED: Object.freeze(["SEWING_STARTED"]),
  SEWING_STARTED: Object.freeze([]),
});

export function canTransition(from, to) {
  return Object.hasOwn(ALLOWED_TRANSITIONS, from) && ALLOWED_TRANSITIONS[from].includes(to);
}
