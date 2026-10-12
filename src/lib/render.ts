import { FontDef } from "./fonts";

export type TextColor = "white" | "black";

export interface RenderOptions {
  text: string;
  font: FontDef;
  widthMm: number;
  dpi: number;
  lineSpacing: number;
  invert: boolean;
  rotate: boolean;
  edgeMode?: "solid" | "smooth";
  /** Color of the text pixels. White = for laser (marked). Black = for viewing/black-mark machines. */
  textColor?: TextColor;
}

export interface RenderResult {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  direction: "rtl" | "ltr";
  lines: number;
}

const BASE_SIZE = 800;
const ALPHA_THRESHOLD = 110;

export function detectDirection(text: string): "rtl" | "ltr" {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (
      (cp >= 0x0590 && cp <= 0x08ff) ||
      (cp >= 0xfb1d && cp <= 0xfdff) ||
      (cp >= 0xfe70 && cp <= 0xfeff)
    )
      return "rtl";
    if (
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      (cp >= 0x00c0 && cp <= 0x024f)
    )
      return "ltr";
  }
  return "ltr";
}

export function shapingSupported(): boolean {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.font = "40px 'Noto Naskh Arabic', serif";
  const joined = ctx.measureText("ببب").width;
  const isolated = ctx.measureText("ب").width * 3;
  return "direction" in ctx && joined < isolated * 0.95;
}

interface Trimmed {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
}

function trimCanvas(src: HTMLCanvasElement): Trimmed | null {
  const ctx = src.getContext("2d")!;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const w = maxX - minX + 1,
    h = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d")!.drawImage(src, minX, minY, w, h, 0, 0, w, h);
  return { canvas: out, w, h };
}

function renderLine(
  line: string,
  font: FontDef,
  dir: "rtl" | "ltr",
  color: TextColor
): Trimmed | null {
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d")!;
  const fontStr = `${font.weight} ${BASE_SIZE}px "${font.family}"`;
  mctx.font = fontStr;
  mctx.direction = dir;
  const m = mctx.measureText(line);
  const pad = BASE_SIZE * font.padFactor;
  const w = Math.ceil(m.width + pad * 2);
  const h = Math.ceil(BASE_SIZE * (1 + font.padFactor * 2));

  const c = document.createElement("canvas");
  c.width = Math.min(w, 16000);
  c.height = Math.min(h, 16000);
  const ctx = c.getContext("2d", { alpha: true })!;
  ctx.font = fontStr;
  ctx.direction = dir;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = dir === "rtl" ? "right" : "left";
  ctx.fillStyle = color === "black" ? "#000000" : "#ffffff";
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = "source-over";
  const x = dir === "rtl" ? c.width - pad : pad;
  ctx.fillText(line, x, pad + BASE_SIZE * 0.85);
  return trimCanvas(c);
}

function downscale(
  src: HTMLCanvasElement,
  targetW: number,
  targetH: number
): HTMLCanvasElement {
  let cur = src;
  let w = src.width,
    h = src.height;
  while (w / 2 > targetW && h / 2 > targetH) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { alpha: true })!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(cur, 0, 0, w, h);
    cur = c;
  }
  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const octx = out.getContext("2d", { alpha: true })!;
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.clearRect(0, 0, targetW, targetH);
  octx.drawImage(cur, 0, 0, targetW, targetH);
  return out;
}

/**
 * Force every visible pixel to a single pure color (white or black) with binary/smooth alpha.
 */
function crispify(
  canvas: HTMLCanvasElement,
  mode: "solid" | "smooth",
  color: TextColor
) {
  const ctx = canvas.getContext("2d", { alpha: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const r = color === "black" ? 0 : 255;
  const g = color === "black" ? 0 : 255;
  const b = color === "black" ? 0 : 255;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    if (mode === "solid") {
      d[i + 3] = d[i + 3] > ALPHA_THRESHOLD ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Adds a solid WHITE background behind existing content (for view mode). */
function whiteBackground(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const octx = out.getContext("2d", { alpha: true })!;
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(src, 0, 0);
  return out;
}

export function renderDesign(opts: RenderOptions): RenderResult {
  const edgeMode = opts.edgeMode ?? "solid";
  const textColor: TextColor = opts.textColor ?? "white";

  const lines = opts.text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trimEnd());
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.length) throw new Error("Enter some text to render.");

  const direction = detectDirection(opts.text);
  const rendered = lines.map((l) =>
    l.trim() ? renderLine(l, opts.font, direction, textColor) : null
  );
  const nonEmpty = rendered.filter((r): r is Trimmed => !!r);
  if (!nonEmpty.length) throw new Error("Nothing visible to render.");

  const maxW = Math.max(...nonEmpty.map((r) => r.w));
  const avgH = nonEmpty.reduce((s, r) => s + r.h, 0) / nonEmpty.length;
  const gap = Math.round(avgH * opts.lineSpacing);
  const blankH = Math.round(avgH * 0.6);
  let totalH = 0;
  rendered.forEach((r, i) => {
    totalH += r ? r.h : blankH;
    if (i < rendered.length - 1) totalH += gap;
  });

  const big = document.createElement("canvas");
  big.width = maxW;
  big.height = totalH;
  const bctx = big.getContext("2d", { alpha: true })!;
  bctx.clearRect(0, 0, big.width, big.height);
  let y = 0;
  rendered.forEach((r, i) => {
    if (r) {
      bctx.drawImage(r.canvas, Math.round((maxW - r.w) / 2), y);
      y += r.h;
    } else y += blankH;
    if (i < rendered.length - 1) y += gap;
  });

  const targetW = Math.max(1, Math.round((opts.widthMm / 25.4) * opts.dpi));
  const targetH = Math.max(1, Math.round((targetW * totalH) / maxW));
  let final = downscale(big, targetW, targetH);

  crispify(final, edgeMode, textColor);

  if (opts.rotate) {
    const r = document.createElement("canvas");
    r.width = final.height;
    r.height = final.width;
    const rctx = r.getContext("2d", { alpha: true })!;
    rctx.clearRect(0, 0, r.width, r.height);
    rctx.translate(r.width / 2, r.height / 2);
    rctx.rotate(Math.PI / 2);
    rctx.drawImage(final, -final.width / 2, -final.height / 2);
    final = r;
  }

  if (opts.invert) {
    final = whiteBackground(final);
  }

  const pxToMm = (px: number) => (px / opts.dpi) * 25.4;
  return {
    canvas: final,
    widthPx: final.width,
    heightPx: final.height,
    widthMm: pxToMm(final.width),
    heightMm: pxToMm(final.height),
    direction,
    lines: lines.length,
  };
}