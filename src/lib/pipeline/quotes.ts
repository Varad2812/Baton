// Deterministic quote validation: normalise whitespace, case and smart quotes,
// then require an exact substring match inside the cited chunk.

const SMART: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "‛": "'",
  "′": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "‟": '"',
  "″": '"',
  "–": "-",
  "—": "-",
  "…": "...",
};

type Normalised = { text: string; map: number[] };

/** Normalise and keep a map from each normalised char back to the original index. */
function normaliseWithMap(input: string): Normalised {
  let out = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (/\s/.test(ch) || ch === " ") {
      pendingSpace = out.length > 0;
      continue;
    }
    if (pendingSpace) {
      out += " ";
      map.push(i);
      pendingSpace = false;
    }
    const rep = (SMART[ch] ?? ch).toLowerCase();
    for (const r of rep) {
      out += r;
      map.push(i);
    }
  }
  return { text: out, map };
}

export function normaliseForMatch(input: string): string {
  return normaliseWithMap(input).text;
}

/**
 * Find `quote` inside `chunkText` after normalisation.
 * Returns offsets into the ORIGINAL chunk text, or null.
 */
export function findQuote(
  chunkText: string,
  quote: string,
): { start: number; end: number } | null {
  const q = normaliseForMatch(quote);
  if (q.length < 8) return null; // too short to be meaningful evidence
  const hay = normaliseWithMap(chunkText);
  const at = hay.text.indexOf(q);
  if (at < 0) return null;
  const start = hay.map[at];
  const end = hay.map[at + q.length - 1] + 1;
  return { start, end };
}

export function quoteIsValid(chunkText: string, quote: string): boolean {
  return findQuote(chunkText, quote) !== null;
}
