/** What a first message can look like, to tap and send as it is or to borrow from. */
const SAMPLES = [
  "My sister's wedding in Chennai, 12 to 14 February, about 400 guests",
  "Our office Diwali party for 150 in Bengaluru on 7 November",
  "A 40th birthday dinner for 30 in London in March, around £3,000",
];

export function SampleInputs({ onPick, busy }: { onPick: (text: string) => void; busy: boolean }) {
  return (
    <div className="pc-plan">
      <h2 className="pc-plan__title">Not sure how to start?</h2>
      <p className="mt-1 text-sm text-muted">Say it however it comes to you. Tap one of these to see how it goes:</p>
      <ul className="mt-3 grid gap-2">
        {SAMPLES.map((s) => (
          <li key={s}>
            <button type="button" className="pc-sample" disabled={busy} onClick={() => onPick(s)}>
              {s}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-quiet">I'll ask about the rest, like the events of each day, their times and guests.</p>
    </div>
  );
}
