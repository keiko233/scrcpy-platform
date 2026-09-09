import { z } from "zod";

/** Locales supported by the renderer and persisted as an application preference. */
export const AppLocaleSchema = z.enum(["en", "zh-cn"]);

export type AppLocale = z.infer<typeof AppLocaleSchema>;
