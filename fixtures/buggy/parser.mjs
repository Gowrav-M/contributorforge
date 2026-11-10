// Deliberate fixture bug: split preserves a trailing empty item.
export function parseList(input) { return input.split(',').map((item) => item.trim()); }
