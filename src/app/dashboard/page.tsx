"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Old address (before "My program"); kept so earlier home-screen installs still open. */
export default function DashboardRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/program"), [router]);
  return null;
}
