import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// The script is a standalone CLI (.mjs) invoked by CI, so these tests run it
// as a subprocess against throwaway repositories — the git plumbing (tags,
// describe, log) is part of the contract, not just the bump math.

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'release-version.mjs');
const tempDirs: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatecycle-release-'));
  tempDirs.push(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'release-test@example.com');
  git(dir, 'config', 'user.name', 'Release Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'config', 'tag.gpgsign', 'false');
  return dir;
}

let changeCounter = 0;
function commit(dir: string, message: string, file = 'changes.txt'): void {
  changeCounter += 1;
  fs.writeFileSync(path.join(dir, file), `change ${changeCounter}\n`);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

function tag(dir: string, name: string): void {
  git(dir, 'tag', name);
}

/** A repo with one commit tagged v1.0.0, so every later commit is a release window. */
function taggedBaseline(dir: string): void {
  commit(dir, 'chore: initial');
  tag(dir, 'v1.0.0');
}

function nextVersion(dir: string): string {
  return execFileSync(process.execPath, [SCRIPT], {
    cwd: dir,
    encoding: 'utf8',
    // The script prints diagnostics to stderr; keep them out of Jest output
    // (they are still in error.stderr if the call fails).
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('release-version', () => {
  describe('conventional-commit bump rules', () => {
    test.each([
      ['fix: crash when saving'],
      ['ci: tweak the workflow'],
      ['docs: update the readme'],
      ['chore(deps): bump lodash'],
      ['Update the readme'],
    ])('"%s" bumps patch', (message) => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, message);
      expect(nextVersion(dir)).toBe('1.0.1');
    });

    test('feat bumps minor', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'feat(core): add cycle forecasts');
      expect(nextVersion(dir)).toBe('1.1.0');
    });

    test('the strongest bump in the window wins', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'fix: crash when saving');
      commit(dir, 'docs: update the readme');
      commit(dir, 'feat: add insights');
      expect(nextVersion(dir)).toBe('1.1.0');
    });

    test('a ! in the header bumps major', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'feat(core)!: drop the legacy schema');
      expect(nextVersion(dir)).toBe('2.0.0');
    });

    test('a BREAKING CHANGE footer bumps major', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'fix: change the export shape\n\nBREAKING CHANGE: backup JSON rewritten');
      expect(nextVersion(dir)).toBe('2.0.0');
    });

    test('merge commit subjects are ignored', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      git(dir, 'checkout', '-q', '-b', 'side');
      commit(dir, 'fix: side fix', 'side.txt');
      git(dir, 'checkout', '-q', 'main');
      commit(dir, 'fix: main fix', 'main.txt');
      // A breaking-looking merge subject must not leak into the bump.
      git(dir, 'merge', '-q', '--no-ff', '-m', 'feat!: merge everything', 'side');
      expect(nextVersion(dir)).toBe('1.0.1');
    });
  });

  describe('tag and state handling', () => {
    test('reuses the version when HEAD is already released', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'feat: add insights');
      tag(dir, 'v1.1.0');
      expect(nextVersion(dir)).toBe('1.1.0');
    });

    test('bumps past a version already tagged on another commit', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      git(dir, 'checkout', '-q', '-b', 'side');
      commit(dir, 'fix: side fix');
      tag(dir, 'v1.0.1');
      git(dir, 'checkout', '-q', 'main');
      commit(dir, 'fix: main fix');
      // Candidate v1.0.1 is taken by the side branch; go to v1.0.2.
      expect(nextVersion(dir)).toBe('1.0.2');
    });

    test('ignores nightly prerelease tags when finding the base version', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'feat: add insights');
      tag(dir, 'v1.1.0-nightly-261101-a1b2c3d');
      expect(nextVersion(dir)).toBe('1.1.0');
    });

    test('does not reuse a nightly tag at HEAD', () => {
      const dir = makeRepo();
      taggedBaseline(dir);
      commit(dir, 'feat: add insights');
      tag(dir, 'v1.1.0-nightly-261101-a1b2c3d');
      commit(dir, 'fix: crash when saving');
      expect(nextVersion(dir)).toBe('1.1.0');
    });

    test('falls back to app.json when no release tags exist', () => {
      const dir = makeRepo();
      fs.writeFileSync(
        path.join(dir, 'app.json'),
        JSON.stringify({ expo: { version: '2.0.0' } })
      );
      commit(dir, 'chore: initial');
      commit(dir, 'feat: add insights');
      expect(nextVersion(dir)).toBe('2.1.0');
    });
  });
});
