"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Meals now live in the calendar. */
export default function MealsRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/calendar"), [router]);
  return null;
}
