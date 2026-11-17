import Link from "next/link";
import { FamilyProvider } from "@/components/family-provider";
import { BottomNav, Nav } from "@/components/nav";
import { OfflineBanner } from "@/components/pwa";
import { SignOutButton } from "@/components/sign-out-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <OfflineBanner />
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/program" className="font-bold">
            🏡 Family Planner
          </Link>
          <Nav />
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-28 sm:pb-10">
        <FamilyProvider>{children}</FamilyProvider>
      </main>
      <BottomNav />
    </div>
  );
}
