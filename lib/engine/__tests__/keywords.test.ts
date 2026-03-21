import { describe, it, expect } from "vitest";
import { parseQuery, type KeywordResponse } from "@/lib/engine/keywords";

describe("keyword parser — parseQuery()", () => {
  // ── Route classification ───────────────────────────────────────────────

  it("routes '6 drinks tonight' to alcohol handler", () => {
    const result = parseQuery("6 drinks tonight");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("alcohol");
    expect(result!.confidence).toBeDefined();
    expect(result!.confidence).toMatch(/^(high|mod|low)$/);
  });

  it("routes '5.5h sleep' to sleep handler", () => {
    const result = parseQuery("5.5h sleep last night");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("sleep");
    expect(result!.confidence).toMatch(/^(high|mod|low)$/);
  });

  it("routes 'gym session' to exercise handler", () => {
    const result = parseQuery("gym session today");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("exercise");
  });

  it("routes 'went for a run' to exercise handler", () => {
    const result = parseQuery("went for a run this morning");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("exercise");
  });

  it("routes 'clean eating day' to diet handler", () => {
    const result = parseQuery("clean eating day");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("diet");
  });

  it("routes 'cheat meal' to diet handler", () => {
    const result = parseQuery("had a cheat meal");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("diet");
  });

  it("routes 'skip gym today' to rest handler", () => {
    const result = parseQuery("skip gym today");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("rest");
  });

  // ── Compound query → null (Claude API) ─────────────────────────────────

  it("returns null for compound query", () => {
    const result = parseQuery("how does alcohol affect my sleep and diet");
    expect(result).toBeNull();
  });

  it("returns null for unrecognized query", () => {
    const result = parseQuery("what is the meaning of life");
    expect(result).toBeNull();
  });

  // ── Response shape validation ──────────────────────────────────────────

  describe("all responses include required fields", () => {
    const testCases = [
      { query: "4 drinks", category: "alcohol" },
      { query: "6h sleep", category: "sleep" },
      { query: "gym session", category: "exercise" },
      { query: "clean eating", category: "diet" },
      { query: "rest day", category: "rest" },
    ];

    for (const { query, category } of testCases) {
      it(`${category} handler returns complete response`, () => {
        const result = parseQuery(query);
        expect(result).not.toBeNull();
        const r = result as KeywordResponse;

        expect(r.summary).toBeTruthy();
        expect(typeof r.summary).toBe("string");

        expect(r.relatableEquiv).toBeTruthy();
        expect(typeof r.relatableEquiv).toBe("string");

        expect(Array.isArray(r.mechanismChain)).toBe(true);
        expect(r.mechanismChain.length).toBeGreaterThanOrEqual(2);

        expect(r.confidence).toMatch(/^(high|mod|low)$/);

        expect(r.category).toBe(category);
      });
    }
  });

  // ── Forward-framing language (R017) ────────────────────────────────────

  describe("forward-framing language — no blame", () => {
    it("alcohol response uses recovery framing", () => {
      const result = parseQuery("6 drinks tonight");
      expect(result).not.toBeNull();
      const text = [result!.summary, ...result!.mechanismChain].join(" ");
      // Should not contain blame language
      expect(text).not.toMatch(/you shouldn't|bad decision|you ruined|failure/i);
      // Should contain recovery-oriented language
      expect(text).toMatch(/recover|back|days|hours/i);
    });

    it("diet handler uses forward-framing", () => {
      const result = parseQuery("cheat meal tonight");
      expect(result).not.toBeNull();
      const text = [result!.summary, ...result!.mechanismChain].join(" ");
      expect(text).not.toMatch(/you shouldn't|bad decision|failure/i);
      expect(text).toMatch(/recover|clean days|bends back/i);
    });

    it("rest day response is affirming, not guilt-inducing", () => {
      const result = parseQuery("rest day today");
      expect(result).not.toBeNull();
      expect(result!.summary).toMatch(/rounding error|consistency/i);
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────

  it("handles zero drinks gracefully", () => {
    const result = parseQuery("0 drinks tonight");
    expect(result).toBeNull();
  });

  it("handles sleep with decimal hours", () => {
    const result = parseQuery("sleep 7.5h last night");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("sleep");
  });

  it("handles 8h sleep as positive", () => {
    const result = parseQuery("8h sleep");
    expect(result).not.toBeNull();
    expect(result!.category).toBe("sleep");
    // 8h is optimal — should have positive framing
    expect(result!.mechanismChain.join(" ")).toMatch(/optimal/i);
  });
});
