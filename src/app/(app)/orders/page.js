import OrdersView from "@/components/orders/OrdersView";
import { ROLES } from "@/lib/roles";
import { listOrdersFor, listRecipes } from "@/server/orderService";
import { guardPage } from "@/server/pageGuard";

export const metadata = { title: "Cutting Orders | ApparelFlow" };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const session = await guardPage(ROLES.CUTTING_SUPERVISOR);
  const [recipes, orders] = await Promise.all([listRecipes(), listOrdersFor(session.userId)]);

  const plainOrders = orders.map((o) => ({
    ...o,
    createdAt: new Date(o.createdAt).toISOString(),
    updatedAt: new Date(o.updatedAt).toISOString(),
  }));

  return <OrdersView recipes={recipes} orders={plainOrders} />;
}
