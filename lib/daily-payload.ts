import { getActionInbox } from "./action-inbox.ts";
import { getDailyActions } from "./daily-actions.ts";
import { buildDailyFocus } from "./daily-focus.ts";
import { getDailyReview } from "./review.ts";
import type { DailyPayload } from "./types.ts";

export async function getDailyPayload(options: {
  dbPath: string;
  obsidianVault: string;
  date: string;
}): Promise<DailyPayload> {
  const [review, actions, inbox] = await Promise.all([
    getDailyReview(options.dbPath, options.date),
    getDailyActions(options),
    getActionInbox({
      dbPath: options.dbPath,
      obsidianVault: options.obsidianVault,
      today: options.date
    })
  ]);

  return {
    ...review,
    actions,
    focus: buildDailyFocus({ review, actions, inbox })
  };
}
