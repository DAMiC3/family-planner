import Link from "next/link";
import { FamilyProvider } from "@/components/family-provider";
import { Nav } from "@/components/nav";
import { OfflineBanner } from "@/components/pwa";
import { SignOutButton } from "@/components/sign-out-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <OfflineBanner />
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="font-bold">
              🏡 Family Planner
            </Link>
            <SignOutButton className="sm:hidden" />
          </div>
          <Nav />
          <SignOutButton className="hidden sm:block" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <FamilyProvider>{children}</FamilyProvider>
      </main>
    </div>
  );
}
