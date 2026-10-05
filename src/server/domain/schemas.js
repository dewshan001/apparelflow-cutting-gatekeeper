import { z } from "zod";

// No z.coerce anywhere: Number("") is 0 and Number("5.5abc") style coercions hide bad input.

/** Piece quantities: strictly positive whole numbers. Rejects negatives, 0, decimals, strings, null. */
export const positiveInt = z
  .number({ error: "Must be a whole number" })
  .int({ error: "Must be a whole number" })
  .positive({ error: "Must be greater than 0" });

/** Counted pieces: whole numbers from 0 up (a count of 0 is valid and is a shortage). */
export const nonNegativeInt = z
  .number({ error: "Must be a whole number" })
  .int({ error: "Must be a whole number" })
  .min(0, { error: "Cannot be negative" });

/** Fabric yards: positive, at most 2 decimal places (yards are naturally fractional). */
export const positiveYards = z
  .number({ error: "Must be a number" })
  .finite({ error: "Must be a number" })
  .positive({ error: "Must be greater than 0" })
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, {
    error: "Use at most 2 decimal places",
  });

/**
 * Field-level messages for 422 responses, keyed by field path ("targetQty", "counts.0.actualQty").
 * Errors on the body itself (e.g. not an object) are keyed "_".
 */
export function fieldErrors(error) {
  const out = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
