export interface Config {
  version: 1;
  repository: string;
  issue: number;
  pullRequest?: number;
  approved: true;
  setup?: string;
  reproduction: string;
  expectedFailure?: string;
  comparisonCheck?: { mode: 'inline' } | { mode: 'files'; paths: string[] };
  image: string;
  setupNetwork: boolean;
  reproductionNetwork: boolean;
  timeoutSeconds: number;
  memoryMb: number;
  cpus: number;
  acceptanceCriteria: string[];
  expectedBehavior?: string;
}
