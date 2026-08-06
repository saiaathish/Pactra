import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { OnboardingForm } from "@/components/onboarding-form";
import { YouTubeConnectCard } from "@/components/youtube-connect-card";
import type { UserDoc } from "@/lib/types";

export default async function OnboardingPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const profile = await db
    .collection<UserDoc>(COLLECTIONS.users)
    .findOne({ firebaseUid: user.uid });

  if (profile?.onboardingComplete) redirect("/dashboard");

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold text-zinc-100">Welcome to Pactra</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Set up your profile, then connect YouTube so Pactra can see your
        videos.
      </p>
      <div className="mt-8 space-y-8">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-200">Your profile</h2>
          <div className="mt-4">
            <OnboardingForm />
          </div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-sm font-medium text-zinc-200">Connect YouTube</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Read-only access. You can do this later from the YouTube page.
          </p>
          <div className="mt-4">
            <YouTubeConnectCard />
          </div>
        </div>
      </div>
    </main>
  );
}
