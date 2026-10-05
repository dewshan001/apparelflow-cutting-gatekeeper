"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_REJECTION_NOTE, MIN_REJECTION_NOTE } from "@/lib/limits";

export function validateNote(raw) {
  const note = raw.trim();
  if (note === "") return "A reason is required to reject a batch";
  if (note.length < MIN_REJECTION_NOTE) return `Reason must be at least ${MIN_REJECTION_NOTE} characters`;
  if (note.length > MAX_REJECTION_NOTE) return `Reason must be ${MAX_REJECTION_NOTE} characters or fewer`;
  return null;
}

/**
 * onSubmit(note) -> Promise<{ fieldError?: string, error?: string }> (empty object = success).
 * The parent unmounts this dialog on success or cancel.
 */
export default function RejectDialog({ orderNo, onCancel, onSubmit }) {
  const dialogRef = useRef(null);
  const textareaRef = useRef(null);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // No cleanup close(): see CreateOrderModal (StrictMode would fire "close" and unmount us).
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    textareaRef.current?.focus();
  }, []);

  const clientError = validateNote(note);
  const shownError = (touched ? clientError : null) ?? serverError;

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    setBanner("");
    if (clientError) {
      textareaRef.current?.focus();
      return;
    }
    setBusy(true);
    const result = await onSubmit(note.trim());
    setBusy(false);
    if (result?.fieldError) {
      setServerError(result.fieldError);
      textareaRef.current?.focus();
    } else if (result?.error) {
      setBanner(result.error);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      aria-labelledby={`reject-title-${orderNo}`}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg bg-white p-0 text-gray-900 shadow-xl"
    >
      <form onSubmit={submit} noValidate className="space-y-4 p-5">
        <h2 id={`reject-title-${orderNo}`} className="text-lg font-semibold text-gray-900">
          Reject batch {orderNo}
        </h2>
        <p className="text-sm text-gray-800">
          The batch returns to the Cutting Supervisor for re-cutting. Explain what is wrong so it can be fixed.
        </p>

        {banner && (
          <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {banner}
          </p>
        )}

        <div>
          <label htmlFor={`reject-note-${orderNo}`} className="block text-sm font-medium text-gray-900">
            Reason for rejection (required)
          </label>
          <textarea
            id={`reject-note-${orderNo}`}
            ref={textareaRef}
            rows={4}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setServerError("");
            }}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(shownError)}
            aria-describedby={`reject-note-help-${orderNo}`}
            placeholder="e.g. Collar pieces short by 6 - fabric defect on roll"
            className={`mt-1 w-full rounded-md border px-3 py-2 ${shownError ? "border-red-600" : "border-gray-500"}`}
          />
          <div id={`reject-note-help-${orderNo}`} className="mt-1 flex justify-between gap-3 text-sm">
            {shownError ? (
              <p role="alert" className="font-medium text-red-700">
                {shownError}
              </p>
            ) : (
              <span className="text-gray-700">At least {MIN_REJECTION_NOTE} characters.</span>
            )}
            <span className="shrink-0 text-gray-700">
              {note.trim().length}/{MAX_REJECTION_NOTE}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-gray-500 bg-white px-4 py-2 font-medium text-gray-900 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800"
          >
            {busy ? "Rejecting..." : "Reject batch"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
