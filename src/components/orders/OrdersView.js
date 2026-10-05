"use client";

import { useEffect, useRef, useState } from "react";
import CreateOrderModal from "./CreateOrderModal";
import OrderCard from "./OrderCard";

export default function OrdersView({ recipes, orders }) {
  const [creating, setCreating] = useState(false);
  const createButtonRef = useRef(null);
  const wasCreating = useRef(false);

  // Return focus to the Create Order button when the dialog closes (Cancel / Close / Esc / success).
  useEffect(() => {
    if (wasCreating.current && !creating) createButtonRef.current?.focus();
    wasCreating.current = creating;
  }, [creating]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cutting Orders</h1>
          <p className="text-sm text-gray-700">Create batches and track them through verification.</p>
        </div>
        <button
          ref={createButtonRef}
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
        >
          Create Order
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-400 bg-white p-8 text-center">
          <p className="font-medium text-gray-900">No orders yet</p>
          <p className="mt-1 text-sm text-gray-700">Use &quot;Create Order&quot; to start your first cutting batch.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}

      {creating && <CreateOrderModal recipes={recipes} onClose={() => setCreating(false)} />}
    </div>
  );
}
