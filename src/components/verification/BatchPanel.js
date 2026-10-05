"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import TrafficBadge from "@/components/TrafficBadge";
import {
  approveBlockedReason,
  changedCounts,
  describeServerError,
  summarizeCounts,
} from "@/lib/verifierCounts";
import RejectDialog from "./RejectDialog";

async function request(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: "Network error. Please check your connection and try again." } };
  }
}

function formatUtc(iso) {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

export default function BatchPanel({ order, onResult }) {
  const router = useRouter();
  const idBase = `batch-${order.id}`;

  const [inputs, setInputs] = useState(() =>
    Object.fromEntries(order.items.map((i) => [i.componentId, i.actualQty === null ? "" : String(i.actualQty)])),
  );
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(order.items.map((i) => [i.componentId, i.actualQty])),
  );
  const [busy, setBusy] = useState(null); // "save" | "approve" | "reject" | null
  const [error, setError] = useState(null); // { title, lines }
  const [notice, setNotice] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const summary = useMemo(() => summarizeCounts(order.items, inputs), [order.items, inputs]);
  const changes = useMemo(() => changedCounts(order.items, saved, inputs), [order.items, saved, inputs]);
  const dirty = changes.length > 0;
  const blockedReason = approveBlockedReason(summary);
  const approveDisabled = !summary.canApprove || busy !== null;

  function fail(res) {
    const described = describeServerError(res.status, res.data);
    setError(described);
    if (res.status === 401) router.replace("/login");
    // Someone else already processed this batch: refresh so the queue shows the truth.
    if (res.status === 409 || res.status === 404) router.refresh();
  }

  /** Saves changed, valid counts. Returns true on success (or when there is nothing to save). */
  async function persistCounts() {
    if (changes.length === 0) return true;
    const res = await request("PUT", `/api/verification/${order.id}/counts`, { counts: changes });
    if (!res.ok) {
      fail(res);
      return false;
    }
    const serverItems = res.data.order.items;
    setSaved(Object.fromEntries(serverItems.map((i) => [i.componentId, i.actualQty])));
    return true;
  }

  async function onSave(e) {
    e.preventDefault();
    if (busy || !dirty || summary.errorCount > 0) return;
    setBusy("save");
    setError(null);
    setNotice("");
    const ok = await persistCounts();
    if (ok) setNotice("Counts saved.");
    setBusy(null);
  }

  async function onApprove() {
    // The button is disabled in this state; this guard covers keyboard/DOM tampering.
    // The server enforces the same rule regardless.
    if (!summary.canApprove || busy) return;
    setBusy("approve");
    setError(null);
    setNotice("");
    if (await persistCounts()) {
      const res = await request("POST", `/api/verification/${order.id}/approve`);
      if (res.ok) {
        onResult(`${order.orderNo} approved and released to the Sewing Queue.`);
        router.refresh();
        return;
      }
      fail(res);
    }
    setBusy(null);
  }

  function openReject() {
    setNotice("");
    if (summary.errorCount > 0) {
      setError({ title: "Fix or clear the highlighted counts before rejecting.", lines: [] });
      return;
    }
    setError(null);
    setRejecting(true);
  }

  async function submitReject(note) {
    setBusy("reject");
    try {
      // Record what was counted so the audit snapshot reflects it.
      if (!(await persistCounts())) {
        setRejecting(false);
        return {};
      }
      const res = await request("POST", `/api/verification/${order.id}/reject`, { note });
      if (res.ok) {
        onResult(`${order.orderNo} rejected and returned to the Cutting Supervisor.`);
        router.refresh();
        return {};
      }
      const fieldError = res.status === 422 ? res.data?.details?.note?.[0] : undefined;
      if (fieldError) return { fieldError };
      if (res.status === 401) router.replace("/login");
      if (res.status === 409 || res.status === 404) {
        setRejecting(false);
        fail(res);
        return {};
      }
      const described = describeServerError(res.status, res.data);
      return { error: [described.title, ...described.lines].join(" ") };
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded-lg border border-gray-300 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{order.orderNo}</h2>
          <p className="text-sm text-gray-800">
            {order.recipe.name} <span className="font-mono text-xs">({order.recipe.recipeCode})</span>
          </p>
        </div>
        <p className="text-sm text-gray-700">Submitted {formatUtc(order.createdAt)}</p>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-900 sm:grid-cols-4">
        <div>
          <dt className="text-gray-700">Batch quantity</dt>
          <dd className="font-medium">{order.targetQty} garments</dd>
        </div>
        <div>
          <dt className="text-gray-700">Fabric roll</dt>
          <dd className="font-medium">{order.fabricRollId}</dd>
        </div>
        <div>
          <dt className="text-gray-700">Fabric used</dt>
          <dd className="font-medium">{order.actualFabricYds.toFixed(2)} yds</dd>
        </div>
        <div>
          <dt className="text-gray-700">Expected fabric</dt>
          <dd className="font-medium">{order.expectedFabricYds.toFixed(2)} yds</dd>
        </div>
      </dl>

      {order.rejectionCount > 0 && (
        <p className="mt-3 rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          Re-cut after rejection #{order.rejectionCount}
          {order.rejectionNote ? <> - previous reason: {order.rejectionNote}</> : null}
        </p>
      )}

      <form onSubmit={onSave} noValidate className="mt-4">
        <div className="overflow-x-auto rounded-md border border-gray-300">
          <table className="w-full min-w-[34rem] text-left text-sm text-gray-900">
            <caption className="sr-only">Component counts for {order.orderNo}</caption>
            <thead className="bg-gray-100">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Expected</th>
                <th scope="col" className="px-3 py-2 font-semibold">Counted pieces</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item, i) => {
                const row = summary.rows[i];
                const inputId = `${idBase}-count-${item.componentId}`;
                return (
                  <tr key={item.componentId} className="border-t border-gray-200 align-top">
                    <th scope="row" className="px-3 py-2 font-medium">{item.componentName}</th>
                    <td className="px-3 py-2 text-right font-semibold">{item.expectedQty}</td>
                    <td className="px-3 py-2">
                      <input
                        id={inputId}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-label={`Counted pieces for ${item.componentName}`}
                        aria-invalid={Boolean(row.error)}
                        aria-describedby={row.error ? `${inputId}-error` : undefined}
                        value={inputs[item.componentId]}
                        onChange={(e) => setInputs((prev) => ({ ...prev, [item.componentId]: e.target.value }))}
                        placeholder="Count"
                        disabled={busy !== null}
                        className={`w-28 rounded-md border px-2 py-1.5 ${row.error ? "border-red-600" : "border-gray-500"}`}
                      />
                      {row.error && (
                        <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs font-medium text-red-700">
                          {row.error}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <TrafficBadge status={row.status} variance={row.variance} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-900">
          <span>
            {summary.countedCount} of {order.items.length} components counted
          </span>
          {dirty && <span className="font-medium text-amber-900">Unsaved changes</span>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || summary.errorCount > 0 || busy !== null}
            className="rounded-md border border-gray-600 bg-white px-4 py-2 font-medium text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-700"
          >
            {busy === "save" ? "Saving..." : "Save counts"}
          </button>
          <button
            type="button"
            onClick={onApprove}
            disabled={approveDisabled}
            aria-describedby={`${idBase}-approve-hint`}
            className="rounded-md bg-green-700 px-4 py-2 font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-800"
          >
            {busy === "approve" ? "Approving..." : "Approve Batch"}
          </button>
          <button
            type="button"
            onClick={openReject}
            disabled={busy !== null}
            className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject Batch
          </button>
        </div>

        <p id={`${idBase}-approve-hint`} className="mt-2 text-sm font-medium text-gray-900">
          {summary.canApprove
            ? dirty
              ? "All components counted with no shortage. Counts are saved when you approve."
              : "All components counted with no shortage. Ready to approve."
            : `Approve is blocked: ${blockedReason || "no components to verify"}. A batch with any shortage can only be rejected.`}
        </p>
      </form>

      {notice && (
        <p role="status" className="mt-3 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-900">
          {notice}
        </p>
      )}

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

      {rejecting && (
        <RejectDialog orderNo={order.orderNo} onCancel={() => setRejecting(false)} onSubmit={submitReject} />
      )}
    </li>
  );
}
