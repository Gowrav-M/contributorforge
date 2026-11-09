export interface Config {
  version: 1;
  repository: string;
  issue: number;
  approved: true;
  setup?: string;
  reproduction: string;
  expectedFailure?: string;
  image: string;
  setupNetwork: boolean;
  reproductionNetwork: boolean;
  timeoutSeconds: number;
  memoryMb: number;
  cpus: number;
  acceptanceCriteria: string[];
  expectedBehavior?: string;
}
