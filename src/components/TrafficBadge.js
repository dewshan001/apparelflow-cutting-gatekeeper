const STYLES = {
  GREEN: { symbol: "✓", className: "bg-green-100 text-green-900 border-green-600" },
  YELLOW: { symbol: "▲", className: "bg-yellow-100 text-yellow-900 border-yellow-600" },
  RED: { symbol: "✖", className: "bg-red-100 text-red-900 border-red-600" },
  NONE: { symbol: "–", className: "bg-gray-100 text-gray-900 border-gray-500" },
};

function labelFor(status, variance) {
  if (status === "GREEN") return "Match";
  if (status === "YELLOW") return `Excess +${variance}`;
  if (status === "RED") return `Shortage ${variance}`;
  return "Not counted";
}

/** Traffic-light badge. Always carries a text label and symbol, never colour alone. */
export default function TrafficBadge({ status, variance }) {
  const style = STYLES[status] ?? STYLES.NONE;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${style.className}`}
    >
      <span aria-hidden="true">{style.symbol}</span>
      {labelFor(status, variance)}
    </span>
  );
}
