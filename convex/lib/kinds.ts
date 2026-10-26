import type { CeremonyKind } from "./vocab";

// A best guess at a ceremony's kind from its name alone: for ones a host added
// themselves, and ones made before ceremonies carried a kind. Checked in order, so the
// more particular words win ("Ceremony & Reception (Chuppah)" is a chuppah).

const CLUES: [CeremonyKind, string[]][] = [
  ["chuppah", ["chuppah", "huppah", "chupa"]],
  ["gurdwara", ["anand karaj", "gurdwara", "gurudwara", "laavan", "lavan"]],
  ["nikah", ["nikah", "nikkah", "akad", "katb", "aqd"]],
  ["haldi", ["haldi", "pithi", "ubtan", "mayun", "maiyan", "turmeric", "holud", "tel baan"]],
  ["mehndi", ["mehndi", "mehendi", "henna", "kina", "hina"]],
  ["sangeet", ["sangeet", "sangit", "garba", "dandiya", "dholki", "raas"]],
  ["tea", ["tea ceremony", "tea", "pyebaek", "paebaek"]],
  ["signing", ["signing", "registry", "registration", "civil", "court", "ketubah", "contract", "zags"]],
  ["fire", ["phere", "pheras", "lagna", "mandap", "saptapadi", "vivah", "kanyadaan", "muhurtham", "muhurat", "havan"]],
  ["procession", ["baraat", "barat", "jaan", "procession", "zaffa", "zaffe", "janavasam", "varghodo", "vidaai", "vidai", "doli"]],
  ["engagement", ["engagement", "roka", "sagai", "ring", "misri", "nichayathartham", "nischitartham", "gol dhana", "tilak", "betrothal", "introduction", "knocking"]],
  ["temple", ["temple", "shrine", "pagoda", "shinto", "poruwa"]],
  ["puja", ["puja", "pooja", "ganesh", "griha pravesh", "satyanarayan", "prayer", "blessing"]],
  ["reception", ["reception", "walima", "valima", "banquet", "owambe", "after party", "afters"]],
  ["dinner", ["dinner", "rehearsal", "brunch", "lunch", "breakfast", "welcome", "shower", "bachelor", "bachelorette", "hen", "stag", "sheva brachot", "shabbat", "party"]],
  ["church", ["church", "chapel", "mass", "nuptial", "vows", "crowning", "stefana", "ceremony", "wedding"]],
];

const plain = (s: string) => ` ${s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

export function guessKind(name: string): CeremonyKind | undefined {
  const text = plain(name);
  for (const [kind, words] of CLUES) if (words.some((w) => text.includes(` ${w} `))) return kind;
  return undefined;
}
