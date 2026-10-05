"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { describeServerError } from "@/lib/verifierCounts";

export default function StartSewingButton({ orderId, orderNo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sewing/${orderId}/start`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        router.refresh();
        return;
      }
      if (res.status === 401) router.replace("/login");
      // Someone else already started it (409) or it left the queue (404): show the truth.
      if (res.status === 409 || res.status === 404) router.refresh();
      setError(describeServerError(res.status, data));
    } catch {
      setError({ title: "Network error. Please check your connection and try again.", lines: [] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-md bg-orange-700 px-5 py-2.5 font-semibold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Starting..." : "Start Sewing Assembly"}
      </button>
      <p className="mt-2 text-sm text-gray-800">
        Releases {orderNo} to the assembly line. This cannot be undone.
      </p>
      {error && (
        <div role="alert" className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          <p className="font-semibold">{error.title}</p>
          {error.lines.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {error.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
