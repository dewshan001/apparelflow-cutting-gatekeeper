"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginRequest } from "@/lib/clientAuth";
import { homeFor } from "@/lib/roleConfig";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!email.trim()) next.email = "Email is required";
    if (!password) next.password = "Password is required";
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;

    setBusy(true);
    const result = await loginRequest(email, password);
    if (!result.ok) {
      setFormError(result.error);
      setBusy(false);
      return;
    }
    router.replace(homeFor(result.user.role));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Sign in">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-900">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "email-error" : undefined}
          className="mt-1 w-full rounded-md border border-gray-500 px-3 py-2"
        />
        {errors.email && (
          <p id="email-error" role="alert" className="mt-1 text-sm font-medium text-red-700">
            {errors.email}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-900">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "password-error" : undefined}
          className="mt-1 w-full rounded-md border border-gray-500 px-3 py-2"
        />
        {errors.password && (
          <p id="password-error" role="alert" className="mt-1 text-sm font-medium text-red-700">
            {errors.password}
          </p>
        )}
      </div>
      {formError && (
        <p
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
        >
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
      >
        {busy ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
