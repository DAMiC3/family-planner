"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/action-form";
import { useSession } from "@/components/session-provider";
import { Field, Input } from "@/components/ui";
import { getSupabase } from "@/lib/supabase/client";

type Mode = "code" | "password" | "signup";

// Email codes need the project's email templates to include {{ .Token }}. This Supabase project shares
// its templates with AutoMark, so code sign-in is switched off for now (password only).
const CODE_LOGIN = false;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sign in by typing a code from your email (default) or with a password.
 * Typing a code keeps you signed in inside the app on this phone — unlike an email link,
 * which opens in a different browser (and on iPhone, outside the Home Screen app).
 */
export function LoginForm() {
  const [mode, setMode] = useState<Mode>(CODE_LOGIN ? "code" : "password");
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { session } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) router.replace("/program");
  }, [session, router]);

  function switchMode(m: Mode) {
    setMode(m);
    setError(null);
    setInfo(null);
    setCodeSent(false);
  }

  async function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  async function sendCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!EMAIL_RE.test(addr)) return setError("Enter a valid email address");
    await run(async () => {
      const { error } = await getSupabase().auth.signInWithOtp({ email: addr, options: { shouldCreateUser: true } });
      if (error) throw error;
      setEmail(addr);
      setCodeSent(true);
      setInfo(`We emailed a code to ${addr}. Type it below — don't tap the link in the email.`);
    });
  }

  async function verifyCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const token = String(new FormData(e.currentTarget).get("code") ?? "").replace(/\s/g, "");
    if (!/^\d{6,10}$/.test(token)) return setError("Enter the code from the email (numbers only)");
    await run(async () => {
      const { error } = await getSupabase().auth.verifyOtp({ email, token, type: "email" });
      if (error) throw new Error(error.message.includes("expired") || error.message.includes("invalid") ? "That code is wrong or has expired. Send a new one." : error.message);
      router.replace("/program");
    });
  }

  async function passwordSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const addr = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!EMAIL_RE.test(addr)) return setError("Enter a valid email address");
    if (password.length < 8) return setError("Password must be at least 8 characters");
    const supabase = getSupabase();
    await run(async () => {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) throw error;
        router.replace("/program");
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email: addr, password });
      if (error) throw error;
      // Supabase returns a user with no identities when the email is already registered.
      if (data.user && data.user.identities?.length === 0) {
        setMode("password");
        setEmail(addr);
        setInfo("You already have an account with this email (for example from AutoMark). Sign in with that password.");
        return;
      }
      if (data.session) router.replace("/onboarding");
      else {
        setMode("password");
        setEmail(addr);
        setInfo(
          "Account created! Open the confirmation email and tap the link (it's branded AutoMark — that's expected). Then come back here and sign in with your password.",
        );
      }
    });
  }

  const tabs: { m: Mode; label: string }[] = [
    ...(CODE_LOGIN ? [{ m: "code" as Mode, label: "Email code" }] : []),
    { m: "password", label: "Sign in" },
    { m: "signup", label: "New account" },
  ];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className={`mb-6 grid ${CODE_LOGIN ? "grid-cols-3" : "grid-cols-2"} rounded-lg bg-zinc-100 p-1 text-sm font-medium`}>
        {tabs.map(({ m, label }) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-md py-1.5 ${mode === m ? "bg-white shadow" : "text-zinc-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {info && <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</p>}

      {mode === "code" && !codeSent && (
        <form onSubmit={sendCode} className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Email me a code"}</Button>
          <p className="text-xs text-zinc-500">No password needed. New here? This creates your account too.</p>
        </form>
      )}

      {mode === "code" && codeSent && (
        <form onSubmit={verifyCode} className="flex flex-col gap-4">
          <Field label="Code from the email">
            <Input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={12}
              required
              autoFocus
              className="text-center font-mono text-2xl tracking-[0.4em]"
            />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Checking…" : "Sign in"}</Button>
          <button type="button" className="text-sm text-brand-600" onClick={() => { setCodeSent(false); setInfo(null); }}>
            Use a different email or send a new code
          </button>
        </form>
      )}

      {mode !== "code" && (
        <form onSubmit={passwordSubmit} className="flex flex-col gap-4">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required defaultValue={email} />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" minLength={8} autoComplete={mode === "password" ? "current-password" : "new-password"} required />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Please wait…" : mode === "password" ? "Sign in" : "Create account"}
          </Button>
          {mode === "password" && (
            <p className="text-xs text-zinc-500">
              You stay signed in on this device until you tap Sign out. Already use AutoMark? The same email and password work here.
            </p>
          )}
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
