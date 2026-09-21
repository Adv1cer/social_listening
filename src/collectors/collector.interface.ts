import type { CollectorInput, CollectorResult } from './collector.types.js';

export interface SocialCollector {
  collect(input: CollectorInput): Promise<CollectorResult>;
}
