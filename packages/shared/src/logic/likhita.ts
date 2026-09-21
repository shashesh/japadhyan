/** Normalise text for comparing a typed entry with the mantra. */
export function normaliseForMatch(text: string): string {
  return text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Likhita japa (typing): count how many complete repetitions of the mantra
 * the entry contains. Entries separated by newlines or repeated inline both count.
 */
export function countTypedRepetitions(entry: string, mantraText: string): number {
  const target = normaliseForMatch(mantraText);
  if (target.length === 0) return 0;
  const text = normaliseForMatch(entry);
  let count = 0;
  let from = 0;
  for (;;) {
    const found = text.indexOf(target, from);
    if (found === -1) return count;
    count += 1;
    from = found + target.length;
  }
}
