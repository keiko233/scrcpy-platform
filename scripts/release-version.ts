/**
 * Release workflow helper: reads the latest vX.Y.Z tag, applies the requested
 * semver bump, writes the new version into package.json and prints it.
 * With no tags yet the baseline is 0.0.0 (first minor bump -> 0.1.0).
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const bump = process.argv[2];
if (bump !== "major" && bump !== "minor" && bump !== "patch") {
  console.error(`usage: release-version.ts <major|minor|patch> (got ${bump})`);
  process.exit(1);
}

const tags = execSync("git tag --list 'v*' --sort=-v:refname", {
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const latest = (tags[0] ?? "v0.0.0").replace(/^v/, "");
const [major, minor, patch] = latest.split(".").map(Number);

const next =
  bump === "major"
    ? `${major + 1}.0.0`
    : bump === "minor"
      ? `${major}.${minor + 1}.0`
      : `${major}.${minor}.${patch + 1}`;

const pkgPath = new URL("../package.json", import.meta.url);
const pkg: { version: string } = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

process.stdout.write(next);
