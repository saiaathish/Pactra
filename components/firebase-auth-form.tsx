"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "signup";

/**
 * Firebase Auth sign-in (app identity only — YouTube has its own OAuth flow).
 * After Firebase signs the user in, the ID token is exchanged server-side for
 * an httpOnly session cookie (POST /api/auth/session), then the user is
 * routed to /onboarding (new) or /dashboard.
 */
export function FirebaseAuthForm({ mode: initialMode }: { mode?: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode ?? "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function establishSession(idToken: string) {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw new Error("session creation failed");

    const bootstrap = await fetch("/api/auth/bootstrap", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const userDoc = await bootstrap.json();
    router.push(userDoc?.onboardingComplete ? "/dashboard" : "/onboarding");
    router.refresh();
  }

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
      await establishSession(await result.user.getIdToken());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const result =
        mode === "login"
          ? await signInWithEmailAndPassword(auth, email, password)
          : await createUserWithEmailAndPassword(auth, email, password);
      await establishSession(await result.user.getIdToken());
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleEmail} className="space-y-4">
        <Input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Input
          type="password"
          placeholder={mode === "signup" ? "Password (min 6 characters)" : "Password"}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Working…" : mode === "login" ? "Log in" : "Create account"}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="h-px flex-1 bg-zinc-800" />
        or
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <Button variant="secondary" onClick={handleGoogle} disabled={busy} className="w-full">
        Continue with Google
      </Button>

      <p className="text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>
            No account?{" "}
            <button className="text-indigo-400 hover:text-indigo-300" onClick={() => setMode("signup")}>
              Sign up
            </button>
          </>
        ) : (
          <>
            Have an account?{" "}
            <button className="text-indigo-400 hover:text-indigo-300" onClick={() => setMode("login")}>
              Log in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
