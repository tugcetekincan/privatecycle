#!/usr/bin/env node
// Computes the release tag and APK filename for a CI build. Called from
// `.github/workflows/build-android.yml`, which appends the output to
// `$GITHUB_OUTPUT`.
//
//   node scripts/release-metadata.mjs production 1.7.4
//     version=1.7.4
//     tag=v1.7.4
//     apk-name=Privatecycle-1.7.4.apk
//
//   node scripts/release-metadata.mjs nightly 1.7.3 261101 a1b2c3d
//     version=1.7.3
//     tag=v1.7.3-nightly-261101-a1b2c3d
//     apk-name=Privatecycle-1.7.3-nightly-a1b2c3d.apk
//
// Nightlies reuse the latest production version and append `nightly-<sha>`,
// so every push keeps its own downloadable prerelease instead of overwriting
// the same day's build. The tag additionally carries the UTC build date.
// Production tags never carry a suffix, and the version itself stays plain
// `X.Y.Z` because app.config.js stamps it as Android's versionName.

const USAGE =
  'usage: release-metadata.mjs production <X.Y.Z> | nightly <X.Y.Z> <YYMMDD> <sha>';

function fail(message) {
  console.error(`[release-metadata] ${message}\n${USAGE}`);
  process.exit(1);
}

const [variant, version, date, sha] = process.argv.slice(2);

if (variant !== 'production' && variant !== 'nightly') {
  fail(`unknown variant: ${variant ?? '(missing)'}`);
}
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  fail(`invalid version: ${version ?? '(missing)'} (expected X.Y.Z)`);
}

let tag = `v${version}`;
let apkName = `Privatecycle-${version}.apk`;

if (variant === 'nightly') {
  if (!/^\d{6}$/.test(date ?? '')) {
    fail(`invalid UTC build date: ${date ?? '(missing)'} (expected YYMMDD)`);
  }
  if (!/^[0-9a-f]{7,40}$/.test(sha ?? '')) {
    fail(`invalid commit SHA: ${sha ?? '(missing)'}`);
  }
  tag = `v${version}-nightly-${date}-${sha}`;
  apkName = `Privatecycle-${version}-nightly-${sha}.apk`;
}

console.log(`version=${version}`);
console.log(`tag=${tag}`);
console.log(`apk-name=${apkName}`);
