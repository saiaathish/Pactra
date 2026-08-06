import Link from "next/link";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { BriefUploader } from "@/components/brief-uploader";
import { Badge } from "@/components/ui/badge";
import type { CampaignDoc, SponsorBriefDoc, SponsorDoc } from "@/lib/types";

export default async function SponsorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const db = await getDb();
  const sponsor = await db
    .collection<SponsorDoc>(COLLECTIONS.sponsors)
    .findOne({ _id: new ObjectId(id), ownerFirebaseUid: user.uid });
  if (!sponsor) redirect("/sponsors");

  const [briefs, campaigns, versions] = await Promise.all([
    db.collection<SponsorBriefDoc>(COLLECTIONS.sponsorBriefs)
      .find({ ownerFirebaseUid: user.uid, sponsorId: sponsor._id })
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection<CampaignDoc>(COLLECTIONS.campaigns)
      .find({ ownerFirebaseUid: user.uid, sponsorId: sponsor._id })
      .sort({ createdAt: -1 })
      .toArray(),
    db.collection(COLLECTIONS.briefVersions)
      .find({ ownerFirebaseUid: user.uid, sponsorId: sponsor._id })
      .sort({ versionNumber: -1 })
      .toArray(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{sponsor.name}</h1>
        {sponsor.website && <p className="mt-1 text-sm text-zinc-500">{sponsor.website}</p>}
      </div>

      <Card>
        <CardTitle>Upload sponsor brief</CardTitle>
        <div className="mt-4">
          <BriefUploader sponsorId={id} />
        </div>
      </Card>

      <Card>
        <CardTitle>Briefs</CardTitle>
        {briefs.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No briefs yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {briefs.map((b) => (
              <li key={b._id?.toString()} className="flex items-center justify-between py-3">
                <p className="text-sm font-medium">{b.name}</p>
                <span className="text-xs text-zinc-500">
                  v{b.currentVersionNumber} ·{" "}
                  {versions.filter((v) => v.sponsorBriefId.toString() === b._id?.toString()).length} version(s)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Campaigns</CardTitle>
        {campaigns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            None yet — confirm a brief version, then{" "}
            <Link href="/campaigns/new" className="text-indigo-400 hover:text-indigo-300">
              create a campaign
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {campaigns.map((c) => (
              <li key={c._id?.toString()} className="flex items-center justify-between py-3">
                <Link href={`/campaigns/${c._id?.toString()}`} className="text-sm font-medium hover:text-indigo-300">
                  {c.name}
                </Link>
                <Badge className="bg-zinc-800 text-zinc-400">{c.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
