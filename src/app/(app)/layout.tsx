import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { Nav } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-4">
            <Link href="/dashboard" className="font-bold">
              🏡 Family Planner
            </Link>
            <form action={signOut} className="sm:hidden">
              <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
            </form>
          </div>
          <Nav />
          <form action={signOut} className="hidden sm:block">
            <button className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
