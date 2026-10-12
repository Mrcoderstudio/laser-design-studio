/** Inject a pHYs chunk (physical pixel density) into a PNG so EZCAD2 reads the correct mm size. */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

export function withDpi(png: Uint8Array, dpi: number): Uint8Array {
  // Validate signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (png[i] !== sig[i]) return png;

  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const type = [0x70, 0x48, 0x59, 0x73]; // "pHYs"
  const data = [...u32(ppm), ...u32(ppm), 1];
  const crc = crc32(new Uint8Array([...type, ...data]));
  const chunk = new Uint8Array([...u32(9), ...type, ...data, ...u32(crc)]);

  // Walk chunks: strip existing pHYs, insert ours right after IHDR
  const out: Uint8Array[] = [png.slice(0, 8)];
  let pos = 8;
  let inserted = false;
  while (pos < png.length) {
    const len = ((png[pos] << 24) | (png[pos + 1] << 16) | (png[pos + 2] << 8) | png[pos + 3]) >>> 0;
    const ctype = String.fromCharCode(png[pos + 4], png[pos + 5], png[pos + 6], png[pos + 7]);
    const end = pos + 12 + len;
    if (ctype !== "pHYs") out.push(png.slice(pos, end));
    if (ctype === "IHDR" && !inserted) {
      out.push(chunk);
      inserted = true;
    }
    pos = end;
  }
  const total = out.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const a of out) {
    result.set(a, o);
    o += a.length;
  }
  return result;
}

export async function canvasToPngBlobWithDpi(canvas: HTMLCanvasElement, dpi: number): Promise<Blob> {
  const blob: Blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png")
  );
  const buf = new Uint8Array(await blob.arrayBuffer());
  const out = withDpi(buf, dpi);
  const ab = new ArrayBuffer(out.length);
  new Uint8Array(ab).set(out);
  return new Blob([ab], { type: "image/png" });
}
