const STATUS_STYLES = {
  PENDING_VERIFICATION: { label: "Pending verification", className: "bg-amber-100 text-amber-900 border-amber-400" },
  REJECTED: { label: "Rejected", className: "bg-red-100 text-red-900 border-red-400" },
  VERIFIED: { label: "Verified", className: "bg-green-100 text-green-900 border-green-500" },
  SEWING_STARTED: { label: "Sewing started", className: "bg-blue-100 text-blue-900 border-blue-400" },
};

export default function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] ?? { label: status, className: "bg-gray-100 text-gray-900 border-gray-400" };
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.className}`}>
      {s.label}
    </span>
  );
}
