import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/config/env.js';
import { collectFromProfiles, collectDirectUrls } from '../src/services/profile-collection.service.js';

// Manual, opt-in diagnostic (not run by CI) for the profile-discovery /
// direct-video-URL collection path added alongside the keyword collector.
// Mirrors test-tiktok-collector.ts's role for the original search path.
function parseArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const config = loadEnv(process.env);
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const username = parseArg('username', 'eventutcc');
  const directUrl = parseArg(
    'video-url',
    'https://www.tiktok.com/@eventutcc/video/7685345255792692501',
  );
  const target = Number(parseArg('target', '5'));
  const yearArg = parseArg('year', '');
  const year = yearArg ? Number(yearArg) : undefined;
  const maxScrolls = Number(parseArg('max-scrolls', year != null ? '200' : '10'));

  try {
    console.log('--- Direct URL enrichment ---');
    const directResults = await collectDirectUrls(prisma, { urls: [directUrl] }, { headless: true, profileDir: config.tiktok.browserProfileDir });
    console.log(JSON.stringify(directResults, null, 2));

    console.log('--- Profile discovery + enrichment ---');
    const profileResults = await collectFromProfiles(
      prisma,
      { usernames: [username], targetPostsPerProfile: target, maxScrollsPerProfile: maxScrolls, year },
      [],
      { headless: true, profileDir: config.tiktok.browserProfileDir },
    );
    console.log(JSON.stringify(profileResults, null, 2));

    const totalPosts = await prisma.socialPost.count();
    const samplePost = await prisma.socialPost.findFirst({
      where: { platform: 'tiktok', authorId: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
      include: { author: true, metrics: { orderBy: { capturedAt: 'desc' }, take: 1 } },
    });

    console.log('--- DB state ---');
    console.log('total socialPost rows:', totalPosts);
    console.log(
      'most recently seen post rawMetadata keys:',
      samplePost ? Object.keys((samplePost.rawMetadata as object) ?? {}) : null,
    );
    console.log('most recently seen post metrics:', samplePost?.metrics);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Profile collector test failed:', error);
  process.exitCode = 1;
});
