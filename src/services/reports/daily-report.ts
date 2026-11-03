import { env } from "../../env.js";
import {
  getOverviewTotals,
  getTopContributors,
  getTopRepos,
} from "../database/analytics-db-service.js";
import { sendSlackMessage, type SlackMessage } from "../slack/index.js";
import type { Db } from "../../database/client.js";

function todayRange(tz: string): { dateFrom: Date; dateTo: Date } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "2024";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";

  const startOfDay = new Date(`${y}-${m}-${d}T00:00:00`);
  const startUtc = new Date(startOfDay.toLocaleString("en-US", { timeZone: "UTC" }));
  const localOffset = new Date(startOfDay.toLocaleString("en-US", { timeZone: tz }));
  const offsetMs = startOfDay.getTime() - localOffset.getTime() + startUtc.getTime();
  const dateFrom = new Date(offsetMs);
  const dateTo = now;
  return { dateFrom, dateTo };
}

function yesterdayRange(tz: string): { dateFrom: Date; dateTo: Date } {
  const { dateFrom: todayStart } = todayRange(tz);
  const dateTo = new Date(todayStart.getTime() - 1);
  const dateFrom = new Date(todayStart.getTime() - 86_400_000);
  return { dateFrom, dateTo };
}

function formatDate(d: Date, tz: string): string {
  return d.toLocaleDateString("en-IN", { timeZone: tz, weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function bar(count: number, max: number, width = 10): string {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export async function sendDailyReport(
  db: Db,
  period: "eod" | "morning",
): Promise<void> {
  const tz = env.REPORT_TIMEZONE;
  const filter =
    period === "eod"
      ? { ...todayRange(tz), tz, includeMerges: false, includeBots: false }
      : { ...yesterdayRange(tz), tz, includeMerges: false, includeBots: false };

  const [totals, topContribs, topRepos] = await Promise.all([
    getOverviewTotals(db, filter),
    getTopContributors(db, filter, 5),
    getTopRepos(db, filter, 5),
  ]);

  const periodLabel =
    period === "eod"
      ? `Today so far — ${formatDate(new Date(), tz)}`
      : `Yesterday — ${formatDate(filter.dateFrom, tz)}`;

  const maxContrib = topContribs[0]?.count ?? 0;
  const maxRepo = topRepos[0]?.count ?? 0;

  const contribLines =
    topContribs.length === 0
      ? "_No commits recorded_"
      : topContribs
          .map(
            (c, i) =>
              `${i + 1}. *${c.login}* — ${c.count.toLocaleString()} commit${c.count !== 1 ? "s" : ""}  \`${bar(c.count, maxContrib)}\``,
          )
          .join("\n");

  const repoLines =
    topRepos.length === 0
      ? "_No repos active_"
      : topRepos
          .map(
            (r, i) =>
              `${i + 1}. *${r.fullName}* — ${r.count.toLocaleString()} commit${r.count !== 1 ? "s" : ""}  \`${bar(r.count, maxRepo)}\``,
          )
          .join("\n");

  const message: SlackMessage = {
    text: `Git Activity Monitor — ${periodLabel}`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `📊 Git Activity Report` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${periodLabel}*` },
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: [
            `*Commits:* ${totals.commits.toLocaleString()}`,
            `*Active Developers:* ${totals.developers.toLocaleString()}`,
            `*Active Repositories:* ${totals.repos.toLocaleString()}`,
          ].join("    ·    "),
        },
      },
      { type: "divider" },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Top Contributors*\n${contribLines}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Top Repositories*\n${repoLines}` },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_Commit counts reflect activity, not productivity. Merges and bot commits excluded._`,
          },
        ],
      },
    ],
  };

  await sendSlackMessage(message);
}
