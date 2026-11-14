// Tiny text utilities shared by scoring and testimony settlement (pure).
import { normaliseForMatch } from "./quotes";

const STOP = new Set(
  "about above after again also because before being below between both could does doing down during each from further have having here into itself just more most only other over same should some such than that their them then there these they this those through under until very were what when where which while will with would your yours ours final going testing week today".split(
    " ",
  ),
);

/** Content words (>= 4 chars, no stopwords) plus numbers (dates, amounts), normalised. */
export function tokens(s: string): Set<string> {
  return new Set(
    normaliseForMatch(s)
      .split(/[^a-z0-9]+/)
      .filter((w) => (w.length >= 4 && !STOP.has(w)) || /^\d+$/.test(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
