import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-16">
      <h1 className="mb-2 text-center text-2xl font-bold">Family Planner</h1>
      <p className="mb-8 text-center text-sm text-zinc-500">Sign in or create an account</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
