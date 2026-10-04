import { ROLES } from "@/lib/roles";
import { guardPage } from "@/server/pageGuard";

export const metadata = { title: "Verification Terminal | ApparelFlow" };

export default async function VerificationPage() {
  await guardPage(ROLES.CUTTING_VERIFIER);
  return (
    <section className="rounded-lg border border-gray-300 bg-white p-6">
      <h1 className="text-xl font-semibold text-gray-900">Verification Terminal</h1>
      <p className="mt-2 text-gray-800">Component counting and batch approval arrive in the next steps.</p>
    </section>
  );
}
