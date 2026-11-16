"use client";

import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase/client";

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={`text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 ${className ?? ""}`}
      onClick={async () => {
        await getSupabase().auth.signOut();
        router.replace("/login");
      }}
    >
      Sign out
    </button>
  );
}
