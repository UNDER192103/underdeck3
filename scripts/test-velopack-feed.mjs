import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
);
const github = packageJson?.underdeck3?.github;
const owner = String(github?.owner || "").trim();
const repo = String(github?.repo || "").trim();

if (!owner || !repo) {
  throw new Error("GitHub owner/repo is missing from package.json.");
}

const feedUrl = `https://github.com/${owner}/${repo}/releases/latest/download`;
const manifestUrl = `${feedUrl}/releases.win.json`;
const manifestResponse = await fetch(manifestUrl, { redirect: "follow" });

console.log(`Manifest: ${manifestUrl}`);
console.log(`Status: ${manifestResponse.status}`);

if (!manifestResponse.ok) {
  throw new Error(`Velopack manifest request failed with HTTP ${manifestResponse.status}.`);
}

const manifest = await manifestResponse.json();
const assets = Array.isArray(manifest?.Assets) ? manifest.Assets : [];

if (assets.length === 0) {
  throw new Error("The Velopack manifest contains no assets.");
}

for (const asset of assets) {
  const fileName = String(asset?.FileName || "");
  if (!fileName) continue;

  const assetResponse = await fetch(`${feedUrl}/${encodeURIComponent(fileName)}`, {
    method: "HEAD",
    redirect: "follow",
  });

  console.log(`${assetResponse.status} ${fileName} (${asset?.Version ?? "unknown"}, ${asset?.Type ?? "unknown"})`);
  if (!assetResponse.ok) {
    throw new Error(`Missing Velopack asset: ${fileName} (HTTP ${assetResponse.status}).`);
  }
}

console.log("Velopack feed is valid.");
