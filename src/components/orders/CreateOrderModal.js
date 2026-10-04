"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MAX_QTY, MAX_ROLL_ID_LENGTH, MAX_YARDS } from "@/lib/limits";
import { expectedComponents } from "@/server/domain/orders";

// Client-side checks are for fast feedback only; the server schemas are the real guard.
export function validateOrder({ recipeId, qty, roll, yards }) {
  const errors = {};

  if (!recipeId) errors.recipeId = "Select a recipe";

  if (qty.trim() === "") {
    errors.qty = "Target quantity is required";
  } else if (qty.includes(".")) {
    errors.qty = "Must be a whole number (no decimals)";
  } else if (qty.startsWith("-")) {
    errors.qty = "Cannot be negative";
  } else if (!/^\d+$/.test(qty)) {
    errors.qty = "Enter digits only";
  } else if (Number(qty) <= 0) {
    errors.qty = "Must be greater than 0";
  } else if (Number(qty) > MAX_QTY) {
    errors.qty = `Must be ${MAX_QTY.toLocaleString("en-US")} or fewer`;
  }

  const rollTrim = roll.trim();
  if (rollTrim === "") errors.roll = "Fabric roll ID is required";
  else if (rollTrim.length > MAX_ROLL_ID_LENGTH) errors.roll = `Must be ${MAX_ROLL_ID_LENGTH} characters or fewer`;

  if (yards.trim() === "") {
    errors.yards = "Fabric used is required";
  } else if (yards.startsWith("-")) {
    errors.yards = "Cannot be negative";
  } else if (!/^\d+(\.\d+)?$/.test(yards)) {
    errors.yards = "Enter a number, e.g. 94.5";
  } else if (!/^\d+(\.\d{1,2})?$/.test(yards)) {
    errors.yards = "Use at most 2 decimal places";
  } else if (Number(yards) <= 0) {
    errors.yards = "Must be greater than 0";
  } else if (Number(yards) > MAX_YARDS) {
    errors.yards = `Must be ${MAX_YARDS.toLocaleString("en-US")} or fewer`;
  }

  return errors;
}

const FIELD_ORDER = ["recipeId", "qty", "roll", "yards"];
const FIELD_IDS = { recipeId: "order-recipe", qty: "order-qty", roll: "order-roll", yards: "order-yards" };
// Server field names -> form field names
const SERVER_FIELDS = {
  recipeId: "recipeId",
  targetQty: "qty",
  fabricRollId: "roll",
  actualFabricYds: "yards",
};

function Field({ name, label, error, hint, children }) {
  const id = FIELD_IDS[name];
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-900">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-gray-700">{hint}</p>}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export default function CreateOrderModal({ recipes, onClose }) {
  const router = useRouter();
  const dialogRef = useRef(null);
  const [recipeId, setRecipeId] = useState("");
  const [qty, setQty] = useState("");
  const [roll, setRoll] = useState("");
  const [yards, setYards] = useState("");
  const [touched, setTouched] = useState({});
  const [serverErrors, setServerErrors] = useState({});
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // No cleanup close(): unmounting removes the dialog, and closing here would fire the
    // "close" event under React StrictMode's double effect run and unmount the modal at once.
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const values = { recipeId, qty, roll, yards };
  const clientErrors = validateOrder(values);
  const errorFor = (name) => (touched[name] ? clientErrors[name] : undefined) ?? serverErrors[name];
  const touch = (name) => setTouched((t) => ({ ...t, [name]: true }));
  const clearServer = (name) => setServerErrors((s) => ({ ...s, [name]: undefined }));

  const recipe = recipes.find((r) => String(r.id) === recipeId);
  const previewRows =
    recipe && !clientErrors.qty && qty !== "" ? expectedComponents(recipe.components, Number(qty)) : null;

  async function onSubmit(e) {
    e.preventDefault();
    setBanner("");
    setTouched({ recipeId: true, qty: true, roll: true, yards: true });
    const firstInvalid = FIELD_ORDER.find((f) => clientErrors[f]);
    if (firstInvalid) {
      document.getElementById(FIELD_IDS[firstInvalid])?.focus();
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: Number(recipeId),
          targetQty: Number(qty),
          fabricRollId: roll.trim(),
          actualFabricYds: Number(yards),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 422 && data.details) {
        const mapped = {};
        for (const [field, messages] of Object.entries(data.details)) {
          const key = SERVER_FIELDS[field];
          if (key && messages?.length) mapped[key] = messages[0];
        }
        setServerErrors(mapped);
        setBanner(Object.keys(mapped).length ? "" : data.error ?? "Invalid request");
        return;
      }
      if (!res.ok) {
        setBanner(data.error ?? "Could not create the order. Please try again.");
        return;
      }

      router.refresh();
      onClose();
    } catch {
      setBanner("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const inputClass = (name) =>
    `mt-1 w-full rounded-md border px-3 py-2 ${errorFor(name) ? "border-red-600" : "border-gray-500"}`;
  const aria = (name) => ({
    "aria-invalid": Boolean(errorFor(name)),
    "aria-describedby": errorFor(name) ? `${FIELD_IDS[name]}-error` : undefined,
  });

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="create-order-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-lg bg-white p-0 text-gray-900 shadow-xl"
    >
      <form onSubmit={onSubmit} noValidate className="max-h-[90vh] space-y-4 overflow-y-auto p-5">
        <div className="flex items-start justify-between gap-4">
          <h2 id="create-order-title" className="text-lg font-semibold text-gray-900">
            Create cutting order
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-gray-500 px-2 py-1 text-sm font-medium text-gray-900 hover:bg-gray-100"
          >
            Close
          </button>
        </div>

        {banner && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {banner}
          </p>
        )}

        <Field name="recipeId" label="Recipe" error={errorFor("recipeId")}>
          <select
            id="order-recipe"
            value={recipeId}
            onChange={(e) => {
              setRecipeId(e.target.value);
              clearServer("recipeId");
            }}
            onBlur={() => touch("recipeId")}
            {...aria("recipeId")}
            className={inputClass("recipeId")}
          >
            <option value="">Select a recipe</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.recipeCode} - {r.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="qty" label="Target batch quantity (garments)" error={errorFor("qty")}>
            <input
              id="order-qty"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 50"
              value={qty}
              onChange={(e) => {
                setQty(e.target.value);
                clearServer("qty");
              }}
              onBlur={() => touch("qty")}
              {...aria("qty")}
              className={inputClass("qty")}
            />
          </Field>

          <Field name="yards" label="Actual fabric used (yards)" error={errorFor("yards")}>
            <input
              id="order-yards"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 94.5"
              value={yards}
              onChange={(e) => {
                setYards(e.target.value);
                clearServer("yards");
              }}
              onBlur={() => touch("yards")}
              {...aria("yards")}
              className={inputClass("yards")}
            />
          </Field>
        </div>

        <Field name="roll" label="Fabric roll ID" error={errorFor("roll")}>
          <input
            id="order-roll"
            type="text"
            autoComplete="off"
            placeholder="e.g. FAB-ROLL-882"
            value={roll}
            onChange={(e) => {
              setRoll(e.target.value);
              clearServer("roll");
            }}
            onBlur={() => touch("roll")}
            {...aria("roll")}
            className={inputClass("roll")}
          />
        </Field>

        <section aria-labelledby="preview-title">
          <h3 id="preview-title" className="text-sm font-semibold text-gray-900">
            Expected component counts
          </h3>
          {previewRows ? (
            <div className="mt-2 overflow-x-auto rounded-md border border-gray-300">
              <table className="w-full text-left text-sm text-gray-900">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-semibold">Component</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Per garment</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Expected pieces</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={row.componentId} className="border-t border-gray-200">
                      <td className="px-3 py-2">{row.componentName}</td>
                      <td className="px-3 py-2 text-right">{recipe.components[i].piecesPerGarment}</td>
                      <td className="px-3 py-2 text-right font-semibold">{row.expectedQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-1 text-sm text-gray-700">
              Choose a recipe and enter a valid quantity to preview the expected pieces.
            </p>
          )}
        </section>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-500 bg-white px-4 py-2 font-medium text-gray-900 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-60"
          >
            {busy ? "Creating..." : "Create order"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
