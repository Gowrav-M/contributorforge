import assert from 'node:assert/strict';
import { parseList } from './parser.mjs';

try {
  assert.deepEqual(parseList('alpha,beta,'), ['alpha', 'beta']);
  console.log('PASS: trailing delimiters do not create an empty item');
} catch (error) {
  console.error('ISSUE_1_TRAILING_COMMA: expected two items for alpha,beta,');
  console.error(error.message);
  process.exitCode = 1;
}
