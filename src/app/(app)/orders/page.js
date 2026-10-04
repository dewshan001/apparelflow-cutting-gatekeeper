import { ROLES } from "@/lib/roles";
import { guardPage } from "@/server/pageGuard";

export const metadata = { title: "Cutting Orders | ApparelFlow" };

export default async function OrdersPage() {
  await guardPage(ROLES.CUTTING_SUPERVISOR);
  return (
    <section className="rounded-lg border border-gray-300 bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900">Cutting Orders</h1>
      <p className="mt-2 text-gray-800">Order creation and tracking arrive in the next steps.</p>
    </section>
  );
}
