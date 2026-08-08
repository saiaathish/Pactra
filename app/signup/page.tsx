import Link from "next/link";
import { FirebaseAuthForm } from "@/components/firebase-auth-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="text-lg font-semibold text-zinc-100">Pactra</span>
        </div>
        <h1 className="text-2xl font-semibold text-zinc-100">Create account</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Start testing sponsored YouTube videos before brand review.
        </p>
        <div className="mt-6">
          <FirebaseAuthForm mode="signup" />
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            ← Back to home
          </Link>
        </p>
      </div>
    </main>
  );
}
