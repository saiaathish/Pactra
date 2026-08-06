import { redirect, notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RequirementReviewer } from "@/components/requirement-reviewer";
import type { BriefVersionDoc, RequirementDoc, SponsorBriefDoc } from "@/lib/types";

export default async function BriefVersionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();

  const db = await getDb();
  const version = await db
    .collection<BriefVersionDoc>(COLLECTIONS.briefVersions)
    .findOne({ _id: new ObjectId(id), ownerFirebaseUid: user.uid });
  if (!version) redirect("/sponsors");

  const [brief, requirements] = await Promise.all([
    db.collection<SponsorBriefDoc>(COLLECTIONS.sponsorBriefs).findOne({ _id: version.sponsorBriefId, ownerFirebaseUid: user.uid }),
    db.collection<RequirementDoc>(COLLECTIONS.requirements)
      .find({ ownerFirebaseUid: user.uid, briefVersionId: version._id })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{brief?.name ?? "Brief"} v{version.versionNumber}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Status: <Badge className="bg-zinc-800 text-zinc-300">{version.status.replace("_", " ")}</Badge>
          {version.sourceSha256 && (
            <span className="ml-2 text-xs text-zinc-600">
              sha256:{version.sourceSha256.slice(0, 12)}…
            </span>
          )}
        </p>
      </div>

      {version.status === "review_required" ? (
        <Card>
          <CardTitle>Review extracted requirements</CardTitle>
          <div className="mt-4">
            <RequirementReviewer
              versionId={id}
              initial={requirements.map((r) => ({
                id: r._id?.toString(),
                type: r.type,
                description: r.description,
                parameters: r.parameters ?? {},
                verificationMode: r.verificationMode,
              }))}
            />
          </div>
        </Card>
      ) : (
        <Card>
          <CardTitle>Requirements (immutable — v{version.versionNumber})</CardTitle>
          <ul className="mt-3 divide-y divide-zinc-800">
            {requirements.map((r) => (
              <li key={r._id?.toString()} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm text-zinc-200">{r.description}</p>
                  <p className="text-xs text-zinc-500">{r.type} · {r.verificationMode}</p>
                </div>
                <Badge className="bg-zinc-800 text-zinc-400">{r.status}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
