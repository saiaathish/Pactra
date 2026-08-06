import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CampaignDoc } from "@/lib/types";

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-zinc-500/15 text-zinc-400",
  awaiting_video: "bg-amber-500/15 text-amber-400",
  analyzing: "bg-indigo-500/15 text-indigo-400",
  revision_required: "bg-red-500/15 text-red-400",
  passed: "bg-emerald-500/15 text-emerald-400",
  approved: "bg-emerald-500/15 text-emerald-400",
  published: "bg-emerald-500/15 text-emerald-400",
  archived: "bg-zinc-500/15 text-zinc-400",
};

export default async function CampaignsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const campaigns = await db
    .collection<CampaignDoc>(COLLECTIONS.campaigns)
    .find({ ownerFirebaseUid: user.uid })
    .sort({ updatedAt: -1 })
    .toArray();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Campaigns</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Assign a brief version, upload rough cuts, run the preflight.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New campaign
        </Link>
      </div>

      <Card>
        <CardTitle>All campaigns</CardTitle>
        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            None yet — confirm a brief version first, then create a campaign.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {campaigns.map((c) => (
              <li key={c._id?.toString()} className="flex items-center justify-between py-3">
                <Link href={`/campaigns/${c._id?.toString()}`} className="text-sm font-medium hover:text-indigo-300">
                  {c.name}
                </Link>
                <Badge className={STATUS_COLORS[c.status] ?? ""}>{c.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
