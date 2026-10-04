import { ROLES } from "@/lib/roles";
import { guardPage } from "@/server/pageGuard";

export const metadata = { title: "Sewing Queue | ApparelFlow" };

export default async function SewingPage() {
  await guardPage(ROLES.SEWING_SUPERVISOR);
  return (
    <section className="rounded-lg border border-gray-300 bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900">Sewing Queue</h1>
      <p className="mt-2 text-gray-800">Verified batches will appear here.</p>
    </section>
  );
}
