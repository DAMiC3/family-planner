import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="text-5xl" aria-hidden>
        🏡
      </div>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Family Planner</h1>
      <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        One place for the family calendar, chores, shopping lists and what&apos;s for dinner — shared with everyone
        at home.
      </p>
      <div className="flex gap-3">
        <Link href="/login" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500">
          Get started
        </Link>
      </div>
    </main>
  );
}
