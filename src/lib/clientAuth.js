/** Calls the login API. Returns { ok, user?, error?, fieldErrors? }. */
export async function loginRequest(email, password) {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true, user: data.user };
    return { ok: false, error: data.error ?? "Login failed", fieldErrors: data.details };
  } catch {
    return { ok: false, error: "Network error. Please try again." };
  }
}
