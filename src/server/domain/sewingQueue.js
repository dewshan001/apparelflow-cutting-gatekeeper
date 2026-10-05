/**
 * The only order statuses the sewing floor may ever see. Every sewing query filters on this
 * constant in SQL; nothing from a request (query string, body, params) can change it.
 */
export const QUEUE_STATUSES = Object.freeze(["VERIFIED", "SEWING_STARTED"]);
