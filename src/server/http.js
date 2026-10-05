export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Wraps a route handler so thrown HttpErrors become clean JSON responses. */
export function route(handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      if (err instanceof HttpError) {
        const body = { error: err.message };
        if (err.details) body.details = err.details;
        return Response.json(body, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/** Route param -> positive integer id, or null (digits only; no signs, decimals or padding tricks). */
export function idOrNull(raw) {
  if (typeof raw !== "string" || !/^[1-9]\d{0,9}$/.test(raw)) return null;
  const id = Number(raw);
  return id > 2147483647 ? null : id;
}

/** Same as idOrNull but throws a 404, for API routes. */
export function parseId(raw) {
  const id = idOrNull(raw);
  if (id === null) throw new HttpError(404, "Order not found");
  return id;
}
