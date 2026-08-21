import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import json from "@shikijs/langs/json";
import githubDark from "@shikijs/themes/github-dark";
import githubLight from "@shikijs/themes/github-light";

const JSON_PREFIX = /^[{[]/;

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    langs: [json],
    themes: [githubLight, githubDark],
  });
  return highlighterPromise;
}

function tryParseJson(message: string): string | null {
  const trimmed = message.trim();
  if (trimmed.length === 0 || !JSON_PREFIX.test(trimmed)) {
    return null;
  }
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return null;
  }
}

export async function highlightLogMessage(message: string): Promise<string | null> {
  const jsonText = tryParseJson(message);
  if (jsonText === null) {
    return null;
  }
  const highlighter = await getHighlighter();
  return highlighter.codeToHtml(jsonText, {
    lang: "json",
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  });
}
