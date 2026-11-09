import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { CONFIG_TEMPLATE } from '../config/config.js';

export async function initializeConfig(path: string): Promise<void> {
  try {
    await writeFile(path, CONFIG_TEMPLATE, { flag: 'wx' });
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') {
      throw new Error(`Configuration already exists at ${path}; refusing to overwrite it.`);
    }
    throw error;
  }
}

export function createProgram(): Command {
  const program = new Command();
  program.name('contributorforge').description('Turn a GitHub issue into a verified contributor task bundle.').version('0.1.0');
  program.command('init').description('Create a documented, unapproved configuration template')
    .option('-c, --config <path>', 'Configuration path', '.contributorforge.yml')
    .action(async (options: { config: string }) => {
      const path = resolve(options.config);
      await initializeConfig(path);
      console.log(`Created ${path}. Review commands, bind the issue, then set approved: true.`);
    });
  for (const name of ['verify', 'start']) {
    program.command(`${name} <issue-url>`)
      .description(name === 'verify' ? 'Verify an issue inside Docker and generate evidence' : 'Prepare a contributor workspace without running repository commands')
      .option('-c, --config <path>', 'Maintainer-approved configuration', '.contributorforge.yml')
      .action(() => { throw new Error(`${name} is not yet implemented in this milestone.`); });
  }
  return program;
}
