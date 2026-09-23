import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { hasTikTokSession, launchTikTokContext } from '../src/collectors/tiktok/tiktok.browser.js';

// Moves a logged-in TikTok session between machines without a display.
// Chrome's on-disk cookies are OS-encrypted (DPAPI on Windows), so copying the
// profile folder to Linux does not work; Playwright's storageState exports
// the decrypted cookies as JSON instead.
//
//   Windows (logged-in profile):  npx tsx scripts/tiktok-session.ts export --profile-dir .browser-profile/tiktok --file tiktok-session.json
//   Server:                       npx tsx scripts/tiktok-session.ts import --profile-dir /var/lib/.../tiktok --file tiktok-session.json
//
// The JSON file IS the account session. Treat it like a password: never
// commit it, chmod 600, delete it right after import.
function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i !== -1 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`--${name} is required`);
  return v;
}

async function main() {
  const mode = process.argv[2];
  const profileDir = arg('profile-dir');
  const file = arg('file');
  const context = await launchTikTokContext({ headless: true, profileDir });
  try {
    if (mode === 'export') {
      if (!(await hasTikTokSession(context))) throw new Error('No TikTok session in this profile; log in first.');
      const state = await context.storageState();
      const cookies = state.cookies.filter((c) => c.domain.includes('tiktok.com'));
      writeFileSync(file, JSON.stringify({ cookies }, null, 2), { mode: 0o600 });
      console.log(`exported ${cookies.length} tiktok cookies to ${file} (secret: delete after import)`);
    } else if (mode === 'import') {
      if (!existsSync(file)) throw new Error(`${file} not found`);
      const { cookies } = JSON.parse(readFileSync(file, 'utf8'));
      await context.addCookies(cookies);
      const page = await context.newPage();
      await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      console.log('session present after import:', await hasTikTokSession(context));
      try { chmodSync(file, 0o600); } catch { /* windows */ }
      console.log(`now delete ${file}`);
    } else {
      throw new Error('usage: tiktok-session.ts export|import --profile-dir <dir> --file <json>');
    }
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
