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

async function renderToCanvas(
  text: string,
  font: FontDef,
  lineSpacing: number
): Promise<HTMLCanvasElement> {
  const fontFamily = font.family;
  const weight = font.weight;

  try {
    await document.fonts.load(`${weight} 300px "${fontFamily}"`, "اب");
  } catch {}

  const lines = text.replace(/\r/g, "").split("\n");
  const FONT_PX = 300;

  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d")!;
  mctx.font = `${weight} ${FONT_PX}px "${fontFamily}"`;
  const isRtl = /[\u0590-\u08ff]/.test(text);
  mctx.direction = isRtl ? "rtl" : "ltr";

  let maxW = 0;
  for (const line of lines) {
    const w = mctx.measureText(line).width;
    if (w > maxW) maxW = w;
  }

  const pad = FONT_PX * font.padFactor;
  const lineHeight = FONT_PX * 1.4;
  const gap = lineHeight * lineSpacing;
  const totalH = lines.length * lineHeight + (lines.length - 1) * gap + pad * 2;
  const totalW = maxW + pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(totalW));
  canvas.height = Math.max(1, Math.ceil(totalH));
  const ctx = canvas.getContext("2d", { alpha: false })!;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = `${weight} ${FONT_PX}px "${fontFamily}"`;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";
  ctx.direction = isRtl ? "rtl" : "ltr";
  ctx.textAlign = isRtl ? "right" : "left";

  const x = isRtl ? canvas.width - pad : pad;
  let y = pad;
  for (const line of lines) {
    if (line.trim()) ctx.fillText(line, x, y);
    y += lineHeight + gap;
  }

  return canvas;
}

function traceCanvas(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return ImageTracer.imagedataToSVG(imageData, {
    ltres: 0.5,
    qtres: 0.5,
    pathomit: 2, // Keep small dots (Zer, Nukta)
    rightangleenhance: false,
    colorsampling: 0,
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    layering: 0,
    strokewidth: 0,
    linefilter: true,
    scale: 1,
    roundcoords: 2,
    viewbox: true,
    desc: false,
    lcpr: 0,
    qcpr: 0,
  });
}

function extractTextPathData(svg: string, imgW: number, imgH: number): string[] {
  const paths: string[] = [];
  const re = /<path[^>]*\sd="([^"]+)"/g;
  const imgArea = imgW * imgH;
  let m: RegExpExecArray | null;

  while ((m = re.exec(svg)) !== null) {
    const d = m[1];
    const nums = d.match(/-?\d*\.?\d+/g)?.map(Number) || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i];
      const y = nums[i + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (!isFinite(minX)) continue;
    const area = (maxX - minX) * (maxY - minY);
    if (area / imgArea < 0.85) {
      paths.push(d);
    }
  }
  return paths;
}

function parsePath(d: string): Polyline[][] {
  const polylines: Polyline[][] = [];
  let current: Polyline[] = [];
  let cx = 0, cy = 0;

  const tokens = d.match(/[MLCQZmlcqz]|-?\d*\.?\d+/g) || [];
  let i = 0;
  const num = () => parseFloat(tokens[i++]);

  const addC = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const dist = Math.hypot(x3 - x0, y3 - y0);
    const steps = Math.max(6, Math.ceil(dist / 1.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      current.push({
        x: mt*mt*mt*x0 + 3*mt*mt*t*x1 + 3*mt*t*t*x2 + t*t*t*x3,
        y: mt*mt*mt*y0 + 3*mt*mt*t*y1 + 3*mt*t*t*y2 + t*t*t*y3,
      });
    }
  };

  const addQ = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number) => {
    const dist = Math.hypot(x2 - x0, y2 - y0);
    const steps = Math.max(6, Math.ceil(dist / 1.5));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const mt = 1 - t;
      current.push({
        x: mt*mt*x0 + 2*mt*t*x1 + t*t*x2,
        y: mt*mt*y0 + 2*mt*t*y1 + t*t*y2,
      });
    }
  };

  while (i < tokens.length) {
    const cmd = tokens[i++];
    if (cmd === "M" || cmd === "m") {
      if (current.length) polylines.push(current);
      const x = num(), y = num();
      cx = cmd === "m" ? cx + x : x;
      cy = cmd === "m" ? cy + y : y;
      current = [{ x: cx, y: cy }];
    } else if (cmd === "L" || cmd === "l") {
      const x = num(), y = num();
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
      addC(cx, cy, ax1, ay1, ax2, ay2, ax3, ay3);
      cx = ax3; cy = ay3;
    } else if (cmd === "Q" || cmd === "q") {
      const x1 = num(), y1 = num(), x2 = num(), y2 = num();
      const ax1 = cmd === "q" ? cx + x1 : x1;
      const ay1 = cmd === "q" ? cy + y1 : y1;
      const ax2 = cmd === "q" ? cx + x2 : x2;
      const ay2 = cmd === "q" ? cy + y2 : y2;
      addQ(cx, cy, ax1, ay1, ax2, ay2);
      cx = ax2; cy = ay2;
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

export async function textToPolylines(opts: VectorOptions): Promise<Polyline[][]> {
  const canvas = await renderToCanvas(opts.text, opts.font, opts.lineSpacing);
  const svg = traceCanvas(canvas);
  const pathData = extractTextPathData(svg, canvas.width, canvas.height);

  const allPolylines: Polyline[][] = [];
  for (const d of pathData) {
    allPolylines.push(...parsePath(d));
  }

  if (!allPolylines.length) {
    throw new Error("Tracing produced no paths. Try a different font.");
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of allPolylines) {
    for (const pt of poly) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  const w = maxX - minX;
  const scale = opts.widthMm / w;

  return allPolylines.map((poly) =>
    poly.map((pt) => ({
      x: (pt.x - minX) * scale,
      y: (maxY - pt.y) * scale,
    }))
  );
}

// 🔥 YE HAI ASLI FIX - EZCAD2 KE LIYE PURANA POLYLINE FORMAT 🔥
export function polylinesToDxf(polylines: Polyline[][]): string {
  const parts: string[] = [];
  parts.push("0\nSECTION\n2\nENTITIES\n");

  for (const poly of polylines) {
    if (poly.length < 2) continue;

    // Old-school POLYLINE format (Best for EZCAD2 hatching)
    // 66=1 means vertices follow, 70=1 means Closed
    parts.push("0\nPOLYLINE\n8\n0\n66\n1\n70\n1\n");

    for (const pt of poly) {
      parts.push(`0\nVERTEX\n8\n0\n10\n${pt.x.toFixed(4)}\n20\n${pt.y.toFixed(4)}\n30\n0.0\n`);
    }

    parts.push("0\nSEQEND\n");
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
      d += (i === 0 ? "M" : "L") + pt.x.toFixed(3) + "," + pt.y.toFixed(3) + " ";
    });
    d += "Z ";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}mm" height="${h}mm">
  <path d="${d}" fill="black" fill-rule="evenodd"/>
</svg>`;
}