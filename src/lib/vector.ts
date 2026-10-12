import opentype from "opentype.js";
import { FontDef } from "./fonts";

export interface VectorOptions {
  text: string;
  font: FontDef;
  fontUrl: string;
  widthMm: number;
  lineSpacing: number;
}

interface PathCommand {
  type: "M" | "L" | "C" | "Q" | "Z";
  x?: number;
  y?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

/** Load a font using opentype.js */
async function loadFont(url: string) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  return opentype.parse(buf);
}

/** Flatten bezier curves into line segments (for DXF) */
function flattenPath(
  commands: PathCommand[],
  tolerance = 0.1
): Array<{ x: number; y: number }[]> {
  const polylines: Array<{ x: number; y: number }[]> = [];
  let current: { x: number; y: number }[] = [];
  let cx = 0,
    cy = 0;

  const bezierPoint = (
    p0: any, p1: any, p2: any, p3: any, t: number
  ) => {
    const mt = 1 - t;
    return {
      x:
        mt * mt * mt * p0.x +
        3 * mt * mt * t * p1.x +
        3 * mt * t * t * p2.x +
        t * t * t * p3.x,
      y:
        mt * mt * mt * p0.y +
        3 * mt * mt * t * p1.y +
        3 * mt * t * t * p2.y +
        t * t * t * p3.y,
    };
  };

  for (const cmd of commands) {
    if (cmd.type === "M") {
      if (current.length) polylines.push(current);
      cx = cmd.x!;
      cy = cmd.y!;
      current = [{ x: cx, y: cy }];
    } else if (cmd.type === "L") {
      cx = cmd.x!;
      cy = cmd.y!;
      current.push({ x: cx, y: cy });
    } else if (cmd.type === "C") {
      const p0 = { x: cx, y: cy };
      const p1 = { x: cmd.x1!, y: cmd.y1! };
      const p2 = { x: cmd.x2!, y: cmd.y2! };
      const p3 = { x: cmd.x!, y: cmd.y! };
      const dist = Math.hypot(p3.x - p0.x, p3.y - p0.y);
      const steps = Math.max(8, Math.ceil(dist / tolerance));
      for (let i = 1; i <= steps; i++) {
        current.push(bezierPoint(p0, p1, p2, p3, i / steps));
      }
      cx = p3.x;
      cy = p3.y;
    } else if (cmd.type === "Q") {
      const p0 = { x: cx, y: cy };
      const p1 = { x: cmd.x1!, y: cmd.y1! };
      const p2 = { x: cmd.x!, y: cmd.y! };
      const dist = Math.hypot(p2.x - p0.x, p2.y - p0.y);
      const steps = Math.max(8, Math.ceil(dist / tolerance));
      for (let i = 1; i <= steps; i++) {
        const mt = 1 - i / steps;
        const t = i / steps;
        current.push({
          x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
          y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
        });
      }
      cx = p2.x;
      cy = p2.y;
    } else if (cmd.type === "Z") {
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

/** Generate all text as SVG paths, scaled to target mm width */
export async function textToPolylines(
  opts: VectorOptions
): Promise<Array<{ x: number; y: number }[]>> {
  const font = await loadFont(opts.fontUrl);

  const lines = opts.text.replace(/\r/g, "").split("\n");
  const fontSize = 400; // internal units

  // Build paths per line
  const linePaths: opentype.Path[] = [];
  for (const line of lines) {
    if (!line.trim()) {
      linePaths.push(new opentype.Path());
      continue;
    }
    const p = font.getPath(line, 0, 0, fontSize, {
      kerning: true,
      features: { liga: true, rlig: true },
    });
    linePaths.push(p);
  }

  // Stack vertically with line spacing
  const lineHeight = fontSize * 1.2;
  const gap = lineHeight * opts.lineSpacing;

  const allPolylines: Array<{ x: number; y: number }[]> = [];
  let yOffset = 0;

  for (let i = 0; i < linePaths.length; i++) {
    const commands = linePaths[i].commands as PathCommand[];
    const polylines = flattenPath(commands);
    for (const poly of polylines) {
      allPolylines.push(
        poly.map((pt) => ({ x: pt.x, y: pt.y + yOffset }))
      );
    }
    yOffset += lineHeight + gap;
  }

  // Compute bounding box
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
  const h = maxY - minY;

  // Scale so width == requested mm (use 25.4 units per mm for DXF/SVG consistency)
  const mmToUnit = (mm: number) => (mm * 100) / 2.54; // 100 units = 1 inch
  const targetWidthUnits = mmToUnit(opts.widthMm);
  const scale = targetWidthUnits / w;

  return allPolylines.map((poly) =>
    poly.map((pt) => ({
      x: (pt.x - minX) * scale,
      // Flip Y (fonts are Y-down, CAD is Y-up)
      y: (maxY - pt.y) * scale,
    }))
  );
}

/** Convert polylines to a DXF file (AutoCAD R12 ASCII) */
export function polylinesToDxf(
  polylines: Array<{ x: number; y: number }[]>
): string {
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

/** Convert polylines to SVG path */
export function polylinesToSvg(
  polylines: Array<{ x: number; y: number }[]>
): string {
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