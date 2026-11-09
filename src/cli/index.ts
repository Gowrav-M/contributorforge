#!/usr/bin/env node
import { createProgram } from './program.js';

try {
  await createProgram().parseAsync(process.argv);
} catch (error: unknown) {
  console.error(`ContributorForge: ${error instanceof Error ? error.message : 'Unknown error'}`);
  process.exitCode = 4;
}
