/** Best effort only: arbitrary application secrets cannot be recognized reliably. */
export function redact(text: string): string {
  return text
    .replace(/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z ]+ )?PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,})\b/g, '[REDACTED TOKEN]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/(authorization\s*[:=]\s*(?:bearer|basic)\s+)[^\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password|passwd)\s*[=:]\s*["']?)[^\s"'<>;,]+/gi, '$1[REDACTED]');
}
