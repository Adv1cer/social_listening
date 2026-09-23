import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/config/env.js';
import { collectCommentsForProfiles } from '../src/services/comment-collection.service.js';

// Manual, opt-in diagnostic (not run by CI): collects comments for videos
// already in the DB for the given profile(s), published within --days.
// Needs a logged-in browser profile at TIKTOK_BROWSER_PROFILE_DIR
// (create one with: npx tsx scripts/test-comment-probe.ts --headless false
//  --profile-dir .browser-profile/tiktok --login-wait 180).
function parseArg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const config = loadEnv(process.env);
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const usernames = parseArg('username', 'tourismutcc').split(',');
  const days = Number(parseArg('days', '60'));
  const headless = parseArg('headless', String(config.collector.headless)) !== 'false';
  try {
    const results = await collectCommentsForProfiles(
      prisma,
      {
        usernames,
        since: new Date(Date.now() - days * 86_400_000),
        maxCommentsPerVideo: Number(parseArg('max', String(config.tiktok.commentMaxPerVideo))),
      },
      config.tiktok.utccProfiles,
      { headless, profileDir: config.tiktok.browserProfileDir },
    );
    if (results.some((r) => r.stopReason === 'no_target_videos')) {
      const rows = await prisma.$queryRaw<{ username: string | null; posts: bigint; with_published: bigint; oldest: Date | null; newest: Date | null }[]>`
        SELECT a.username, COUNT(*) AS posts, COUNT(p."publishedAt") AS with_published,
               MIN(p."publishedAt") AS oldest, MAX(p."publishedAt") AS newest
        FROM "SocialPost" p LEFT JOIN "SocialAuthor" a ON a.id = p."authorId"
        WHERE p.platform = 'tiktok' GROUP BY a.username ORDER BY posts DESC`;
      console.log('--- tiktok posts in DB by author (no target videos found) ---');
      console.table(rows.map((r) => ({ ...r, posts: Number(r.posts), with_published: Number(r.with_published) })));
    }
    for (const r of results) {
      console.log(`\n=== @${r.username} run=${r.runId} status=${r.status} stop=${r.stopReason} new=${r.newCount} updated=${r.updatedCount}`);
      console.table(r.videos.map((v) => ({ url: v.url.split('/video/')[1], collected: v.collected, total: v.reportedTotal, stop: v.stopReason, complete: v.complete })));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Comment collector test failed:', e);
  process.exitCode = 1;
});
