import Link from "next/link";
import { ROLE_CONFIG } from "@/lib/roleConfig";
import LogoutButton from "./LogoutButton";

export default function AppShell({ user, children }) {
  const cfg = ROLE_CONFIG[user.role];
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-300 bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <span className="font-bold text-gray-900">ApparelFlow</span>
            <nav aria-label="Main" className="flex gap-4">
              {cfg.nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="font-medium text-blue-800 underline-offset-4 hover:underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right text-sm text-gray-900">
              <div className="font-medium">{user.fullName}</div>
              <div className="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-xs font-semibold text-gray-900">
                {cfg.label}
              </div>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
