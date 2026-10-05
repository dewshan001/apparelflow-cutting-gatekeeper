import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import { formatPct, formatUtc } from "@/lib/format";
import { ROLES } from "@/lib/roles";
import { guardPage } from "@/server/pageGuard";
import { listQueue } from "@/server/sewingService";

export const metadata = { title: "Sewing Queue | ApparelFlow" };
export const dynamic = "force-dynamic";

export default async function SewingPage() {
  await guardPage(ROLES.SEWING_SUPERVISOR);
  const orders = await listQueue();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Sewing Queue</h1>
        <p className="text-sm text-gray-700">
          Only batches that passed verification appear here. Open one to review the verifier&apos;s record and start assembly.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-400 bg-white p-8 text-center">
          <p className="font-medium text-gray-900">No verified batches yet</p>
          <p className="mt-1 text-sm text-gray-700">Batches released by the Cutting Verifier will appear here.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id} className="rounded-lg border border-gray-300 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-semibold text-gray-900">{o.orderNo}</h2>
                  <StatusBadge status={o.status} />
                </div>
                <Link
                  href={`/sewing/${o.id}`}
                  className="rounded-md border border-blue-800 px-3 py-1.5 text-sm font-semibold text-blue-900 hover:bg-blue-50"
                >
                  {o.status === "VERIFIED" ? "Review & start" : "View"}
                  <span className="sr-only"> {o.orderNo}</span>
                </Link>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-gray-900 sm:grid-cols-4">
                <div>
                  <dt className="text-gray-700">Recipe</dt>
                  <dd className="font-medium">
                    {o.recipe.name} <span className="font-mono text-xs">({o.recipe.recipeCode})</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-700">Batch quantity</dt>
                  <dd className="font-medium">{o.targetQty} garments</dd>
                </div>
                <div>
                  <dt className="text-gray-700">Verified by</dt>
                  <dd className="font-medium">
                    {o.verification ? `${o.verification.verifierName}, ${formatUtc(o.verification.verifiedAt)}` : "n/a"}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-700">Fabric wastage</dt>
                  <dd className="font-medium">{formatPct(o.verification?.wastagePct)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
