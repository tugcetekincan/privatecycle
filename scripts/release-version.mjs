#!/usr/bin/env node
// Derives the release version for the checked-out commit with
// conventional-commit bumps over the commits since the previous release tag:
//
//   feat: …                -> minor      v1.1.0 -> v1.2.0
//   feat!: … / fix(…)!: …  -> major      v1.1.0 -> v2.0.0
//   everything else        -> patch      v1.1.0 -> v1.1.1
//   (fix:, ci:, docs:, chore:, non-conventional, …)
//
// A `BREAKING CHANGE:` / `BREAKING-CHANGE:` footer also bumps major; merge
// commits are ignored. Every non-empty window advances at least a patch, so
// each new production release advances the version. The mapping is
// deterministic: a rerun of an already-released commit reuses its tag. If the
// computed tag already exists on a different commit (a stale rerun after a
// newer release), the patch is bumped past it so no tag is ever hijacked.
//
// Prints the plain version (no `v`) to stdout; diagnostics go to stderr.
// Used by the manual publish.yml workflow through build-android.yml, which
// stamps it into the production APK's versionName (APP_VERSION via
// app.config.js) and tags the release with it.
//
// Nightly prereleases (`vX.Y.Z-nightly-YYMMDD-<sha>`) are deliberately
// ignored: they describe the same commits as the latest production release and
// must never become the base for the next version. Only stable `vX.Y.Z` tags
// participate in the bump window.
//
// Run locally to preview the next manual production release:
//   node scripts/release-version.mjs

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const BUMP_RANK = { patch: 0, minor: 1, major: 2 };

function runGit(args, { optional = false } = {}) {
  try {
    // Capture stderr: `git describe` failing for an untagged repo is
    // expected, and hard failures re-surface it below.
    return execFileSync('git', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (optional) {
      return null;
    }
    if (error.stderr) {
      process.stderr.write(error.stderr);
    }
    throw error;
  }
}

function log(message) {
  console.error(`[release-version] ${message}`);
}

function classifyCommit(message) {
  const header = message.split('\n', 1)[0];
  const conventional = header.match(/^([a-z]+)(?:\([^)]*\))?(!)?:/i);
  if (conventional?.[2] || /^BREAKING[ -]CHANGE:/m.test(message)) {
    return 'major';
  }
  if (conventional && conventional[1].toLowerCase() === 'feat') {
    return 'minor';
  }
  return 'patch';
}

function combineBumps(levels) {
  return levels.reduce(
    (strongest, level) => (BUMP_RANK[level] > BUMP_RANK[strongest] ? level : strongest),
    'patch'
  );
}

function bumpVersion(version, bump) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(`Not an X.Y.Z version: ${version}`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// Fallback base when the repository has no `v*` tags yet: whatever app.json
// declares locally, else 0.0.0.
function baseVersionFromAppJson() {
  try {
    const config = JSON.parse(fs.readFileSync('app.json', 'utf8'));
    const version = config?.expo?.version;
    if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) {
      return version;
    }
  } catch {
    // No readable app.json: start from 0.0.0.
  }
  return '0.0.0';
}

// `--exclude` drops nightly prerelease tags; only production tags count.
const STABLE_TAG_ARGS = [
  '--tags',
  '--match',
  'v*',
  '--exclude',
  '*-nightly-*',
  '--abbrev=0',
];

const head = runGit(['rev-parse', 'HEAD']);
const previousTag = runGit(['describe', ...STABLE_TAG_ARGS, 'HEAD'], { optional: true });

let version;
if (previousTag && runGit(['rev-parse', `${previousTag}^{commit}`]) === head) {
  version = previousTag.slice(1);
  log(`${previousTag} is already at HEAD (${head.slice(0, 7)}) — reusing v${version}`);
} else {
  const base = previousTag ? previousTag.slice(1) : baseVersionFromAppJson();
  const range = previousTag ? `${previousTag}..HEAD` : 'HEAD';
  const raw = runGit(['log', '--no-merges', '--format=%B%x00', range], { optional: true });
  const messages = (raw ?? '')
    .split('\u0000')
    .map((message) => message.trim())
    .filter(Boolean);
  const bump = combineBumps(messages.map(classifyCommit));
  version = bumpVersion(base, bump);
  log(`${range} → ${messages.length} commit(s), bump=${bump} → v${version}`);
}

// Never reuse a version that another commit already owns.
for (;;) {
  const existing = runGit(
    ['rev-parse', '-q', '--verify', `refs/tags/v${version}^{commit}`],
    { optional: true }
  );
  if (!existing || existing === head) {
    break;
  }
  const next = bumpVersion(version, 'patch');
  log(`v${version} already exists at ${existing.slice(0, 7)} — trying v${next}`);
  version = next;
}

console.log(version);
