import { describe, expect, it } from "vitest";
import { decorationRects, glyphElements, resolveFonts, spanRects, svgString, type StoneOptions } from "../src/index.js";
import { lay, runOf } from "./helpers.js";

// fontSize 10、latin scale 0.95 なので、欧文の 1em は 9.5px
const LATIN_EM = 9.5;
const SHIFTED: StoneOptions = { fonts: { latin: { family: "Georgia, serif", baselineShift: 0.1 } } };

describe("baselineShift", () => {
  it("defaults to 0 and keeps the value given for each script", () => {
    expect(resolveFonts().map((f) => f.baselineShift)).toEqual([0, 0, 0]);
    expect(resolveFonts({ latin: { family: "Georgia", baselineShift: -0.05 } })[0].baselineShift).toBe(-0.05);
  });

  it("moves only the glyphs of the script up in horizontal writing, keeping the frames", () => {
    const base = lay("和文Abc和文");
    const ctx = lay("和文Abc和文", SHIFTED);
    const a0 = runOf(base, "A").run;
    const a1 = runOf(ctx, "A").run;
    expect(a1.position.y).toBeCloseTo(a0.position.y - LATIN_EM * 0.1);
    expect(a1.position.x).toBeCloseTo(a0.position.x);
    expect(a1.frame).toEqual(a0.frame);
    // 和文はずれない
    expect(runOf(ctx, "和", 1).run.position).toEqual(runOf(base, "和", 1).run.position);
    expect(ctx.lineCount).toBe(base.lineCount);
    expect(ctx.renderedSize).toEqual(base.renderedSize);
  });

  it("moves down with a negative value", () => {
    const base = lay("あA");
    const ctx = lay("あA", { fonts: { latin: { family: "Georgia", baselineShift: -0.2 } } });
    expect(runOf(ctx, "A").run.position.y).toBeCloseTo(runOf(base, "A").run.position.y + LATIN_EM * 0.2);
  });

  it("moves rotated latin glyphs to the right in vertical writing, leaving upright glyphs", () => {
    const base = lay("和文Abc和文12", { direction: "tbRl" });
    const ctx = lay("和文Abc和文12", { ...SHIFTED, direction: "tbRl" });
    const a0 = runOf(base, "A").run;
    const a1 = runOf(ctx, "A").run;
    expect(a1.position.x).toBeCloseTo(a0.position.x + LATIN_EM * 0.1);
    expect(a1.position.y).toBeCloseTo(a0.position.y);
    expect(a1.frame).toEqual(a0.frame);
    // 縦中横の数字は正立なのでずらさない
    expect(runOf(ctx, "1").run.position).toEqual(runOf(base, "1").run.position);
  });

  it("uses the shift of the regular font for bold variants", () => {
    const spans = [{ start: 2, end: 5, fontWeight: 700 }];
    const base = lay("和文Abc", {}, {}, spans);
    const ctx = lay("和文Abc", SHIFTED, {}, spans);
    expect(runOf(ctx, "A").run.position.y).toBeCloseTo(runOf(base, "A").run.position.y - LATIN_EM * 0.1);
  });

  it("draws the shifted glyphs in the SVG", () => {
    const base = lay("あA");
    const ctx = lay("あA", SHIFTED);
    const glyphY = (c: typeof ctx, text: string) => glyphElements(c).find((g) => g.text === text)!.y;
    expect(glyphY(ctx, "A")).toBeCloseTo(glyphY(base, "A") - LATIN_EM * 0.1);
    expect(glyphY(ctx, "あ")).toBeCloseTo(glyphY(base, "あ"));
    expect(svgString(ctx)).not.toBe(svgString(base));
  });

  it("keeps underlines and span rects on the line, even when the span starts with a shifted glyph", () => {
    const span = [{ start: 1, end: 3, underline: true }];
    const base = lay("あAbい");
    const ctx = lay("あAbい", SHIFTED);
    expect(decorationRects(ctx, span)).toEqual(decorationRects(base, span));
    expect(spanRects(ctx, span, 0)).toEqual(spanRects(base, span, 0));
  });
});
