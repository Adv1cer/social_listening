import { TikTokCollector } from '../src/collectors/tiktok/tiktok.collector.js';
import { loadEnv } from '../src/config/env.js';
import { CollectorBlockedError } from '../src/utils/errors.js';

function parseArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const config = loadEnv(process.env);
  const keyword = parseArg('keyword', 'UTCC');
  const target = Number(parseArg('target', String(config.defaults.targetPostsPerQuery)));
  const headed = hasFlag('headed');
  const saveDebug = hasFlag('save-debug');
  const channel = process.argv.includes('--channel') ? parseArg('channel', '') || undefined : undefined;

  const collector = new TikTokCollector({ headless: !headed, saveDebug, channel });
  const startedAt = Date.now();

  console.log(`Keyword: ${keyword}`);
  console.log(`Target posts: ${target}`);
  console.log(`Browser mode: ${headed ? 'headed' : 'headless'}${channel ? ` (channel: ${channel})` : ''}`);

  try {
    const result = await collector.collect({
      query: keyword,
      targetPosts: target,
      maxScrolls: config.defaults.maxScrollsPerQuery,
      maxCollectionTimeSeconds: config.collector.timeoutSeconds,
      maxConsecutiveEmptyScrolls: config.defaults.maxEmptyScrolls,
    });

    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

    console.log(`Posts collected: ${result.returnedCount}`);
    console.log(`Target reached: ${result.targetReached ? 'yes' : 'no'}`);
    console.log(`Stop reason: ${result.stopReason}`);
    console.log(`Duration: ${durationSeconds}s`);
    if (saveDebug) {
      console.log('Debug artifacts (if any block/empty state occurred): ./debug/');
    }
  } catch (error) {
    const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (error instanceof CollectorBlockedError) {
      console.log(`Stop reason: blocked (${error.reason})`);
      console.log(`Duration: ${durationSeconds}s`);
      if (saveDebug) {
        console.log('Debug artifacts saved under ./debug/ — see filenames printed above.');
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('Collector test failed:', error);
  process.exitCode = 1;
});
