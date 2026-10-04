import { redirect } from "next/navigation";
import DemoPanel from "@/components/DemoPanel";
import LoginForm from "@/components/LoginForm";
import { homeFor } from "@/lib/roleConfig";
import { getSession } from "@/server/auth";

export const metadata = { title: "Sign in | ApparelFlow Cutting Gatekeeper" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">ApparelFlow Cutting Gatekeeper</h1>
        <p className="text-gray-700">Cutting Operations &amp; Verification Terminal</p>
      </header>
      <div className="grid gap-8 md:grid-cols-2">
        <section
          aria-labelledby="signin-heading"
          className="h-fit rounded-lg border border-gray-300 bg-white p-5"
        >
          <h2 id="signin-heading" className="mb-4 text-lg font-semibold text-gray-900">
            Sign in
          </h2>
          <LoginForm />
        </section>
        <DemoPanel />
      </div>
    </main>
  );
}
