import { execFileSync } from 'node:child_process';
import path from 'node:path';

// The script is a standalone CLI (.mjs) invoked by CI and appends `key=value`
// lines to $GITHUB_OUTPUT, so run it as a subprocess and parse the same output.

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'release-metadata.mjs');

function metadata(...args: string[]): Record<string, string> {
  const output = execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return Object.fromEntries(
    output
      .trim()
      .split('\n')
      .map((line) => {
        const separator = line.indexOf('=');
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

function failure(...args: string[]): string {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr = (error as { stderr?: Buffer | string }).stderr;
    return String(stderr ?? '');
  }
  throw new Error('expected release-metadata to reject the arguments');
}

describe('release-metadata', () => {
  test('production uses a plain tag and a versioned APK name', () => {
    expect(metadata('production', '1.7.4')).toEqual({
      version: '1.7.4',
      tag: 'v1.7.4',
      'apk-name': 'Privatecycle-1.7.4.apk',
    });
  });

  test('nightly adds nightly and the commit SHA to the APK name', () => {
    expect(metadata('nightly', '1.7.3', '261101', 'a1b2c3d')).toEqual({
      version: '1.7.3',
      tag: 'v1.7.3-nightly-261101-a1b2c3d',
      'apk-name': 'Privatecycle-1.7.3-nightly-a1b2c3d.apk',
    });
  });

  test.each([
    ['production', '1.7'],
    ['production', 'v1.7.3'],
    ['nightly', '1.7.3', '2611', 'a1b2c3d'],
    ['nightly', '1.7.3', '261101', 'not-a-sha'],
    ['beta', '1.7.3'],
  ])('rejects %s %s', (...args) => {
    expect(failure(...args)).toContain('[release-metadata]');
  });
});
