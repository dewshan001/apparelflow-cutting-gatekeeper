"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import StatusBadge from "@/components/StatusBadge";

// Fixed UTC format so server and client render identical text (no hydration mismatch).
function formatUtc(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function OrderCard({ order }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function resubmit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/orders/${order.id}/resubmit`, { method: "POST" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Could not resubmit the order.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-lg border border-gray-300 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-gray-900">{order.orderNo}</h3>
          <StatusBadge status={order.status} />
        </div>
        <span className="text-sm text-gray-700">{formatUtc(order.createdAt)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-900 sm:grid-cols-4">
        <div>
          <dt className="text-gray-700">Recipe</dt>
          <dd className="font-medium">
            {order.recipe.name} <span className="font-mono text-xs">({order.recipe.recipeCode})</span>
          </dd>
        </div>
        <div>
          <dt className="text-gray-700">Batch quantity</dt>
          <dd className="font-medium">{order.targetQty} garments</dd>
        </div>
        <div>
          <dt className="text-gray-700">Fabric roll</dt>
          <dd className="font-medium">{order.fabricRollId}</dd>
        </div>
        <div>
          <dt className="text-gray-700">Fabric used / expected</dt>
          <dd className="font-medium">
            {order.actualFabricYds.toFixed(2)} / {order.expectedFabricYds.toFixed(2)} yds
          </dd>
        </div>
      </dl>

      {order.status === "REJECTED" && (
        <div role="group" aria-label="Rejection details" className="mt-3 rounded-md border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-semibold text-red-900">Rejected by verifier - re-cut required</p>
          <p className="mt-1 text-sm text-red-900">
            Reason: {order.rejectionNote ?? "No reason recorded"}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-800">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={resubmit}
            disabled={busy}
            className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
          >
            {busy ? "Resubmitting..." : "Resubmit for verification"}
          </button>
        </div>
      )}
    </li>
  );
}
