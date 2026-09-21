import { TikTokCollector } from '../src/collectors/tiktok/tiktok.collector.js';
import { loadEnv } from '../src/config/env.js';

function parseArg(name: string, fallback: string): string {
  const flag = `--${name}`;
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const config = loadEnv(process.env);
  const keyword = parseArg('keyword', 'UTCC');
  const target = Number(parseArg('target', String(config.defaults.targetPostsPerQuery)));

  const collector = new TikTokCollector();
  const startedAt = Date.now();

  const result = await collector.collect({
    query: keyword,
    targetPosts: target,
    maxScrolls: config.defaults.maxScrollsPerQuery,
    maxCollectionTimeSeconds: config.collector.timeoutSeconds,
    maxConsecutiveEmptyScrolls: config.defaults.maxEmptyScrolls,
  });

  const durationSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`Keyword: ${keyword}`);
  console.log(`Target posts: ${target}`);
  console.log(`Posts collected: ${result.returnedCount}`);
  console.log(`Target reached: ${result.targetReached ? 'yes' : 'no'}`);
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Duration: ${durationSeconds}s`);
}

main().catch((error) => {
  console.error('Collector test failed:', error);
  process.exitCode = 1;
});
