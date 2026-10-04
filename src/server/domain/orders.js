const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
}

/**
 * Expected cut pieces per recipe component for a batch.
 * e.g. 50 garments x 2 cuffs per garment = 100 expected cuffs.
 */
export function expectedComponents(recipeComponents, targetQty) {
  assertPositiveInt(targetQty, "targetQty");
  return recipeComponents.map((c) => {
    assertPositiveInt(c.piecesPerGarment, "piecesPerGarment");
    return {
      componentId: c.id,
      componentName: c.componentName,
      expectedQty: c.piecesPerGarment * targetQty,
    };
  });
}

/** Expected fabric in yards. numeric DB columns arrive as strings, so convert explicitly. */
export function expectedFabric(targetQty, stdYards) {
  assertPositiveInt(targetQty, "targetQty");
  const yards = Number(stdYards);
  if (!Number.isFinite(yards) || yards <= 0) {
    throw new RangeError("stdYards must be a positive number");
  }
  return round2(targetQty * yards);
}

/** Fabric wastage % = ((actual - expected) / expected) x 100. Negative means fabric saved. */
export function wastagePct(actual, expected) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || a < 0) throw new RangeError("actual must be a non-negative number");
  if (!Number.isFinite(e) || e <= 0) throw new RangeError("expected must be a positive number");
  return round2(((a - e) / e) * 100);
}
