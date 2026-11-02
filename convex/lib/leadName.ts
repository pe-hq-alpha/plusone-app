/**
 * A business found on the web is often named after its page's title, which carries a tagline:
 * "Chetan's Caterings: Best Catering Services in Tamil Nadu", "Home | Annam Caterers". Shown to
 * customers, it reads as scraped. This keeps the part that names the business: the title is cut
 * at its separators, and the piece that reads least like a tagline is kept (the first, on a tie).
 * A name with no separator is left as it is.
 */

/** ":" followed by a space, or a dash, bar or dot set off by spaces. "Chettinad-Caterers" stays whole. */
const SEPARATOR = /\s*:\s+|\s+[-–—|·]\s+/;

/** Words a tagline uses and a business name rarely does. */
const TAGLINE_WORDS = [
  /\bbest\b/i,
  /\btop\b/i,
  /\bno\.?\s?1\b/i,
  /\bservices?\b/i,
  /\bofficial\b/i,
  /\b(web)?site\b/i,
  /\bhome( ?page)?\b/i,
  /\bwelcome\b/i,
  /\bcontact( us)?\b/i,
  /\babout( us)?\b/i,
  /\bfree\b/i,
  /\bdaily\b/i,
  /\bonline\b/i,
  /\bbook(ing)?s?\b/i,
  /\baffordable\b/i,
  /\bleading\b/i,
  /\bfamous\b/i,
  /\bprofessional\b/i,
  /\bhoroscopes?\b/i,
  /\bpanchang\b/i,
  /\bastrology\b/i,
  /\bnear me\b/i,
];

/** "in Chennai", "near Adyar", "at T. Nagar": a place after a preposition is a tagline's, not a name's. */
const IN_A_PLACE = /\b(?:[Ii]n|[Nn]ear|[Aa]t) [A-Z]/;

function taglineScore(piece: string): number {
  let score = TAGLINE_WORDS.reduce((n, re) => n + (re.test(piece) ? 1 : 0), 0);
  if (IN_A_PLACE.test(piece)) score += 1;
  return score;
}

export function leadDisplayName(raw: string): string {
  const name = raw.replace(/\s+/g, " ").trim();
  const pieces = name
    .split(SEPARATOR)
    .map((p) => p.trim().replace(/[.,;]+$/, ""))
    .filter((p) => p.length >= 2);
  if (pieces.length < 2) return name;
  let best = pieces[0];
  let bestScore = taglineScore(best);
  for (const p of pieces.slice(1)) {
    const s = taglineScore(p);
    if (s < bestScore) {
      best = p;
      bestScore = s;
    }
  }
  return best;
}
