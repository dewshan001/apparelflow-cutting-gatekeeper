/** Fixed UTC "YYYY-MM-DD HH:MM UTC" so server and client always render the same text. */
export function formatUtc(value) {
  const iso = new Date(value).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export function formatPct(value) {
  return value === null || value === undefined ? "n/a" : `${value.toFixed(2)}%`;
}

export function formatVariance(variance) {
  if (variance === null || variance === undefined) return "-";
  return variance > 0 ? `+${variance}` : String(variance);
}
