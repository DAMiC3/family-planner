"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { InstallPrompt } from "@/components/pwa";
import { useSession } from "@/components/session-provider";

export default function Home() {
  const { session } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (session) router.replace("/dashboard");
  }, [session, router]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/icons/icon.svg`} alt="" width={88} height={88} />
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Family Planner</h1>
      <p className="max-w-xl text-lg text-zinc-600 dark:text-zinc-400">
        One place for the family calendar, chores, shopping lists and what&apos;s for dinner — shared with everyone
        at home.
      </p>
      <Link href="/login" className="rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white hover:bg-indigo-500">
        Get started
      </Link>
      <div className="w-full max-w-md text-left">
        <InstallPrompt />
      </div>
    </main>
  );
}
