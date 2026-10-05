"use client";

import { useState } from "react";
import BatchPanel from "./BatchPanel";

export default function VerificationView({ orders }) {
  const [result, setResult] = useState("");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Verification Terminal</h1>
        <p className="text-sm text-gray-700">
          {orders.length === 0
            ? "No batches are waiting."
            : `${orders.length} ${orders.length === 1 ? "batch" : "batches"} waiting for verification. Count every component; a batch with any shortage can only be rejected.`}
        </p>
      </div>

      {result && (
        <div
          role="status"
          className="flex items-start justify-between gap-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-900"
        >
          <span>{result}</span>
          <button
            type="button"
            onClick={() => setResult("")}
            className="rounded border border-green-700 px-2 py-0.5 text-xs font-semibold text-green-900 hover:bg-green-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-400 bg-white p-8 text-center">
          <p className="font-medium text-gray-900">No batches waiting for verification</p>
          <p className="mt-1 text-sm text-gray-700">New cutting orders from the supervisor will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {orders.map((order) => (
            <BatchPanel key={order.id} order={order} onResult={setResult} />
          ))}
        </ul>
      )}
    </div>
  );
}
