import { useEffect, useRef } from "react";
import { RenderResult } from "../lib/render";

const FIELD_MM = 150;

export function Preview({ result }: { result: RenderResult | null }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const size = 600;
    c.width = size;
    c.height = size;
    const ctx = c.getContext("2d")!;
    const pxPerMm = size / FIELD_MM;

    // background
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, size, size);

    // grid 10mm
    ctx.strokeStyle = "rgba(63,63,70,0.6)";
    ctx.lineWidth = 1;
    for (let mm = 0; mm <= FIELD_MM; mm += 10) {
      const p = Math.round(mm * pxPerMm) + 0.5;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }
    // centre cross
    ctx.strokeStyle = "rgba(245,158,11,0.5)";
    ctx.beginPath(); ctx.moveTo(size / 2 + 0.5, 0); ctx.lineTo(size / 2 + 0.5, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, size / 2 + 0.5); ctx.lineTo(size, size / 2 + 0.5); ctx.stroke();

    if (!result) return;
    const w = result.widthMm * pxPerMm;
    const h = result.heightMm * pxPerMm;
    const x = (size - w) / 2;
    const y = (size - h) / 2;

    // bounding box
    ctx.strokeStyle = "rgba(245,158,11,0.9)";
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(result.canvas, x, y, w, h);
  }, [result]);

  return (
    <div className="relative">
      <canvas ref={ref} className="w-full aspect-square rounded-xl border border-zinc-800 shadow-2xl" />
      <div className="absolute top-3 left-3 text-[11px] font-mono text-zinc-400 bg-zinc-900/80 px-2 py-1 rounded">
        150 × 150 mm laser field · 10 mm grid
      </div>
      {result && (
        <div className="absolute bottom-3 right-3 text-[11px] font-mono text-amber-300 bg-zinc-900/80 px-2 py-1 rounded">
          {result.widthMm.toFixed(1)} × {result.heightMm.toFixed(1)} mm · {result.widthPx}×{result.heightPx}px
        </div>
      )}
    </div>
  );
}
