import { env } from "../../env.js";
import { logger } from "../../utils/pino-logger.js";

type SlackBlock =
  | { type: "header"; text: { type: "plain_text"; text: string } }
  | { type: "section"; text: { type: "mrkdwn"; text: string } }
  | { type: "divider" }
  | { type: "context"; elements: Array<{ type: "mrkdwn"; text: string }> };

export type SlackMessage = {
  text: string;
  blocks: SlackBlock[];
};

export async function sendSlackMessage(message: SlackMessage): Promise<void> {
  if (!env.SLACK_WEBHOOK_URL) {
    logger.info({ msg: "SLACK_WEBHOOK_URL not set — skipping Slack notification" });
    return;
  }

  const res = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.error({ status: res.status, body }, "slack webhook failed");
    throw new Error(`Slack webhook returned ${res.status}`);
  }
}
