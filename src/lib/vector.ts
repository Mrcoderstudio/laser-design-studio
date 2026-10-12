import { FontDef } from "./fonts";
import ImageTracer from "imagetracerjs";

export interface VectorOptions {
  text: string;
  font: FontDef;
  fontUrl: string;
  widthMm: number;
  lineSpacing: number;
}

interface Polyline {
  x: number;
  y: number;
}

/**
 * Rasterize text to a high-res canvas using the browser's native shaper
 * (HarfBuzz handles Urdu Nastaliq perfectly), then trace to vector paths.
 */
async function renderToCanvas(
  text: string,
  font: FontDef,
  widthMm: number,
  lineSpacing: number
): Promise<HTMLCanvasElement> {
  const fontFamily = font.family;
  const weight = font.weight;

  // Make sure font is available in document
  try {
    await document.fonts.load(`${weight} 400px "${fontFamily}"`, "اب");
  } catch {
    /* ignore */
  }

  const lines = text.replace(/\r/g, "").split("\n");
  const FONT_PX = 400;

  // Measurement canvas
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d")!;
  mctx.font = `${weight} ${FONT_PX}px "${fontFamily}"`;
  mctx.direction = /[\u0590-\u08ff]/.test(text) ? "rtl" : "ltr";

  // Find widest line
  let maxW = 0;
  for (const line of lines) {
    const w = mctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }

  const pad = FONT_PX * font.padFactor;
  const lineHeight = FONT_PX * 1.4;
  const gap = lineHeight * lineSpacing;
  const totalH =
    lines.length * lineHeight + (lines.length - 1) * gap + pad * 2;
  const totalW = maxW + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(totalW));
  canvas.height = Math.max(1, Math.ceil(totalH));
  const ctx = canvas.getContext("2d", { alpha: true })!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${weight} ${FONT_PX}px "${fontFamily}"`;
  ctx.fillStyle = "#000000"; // solid black text for tracing
  ctx.textBaseline = "top";
  ctx.direction = mctx.direction;
  ctx.textAlign = mctx.direction === "rtl" ? "right" : "left";

  const x = mctx.direction === "rtl" ? canvas.width - pad : pad;
  let y = pad;

  for (const line of lines) {
    if (line.trim()) {
      ctx.fillText(line, x, y);
    }
    y += lineHeight + gap;
  }

  return canvas;
}

/** Convert canvas to SVG path strings using ImageTracer */
function traceCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const svg = ImageTracer.imagedataToSVG(imageData, {
    ltres: 0.5,
    qtres: 0.5,
    pathomit: 4,
    rightangleenhance: false,
    colorsampling: 0,
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 2,
    viewbox: false,
    desc: false,
    lcpr: 0,
    qcpr: 0,
    blurradius: 0,
    blurdelta: 20,
  });

  return svg;
}

/** Extract path `d` attributes from an SVG string */
function extractPathData(svg: string): string[] {
  const paths: string[] = [];
  const re = /<path[^>]*\sd="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg)) !== null) {
    paths.push(m[1]);
  }
  return paths;
}

/**
 * Very small SVG path parser — supports M, L, C, Q, Z with absolute coords.
 * ImageTracer outputs this subset.
 */
function parsePath(d: string): Polyline[][] {
  const polylines: Polyline[][] = [];
  let current: Polyline[] = [];
  let cx = 0,
    cy = 0;

  const tokens = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+/g) || [];
  let i = 0;

  const num = () => parseFloat(tokens[i++]);

  const bezierC = (
    x0: number, y0: number, x1: number, y1: number,
    x2: number, y2: number, x3: number, y3: number
  ) => {
    const dist = Math.hypot(x3 - x0, y3 - y0);
    const steps = Math.max(6, Math.ceil(dist / 2));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      current.push({
        x: mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
        y: mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
      });
    }
  };

  const bezierQ = (
    x0: number, y0: number, x1: number, y1: number, x2: number, y2: number
  ) => {
    const dist = Math.hypot(x2 - x0, y2 - y0);
    const steps = Math.max(6, Math.ceil(dist / 2));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      current.push({
        x: mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
        y: mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
      });
    }
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M" || cmd === "m") {
      if (current.length) polylines.push(current);
      const x = num();
      const y = num();
      cx = cmd === "m" ? cx + x : x;
      cy = cmd === "m" ? cy + y : y;
      current = [{ x: cx, y: cy }];
    } else if (cmd === "L" || cmd === "l") {
      const x = num();
      const y = num();
      cx = cmd === "l" ? cx + x : x;
      cy = cmd === "l" ? cy + y : y;
      current.push({ x: cx, y: cy });
    } else if (cmd === "C" || cmd === "c") {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num(), x3 = num(), y3 = num();
      const ax1 = cmd === "c" ? cx + x1 : x1;
      const ay1 = cmd === "c" ? cy + y1 : y1;
      const ax2 = cmd === "c" ? cx + x2 : x2;
      const ay2 = cmd === "c" ? cy + y2 : y2;
      const ax3 = cmd === "c" ? cx + x3 : x3;
      const ay3 = cmd === "c" ? cy + y3 : y3;
      bezierC(cx, cy, ax1, ay1, ax2, ay2, ax3, ay3);
      cx = ax3;
      cy = ay3;
    } else if (cmd === "Q" || cmd === "q") {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      const ax1 = cmd === "q" ? cx + x1 : x1;
      const ay1 = cmd === "q" ? cy + y1 : y1;
      const ax2 = cmd === "q" ? cx + x2 : x2;
      const ay2 = cmd === "q" ? cy + y2 : y2;
      bezierQ(cx, cy, ax1, ay1, ax2, ay2);
      cx = ax2;
      cy = ay2;
    } else if (cmd === "Z" || cmd === "z") {
      if (current.length) {
        current.push({ ...current[0] });
        polylines.push(current);
        current = [];
      }
    }
  }
  if (current.length) polylines.push(current);
  return polylines;
}

/** Generate vector polylines from text using canvas + tracing */
export async function textToPolylines(
  opts: VectorOptions
): Promise<Polyline[][]> {
  const canvas = await renderToCanvas(
    opts.text,
    opts.font,
    opts.widthMm,
    opts.lineSpacing
  );

  const svg = traceCanvas(canvas);
  const pathData = extractPathData(svg);

  const allPolylines: Polyline[][] = [];
  for (const d of pathData) {
    allPolylines.push(...parsePath(d));
  }

  if (!allPolylines.length) {
    throw new Error(
      "Tracing produced no paths. Check that the font loaded correctly."
    );
  }

  // Compute bbox
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of allPolylines) {
    for (const pt of poly) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const w = maxX - minX;

  // Scale so width == requested mm (1 inch = 100 units → 25.4mm = 100)
  const targetWidthUnits = (opts.widthMm * 100) / 25.4;
  const scale = targetWidthUnits / w;

  return allPolylines.map((poly) =>
    poly.map((pt) => ({
      x: (pt.x - minX) * scale,
      y: (maxY - pt.y) * scale, // flip Y for CAD
    }))
  );
}

export function polylinesToDxf(polylines: Polyline[][]): string {
  const parts: string[] = [];
  parts.push("0\nSECTION\n2\nENTITIES\n");

  for (const poly of polylines) {
    if (poly.length < 2) continue;
    parts.push("0\nLWPOLYLINE\n8\n0\n90\n" + poly.length + "\n70\n0\n");
    for (const pt of poly) {
      parts.push(`10\n${pt.x.toFixed(4)}\n20\n${pt.y.toFixed(4)}\n`);
    }
  }

  parts.push("0\nENDSEC\n0\nEOF\n");
  return parts.join("");
}

export function polylinesToSvg(polylines: Polyline[][]): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polylines) {
    for (const pt of poly) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;

  let d = "";
  for (const poly of polylines) {
    poly.forEach((pt, i) => {
      d += (i === 0 ? "M" : "L") + pt.x.toFixed(2) + "," + pt.y.toFixed(2) + " ";
    });
    d += "Z ";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}">
  <path d="${d}" fill="black" fill-rule="evenodd"/>
</svg>`;
}