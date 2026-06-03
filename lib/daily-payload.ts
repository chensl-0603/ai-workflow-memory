import { getDailyActions } from "./daily-actions.ts";
import { getDailyReview } from "./review.ts";
import type { DailyPayload } from "./types.ts";

export async function getDailyPayload(options: {
  dbPath: string;
  obsidianVault: string;
  date: string;
}): Promise<DailyPayload> {
  const [review, actions] = await Promise.all([
    getDailyReview(options.dbPath, options.date),
    getDailyActions(options)
  ]);

  return {
    ...review,
    actions
  };
}
