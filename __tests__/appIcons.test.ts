import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');

function appConfig(variant: string) {
  return JSON.parse(execFileSync(process.execPath, ['-e',
    'console.log(JSON.stringify(require("./app.config.js")({config:require("./app.json").expo})))',
  ], {
    cwd: root,
    env: { ...process.env, APP_VARIANT: variant, APP_VERSION: '', ANDROID_VERSION_CODE: '' },
    encoding: 'utf8',
  }));
}

describe('launcher artwork', () => {
  test.each([['', 'production'], ['nightly', 'nightly']])('%s build uses the selected Tidemark artwork in every launcher path', (variant, artwork) => {
    const config = appConfig(variant);
    const folder = './assets/images/tidemark/';
    expect(config.icon).toBe(`${folder}${artwork}-icon.png`);
    expect(config.android.adaptiveIcon.foregroundImage).toBe(`${folder}${artwork}-adaptive-foreground.png`);
    expect(config.android.adaptiveIcon.backgroundImage).toBe(`${folder}${artwork}-adaptive-background.png`);
    expect(config.android.adaptiveIcon.monochromeImage).toBe(`${folder}${artwork}-monochrome.png`);
    expect(config.web.favicon).toBe(`${folder}${artwork}-favicon.png`);
    // Platform-level icon overrides take precedence over config.icon. Guard
    // against accidentally leaving an old sprig override on either platform.
    expect(config.android.icon).toBeUndefined();
    expect(config.ios.icon).toBeUndefined();
    for (const relative of [config.icon, ...Object.values(config.android.adaptiveIcon).filter(value => typeof value === 'string' && value.endsWith('.png')), config.web.favicon] as string[]) {
      const png = fs.readFileSync(path.resolve(root, relative));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const expectedSize = relative.endsWith('-favicon.png') ? 64 : 1024;
      expect(png.readUInt32BE(16)).toBe(expectedSize);
      expect(png.readUInt32BE(20)).toBe(expectedSize);
    }
  });

  test('production and nightly keep their separate install identities and different icon files', () => {
    const production = appConfig('');
    const nightly = appConfig('nightly');
    expect(production.android.package).toBe('com.ncan.privatecycle');
    expect(nightly.android.package).toBe('com.ncan.privatecycle.nightly');
    expect(production.ios.bundleIdentifier).toBe('com.ncan.privatecycle');
    expect(nightly.ios.bundleIdentifier).toBe('com.ncan.privatecycle.nightly');
    expect(fs.readFileSync(path.resolve(root, production.icon)).equals(fs.readFileSync(path.resolve(root, nightly.icon)))).toBe(false);
  });

  test('dev keeps its existing blue launcher without inheriting the production background', () => {
    const config = appConfig('dev');
    expect(config.android.package).toBe('com.ncan.privatecycle.dev');
    expect(config.icon).toBe('./assets/images/icon.png');
    expect(config.android.adaptiveIcon.foregroundImage).toBe('./assets/images/adaptive-icon.png');
    expect(config.android.adaptiveIcon.backgroundColor).toBe('#4f7cff');
    expect(config.android.adaptiveIcon.backgroundImage).toBeUndefined();
    expect(config.android.adaptiveIcon.monochromeImage).toBeUndefined();
  });
});
