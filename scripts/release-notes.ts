/**
 * Release workflow helper: prints GitHub Release notes for version $1 by
 * grouping conventional-commit subjects since the previous vX.Y.Z tag.
 */
import { execSync } from "node:child_process";

// Gracefully exit when the consumer closes the pipe early (e.g. `| head`).
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }
  throw error;
});

const current = process.argv[2];
if (current === undefined) {
  console.error("usage: release-notes.ts <version>");
  process.exit(1);
}

const tags = execSync("git tag --list 'v*' --sort=-v:refname", {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const previous = tags.find((tag) => tag !== `v${current}`);
const range = previous === undefined ? "HEAD" : `${previous}..HEAD`;

const subjects = execSync(
  `git log ${range} --pretty=format:%s --no-merges`,
  { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
)
  .trim()
  .split("\n")
  .filter(Boolean);

const groups = new Map<string, string[]>();
const HEADING: Record<string, string> = {
  feat: "Features",
  fix: "Bug Fixes",
  perf: "Performance",
};
for (const subject of subjects) {
  const match = /^(\w+)(?:\(([^)]+)\))?!?:\s*(.+)$/.exec(subject);
  if (match === null) {
    continue; // non-conventional commits are not changelog material
  }
  const [, type, scope, title] = match;
  if (type === "chore" && scope === "release") {
    continue; // the release commit itself
  }
  const heading = HEADING[type] ?? "Other";
  const lines = groups.get(heading) ?? [];
  lines.push(`- ${scope === undefined ? "" : `**${scope}**: `}${title}`);
  groups.set(heading, lines);
}

if (groups.size === 0) {
  process.stdout.write(`Release \`v${current}\`.\n`);
} else {
  for (const [heading, lines] of groups) {
    process.stdout.write(`### ${heading}\n${lines.join("\n")}\n\n`);
  }
}
