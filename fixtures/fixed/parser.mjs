export function parseList(input) { return input.split(',').map((item) => item.trim()).filter(Boolean); }
