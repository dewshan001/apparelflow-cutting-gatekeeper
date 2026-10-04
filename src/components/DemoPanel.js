"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginRequest } from "@/lib/clientAuth";
import { DEMO_ACCOUNTS, ROLE_CONFIG, homeFor } from "@/lib/roleConfig";

export default function DemoPanel() {
  const router = useRouter();
  const [busyRole, setBusyRole] = useState(null);
  const [error, setError] = useState("");

  async function loginAs(account) {
    setBusyRole(account.role);
    setError("");
    const result = await loginRequest(account.email, account.password);
    if (!result.ok) {
      setError(result.error);
      setBusyRole(null);
      return;
    }
    router.replace(homeFor(result.user.role));
    router.refresh();
  }

  return (
    <section aria-labelledby="demo-heading" className="space-y-3">
      <div>
        <h2 id="demo-heading" className="text-lg font-semibold text-gray-900">
          Demo credentials &amp; role switcher
        </h2>
        <p className="text-sm text-gray-700">
          One click signs you in as that persona. The server enforces each role&apos;s permissions.
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {error}
        </p>
      )}
      <ul className="grid gap-3">
        {DEMO_ACCOUNTS.map((a) => {
          const cfg = ROLE_CONFIG[a.role];
          return (
            <li
              key={a.role}
              className={`rounded-lg border border-gray-300 border-t-4 bg-white p-4 ${cfg.accent}`}
            >
              <h3 className="font-semibold text-gray-900">{cfg.label}</h3>
              <p className="font-mono text-xs text-gray-700">{a.role}</p>
              <p className="mt-2 text-sm text-gray-800">{cfg.description}</p>
              <p className="mt-1 text-sm font-medium text-red-800">Restriction: {cfg.restriction}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm text-gray-900">
                <dt className="font-medium">Email</dt>
                <dd className="font-mono">{a.email}</dd>
                <dt className="font-medium">Password</dt>
                <dd className="font-mono">{a.password}</dd>
              </dl>
              <button
                type="button"
                onClick={() => loginAs(a)}
                disabled={busyRole !== null}
                className="mt-3 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-60"
              >
                {busyRole === a.role ? "Signing in..." : `Login as ${cfg.label}`}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
