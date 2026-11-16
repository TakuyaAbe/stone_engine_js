import { afterEach, describe, expect, it, vi } from "vitest";
import { FixedMeasurer, StoneTextController, type ResolvedFont, type StoneContext } from "../src/index.js";

/** Web フォントの読み込み前は送り幅が狭く（フォールバックフォント）、読み込み後は広くなる計測器。invalidate で計測キャッシュを捨てる。 */
class LoadingMeasurer extends FixedMeasurer {
  loaded = false;
  invalidated = 0;
  private readonly cache = new Map<string, number>();
  advance(font: ResolvedFont, size: number, char: string): number {
    const key = `${size}\t${char}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    const width = (this.loaded ? 1 : 0.6) * super.advance(font, size, char);
    this.cache.set(key, width);
    return width;
  }
  invalidate(): void {
    this.invalidated++;
    this.cache.clear();
  }
}

/**
 * WebKit のような document.fonts。読み込み中でも check() が true を返し、loading / loadingdone を出さない
 * （addEventListener で登録しても呼ばない）。finish() で読み込みを終え、ready を解決する。
 */
function stubWebKitFonts(readyState: DocumentReadyState) {
  let finish!: () => void;
  const fonts = {
    status: "loading" as FontFaceSetLoadStatus,
    ready: new Promise<void>((resolve) => (finish = resolve)),
    check: () => true,
    load: vi.fn(async () => []),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const loadListeners: (() => void)[] = [];
  vi.stubGlobal("document", { fonts, readyState });
  vi.stubGlobal("window", { addEventListener: (_: string, fn: () => void) => loadListeners.push(fn) });
  return {
    fonts,
    finishFonts: () => {
      fonts.status = "loaded";
      finish();
    },
    firePageLoad: () => loadListeners.splice(0).forEach((fn) => fn()),
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(readyState: DocumentReadyState) {
  const stub = stubWebKitFonts(readyState);
  const measurer = new LoadingMeasurer();
  const layouts: StoneContext[] = [];
  const controller = new StoneTextController({ measurer, onLayout: (ctx) => layouts.push(ctx) });
  controller.update({ text: "Ab", options: { fontSize: 10 }, size: {} });
  return { ...stub, measurer, layouts, controller };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("font loading without loadingdone (WebKit)", () => {
  it("measures again after document.fonts.ready while fonts are loading", async () => {
    const { finishFonts, measurer, layouts, controller } = setup("complete");
    const before = layouts[0].runs[0].advance;
    measurer.loaded = true;
    finishFonts();
    await flush();
    expect(measurer.invalidated).toBe(1);
    expect(layouts).toHaveLength(2);
    expect(layouts[1].runs[0].advance).toBeGreaterThan(before);
    controller.dispose();
  });

  it("waits for the page load before document.fonts.ready while the page is loading", async () => {
    const { finishFonts, firePageLoad, measurer, layouts, controller } = setup("interactive");
    measurer.loaded = true;
    finishFonts();
    await flush();
    // ページの load まで待つ（CSS の @font-face がまだ届いていないことがある）
    expect(layouts).toHaveLength(1);
    firePageLoad();
    await flush();
    expect(layouts).toHaveLength(2);
    expect(measurer.invalidated).toBe(1);
    controller.dispose();
  });

  it("does not lay out again after dispose", async () => {
    const { finishFonts, layouts, controller } = setup("complete");
    controller.dispose();
    finishFonts();
    await flush();
    expect(layouts).toHaveLength(1);
  });

  it("does not wait when fonts and the page are already loaded", async () => {
    const { fonts, measurer, layouts, controller } = setup("complete");
    // setup の時点では読み込み中なので 1 回待っている。読み込み済みの状態で組み直しても、重ねて待たない
    fonts.status = "loaded";
    controller.update({ text: "Cd", options: { fontSize: 10 }, size: {} });
    await flush();
    expect(layouts).toHaveLength(2);
    expect(measurer.invalidated).toBe(0);
    controller.dispose();
  });
});
