import { describe, expect, it } from "vitest";
import { z } from "zod";
import { withinLimits } from "./models";

const schema = z.object({
  ceremonies: z.array(z.object({ id: z.string(), tasks: z.array(z.string()).max(3) })),
  score: z.number().min(0).max(100),
  subject: z.string().max(10),
  queries: z.array(z.string()).min(1),
});

const fix = (data: unknown) => {
  const first = schema.safeParse(data);
  return first.success ? first : schema.safeParse(withinLimits(data, first.error.issues as never));
};

describe("bringing a model's answer within a schema's limits", () => {
  it("keeps the first three tasks when there are four, clamps a score and trims a subject", () => {
    const result = fix({
      ceremonies: [{ id: "a", tasks: ["1", "2", "3", "4"] }, { id: "b", tasks: ["x"] }],
      score: 120,
      subject: "Our wedding photography",
      queries: ["dj"],
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      ceremonies: [{ id: "a", tasks: ["1", "2", "3"] }, { id: "b", tasks: ["x"] }],
      score: 100,
      subject: "Our weddin",
      queries: ["dj"],
    });
  });

  it("still refuses an answer that is wrong rather than just long", () => {
    expect(fix({ ceremonies: [], score: 50, subject: "Hi", queries: [] }).success).toBe(false);
    expect(fix({ ceremonies: "none", score: 50, subject: "Hi", queries: ["x"] }).success).toBe(false);
  });
});
