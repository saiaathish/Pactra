import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { SponsorForm } from "@/components/sponsor-form";
import type { SponsorDoc } from "@/lib/types";

export default async function SponsorsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const sponsors = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .find({ ownerFirebaseUid: user.uid })
    .sort({ createdAt: -1 })
    .toArray();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sponsors</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Brands whose briefs you compile into executable requirements.
        </p>
      </div>

      <Card>
        <CardTitle>Add sponsor</CardTitle>
        <div className="mt-4">
          <SponsorForm redirectTo="/sponsors/[id]" />
        </div>
      </Card>

      <Card>
        <CardTitle>Your sponsors</CardTitle>
        {sponsors.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No sponsors yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {sponsors.map((s) => (
              <li key={s._id?.toString()} className="flex items-center justify-between py-3">
                <Link href={`/sponsors/${s._id?.toString()}`} className="text-sm font-medium hover:text-indigo-300">
                  {s.name}
                </Link>
                {s.website && <p className="text-xs text-zinc-500">{s.website}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
