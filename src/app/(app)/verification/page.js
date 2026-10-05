import VerificationView from "@/components/verification/VerificationView";
import { ROLES } from "@/lib/roles";
import { guardPage } from "@/server/pageGuard";
import { listPendingOrders } from "@/server/verificationService";

export const metadata = { title: "Verification Terminal | ApparelFlow" };
export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  await guardPage(ROLES.CUTTING_VERIFIER);
  const orders = await listPendingOrders();

  const plainOrders = orders.map((o) => ({
    ...o,
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  }));

  return <VerificationView orders={plainOrders} />;
}
