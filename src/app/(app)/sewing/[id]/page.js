import Link from "next/link";
import { notFound } from "next/navigation";
import StartSewingButton from "@/components/sewing/StartSewingButton";
import StatusBadge from "@/components/StatusBadge";
import TrafficBadge from "@/components/TrafficBadge";
import { formatPct, formatUtc, formatVariance } from "@/lib/format";
import { ROLES } from "@/lib/roles";
import { idOrNull } from "@/server/http";
import { guardPage } from "@/server/pageGuard";
import { getQueueItem } from "@/server/sewingService";

export const metadata = { title: "Sewing Batch | ApparelFlow" };
export const dynamic = "force-dynamic";

export default async function SewingDetailPage({ params }) {
  await guardPage(ROLES.SEWING_SUPERVISOR);

  const orderId = idOrNull((await params).id);
  if (orderId === null) notFound();
  // Same query as the list: anything not VERIFIED / SEWING_STARTED is simply "not found".
  const order = await getQueueItem(orderId);
  if (!order) notFound();

  const v = order.verification;
  const mismatches = order.components.filter((c) => c.variance !== 0 && c.variance !== null);

  return (
    <div className="space-y-5">
      <Link href="/sewing" className="inline-block text-sm font-medium text-blue-800 underline-offset-4 hover:underline">
        &larr; Back to Sewing Queue
      </Link>

      <section className="rounded-lg border border-gray-300 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{order.orderNo}</h1>
            <StatusBadge status={order.status} />
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-gray-900 sm:grid-cols-4">
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
      </section>

      <section aria-labelledby="record-title" className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 id="record-title" className="text-lg font-semibold text-gray-900">
          Verification record
        </h2>
        {v ? (
          <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-3 text-sm text-gray-900 sm:grid-cols-3">
            <div>
              <dt className="text-gray-700">Verified by</dt>
              <dd className="font-medium">{v.verifierName}</dd>
            </div>
            <div>
              <dt className="text-gray-700">Verified at</dt>
              <dd className="font-medium">{formatUtc(v.verifiedAt)}</dd>
            </div>
            <div>
              <dt className="text-gray-700">Fabric wastage</dt>
              <dd className="font-medium">
                {formatPct(v.wastagePct)} <span className="font-normal text-gray-700">(cap {formatPct(v.wastageCap)})</span>{" "}
                {v.overCap ? (
                  <span className="rounded border border-amber-600 bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                    Over cap
                  </span>
                ) : (
                  <span className="rounded border border-green-600 bg-green-100 px-1.5 py-0.5 text-xs font-semibold text-green-900">
                    Within cap
                  </span>
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-gray-800">No verification record found for this batch.</p>
        )}
      </section>

      <section aria-labelledby="counts-title" className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 id="counts-title" className="text-lg font-semibold text-gray-900">
          Verified piece counts
        </h2>
        <div className="mt-3 overflow-x-auto rounded-md border border-gray-300">
          <table className="w-full min-w-[32rem] text-left text-sm text-gray-900">
            <thead className="bg-gray-100">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Expected</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Counted</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Variance</th>
                <th scope="col" className="px-3 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {order.components.map((c) => (
                <tr key={c.componentId} className="border-t border-gray-200">
                  <th scope="row" className="px-3 py-2 font-medium">{c.componentName}</th>
                  <td className="px-3 py-2 text-right">{c.expectedQty}</td>
                  <td className="px-3 py-2 text-right font-semibold">{c.actualQty ?? "-"}</td>
                  <td className="px-3 py-2 text-right">{formatVariance(c.variance)}</td>
                  <td className="px-3 py-2">
                    <TrafficBadge status={c.status} variance={c.variance} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="audit-title" className="rounded-lg border border-gray-300 bg-white p-5">
        <h2 id="audit-title" className="text-lg font-semibold text-gray-900">
          Audit notes
        </h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-gray-900">
          {mismatches.length === 0 ? (
            <li>Every component matched the expected count exactly.</li>
          ) : (
            mismatches.map((c) => (
              <li key={c.componentId}>
                {c.componentName}: {Math.abs(c.variance)} {c.variance > 0 ? "excess" : "short"} (expected {c.expectedQty}, counted {c.actualQty})
              </li>
            ))
          )}
          {order.auditNotes.length === 0 ? (
            <li>No earlier rejections: this batch passed on the first verification.</li>
          ) : (
            order.auditNotes.map((n, i) => (
              <li key={i}>
                Rejected before re-cut by {n.verifierName} on {formatUtc(n.at)}: &quot;{n.note}&quot;
              </li>
            ))
          )}
        </ul>
      </section>

      <section aria-label="Sewing action" className="rounded-lg border border-gray-300 bg-white p-5">
        {order.status === "VERIFIED" ? (
          <StartSewingButton orderId={order.id} orderNo={order.orderNo} />
        ) : (
          <p role="status" className="text-sm font-medium text-blue-900">
            Sewing assembly is in progress for this batch (started {formatUtc(order.updatedAt)}).
          </p>
        )}
      </section>
    </div>
  );
}
