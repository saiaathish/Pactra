import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/firebase/session";
import { COLLECTIONS, getDb } from "@/lib/mongodb";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisRunDoc, CampaignDoc, TestResultDoc } from "@/lib/types";

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

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const db = await getDb();
  const [campaigns, recentRuns] = await Promise.all([
    db.collection<CampaignDoc>(COLLECTIONS.campaigns)
      .find({ ownerFirebaseUid: user.uid })
      .sort({ updatedAt: -1 })
      .limit(8)
      .toArray(),
    db.collection<AnalysisRunDoc>(COLLECTIONS.analysisRuns)
      .find({ ownerFirebaseUid: user.uid })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray(),
  ]);

  // Failing requirements from the latest runs.
  const failuresByRun: Record<string, number> = {};
  for (const run of recentRuns) {
    const count = await db.collection<TestResultDoc>(COLLECTIONS.testResults).countDocuments({
      ownerFirebaseUid: user.uid,
      analysisRunId: run._id,
      status: "fail",
    });
    failuresByRun[run._id!.toString()] = count;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Campaign status, recent analysis runs, and failing requirements.
        </p>
      </div>

      <Card>
        <CardTitle>Campaigns</CardTitle>
        {campaigns.length === 0 ? (
          <div className="mt-3">
            <p className="text-sm text-zinc-500">No campaigns yet.</p>
            <Link
              href="/campaigns/new"
              className="mt-2 inline-block text-sm text-indigo-400 hover:text-indigo-300"
            >
              Create your first campaign →
            </Link>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {campaigns.map((c) => (
              <li key={c._id?.toString()} className="flex items-center justify-between py-3">
                <Link
                  href={`/campaigns/${c._id?.toString()}`}
                  className="text-sm font-medium hover:text-indigo-300"
                >
                  {c.name}
                </Link>
                <Badge className={STATUS_COLORS[c.status] ?? ""}>{c.status.replace("_", " ")}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardTitle>Recent analysis runs</CardTitle>
        {recentRuns.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">
            No runs yet — create a campaign, upload a rough cut, and run the preflight.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-800">
            {recentRuns.map((run) => {
              const failures = failuresByRun[run._id!.toString()] ?? 0;
              return (
                <li key={run._id?.toString()} className="flex items-center justify-between py-3">
                  <Link
                    href={`/analysis/${run._id?.toString()}`}
                    className="text-sm font-medium hover:text-indigo-300"
                  >
                    {run.currentStage ?? run.status} · {run.progressPercent}%
                  </Link>
                  <div className="flex items-center gap-2">
                    {failures > 0 && (
                      <Badge className="bg-red-500/15 text-red-400">{failures} failing</Badge>
                    )}
                    <Badge className="bg-zinc-800 text-zinc-400">{run.status}</Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
