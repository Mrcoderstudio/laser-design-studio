import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_FONT_ID, FONTS, ensureFontsLoaded } from "./lib/fonts";
import {
  RenderResult,
  detectDirection,
  renderDesign,
  shapingSupported,
} from "./lib/render";
import { canvasToPngBlobWithDpi } from "./lib/png";
import { Preview } from "./components/Preview";
import { cn } from "./utils/cn";
import {
  textToPolylines,
  polylinesToDxf,
  polylinesToSvg,
} from "./lib/vector";

const APP_VERSION = "1.7.0";
const PRESETS = [
  { label: "Pen", mm: 25, icon: "🖊️" },
  { label: "Keychain", mm: 40, icon: "🔑" },
  { label: "Bottle", mm: 60, icon: "🍶" },
];

type EdgeMode = "solid" | "smooth";

interface Diag {
  version: string;
  engine: string;
  shaping: boolean;
  fonts: Record<string, boolean>;
  ready: boolean;
}

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function resolveFontUrl(font: any): string {
  if (font?.url) return font.url;
  if (font?.file) return `/fonts/${font.file}`;
  const family = String(font?.family ?? "NotoNastaliqUrdu").replace(/\s+/g, "");
  return `/fonts/${family}.ttf`;
}

function speechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const SR =
    (window as any).SpeechRecognition ||
    (window as any).webkitSpeechRecognition;
  return !!SR;
}

export default function App() {
  const [text, setText] = useState("لیزر ڈیزائن");
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [widthMm, setWidthMm] = useState(40);
  const [dpi, setDpi] = useState(300);
  const [lineSpacing, setLineSpacing] = useState(0.35);
  const [edgeMode, setEdgeMode] = useState<EdgeMode>("solid");
  const [diag, setDiag] = useState<Diag>({
    version: APP_VERSION,
    engine: "Canvas2D",
    shaping: false,
    fonts: {},
    ready: false,
  });
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [vectorLoading, setVectorLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // FIXED settings — black text, white bg, no rotate
  const textColor = "black" as const;
  const invert = true;   // Add white background always ON
  const rotate = false;  // Rotate removed

  const font = useMemo(
    () => FONTS.find((f) => f.id === fontId) ?? FONTS[0],
    [fontId]
  );
  const direction = detectDirection(text);

  useEffect(() => {
    ensureFontsLoaded().then((fonts) => {
      setDiag({
        version: APP_VERSION,
        engine: "Canvas2D (native HarfBuzz/CoreText shaper)",
        shaping: shapingSupported(),
        fonts,
        ready: true,
      });
    });
    setVoiceSupported(speechSupported());
  }, []);

  const debouncedText = useDebounced(text, 250);
  const debouncedSpacing = useDebounced(lineSpacing, 150);
  const debouncedWidth = useDebounced(widthMm, 150);

  // Voice handlers
  const startListening = useCallback(() => {
    if (!voiceSupported) {
      setError(
        "Voice input aapke browser mein support nahi hai. Chrome ya Edge use karein."
      );
      return;
    }
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const rec = new SR();
    const isUrduContext = /[\u0590-\u08ff]/.test(text) || direction === "rtl";
    rec.lang = isUrduContext ? "ur-PK" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let finalText = "";

    rec.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += transcript;
        } else {
          interim += transcript;
        }
      }
      setText(finalText || interim || "");
    };

    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === "not-allowed") {
        setError("Mic permission denied. Browser settings mein allow karein.");
      } else if (e.error === "no-speech") {
        setError("Kuch suna nahi gaya. Dobara try karein.");
      } else {
        setError("Voice error: " + e.error);
      }
    };

    rec.onend = () => setIsListening(false);

    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      setError(null);
    } catch {
      setError("Voice start nahi ho saka. Dobara try karein.");
    }
  }, [voiceSupported, text, direction]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) stopListening();
    else startListening();
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
    };
  }, []);

  // Render preview
  useEffect(() => {
    if (!diag.ready) return;
    try {
      if (direction === "rtl" && !diag.shaping) {
        throw new Error(
          "Urdu shaping engine not available in this browser — letters would render disjointed. Please use an up-to-date Chrome, Edge, Firefox or Safari."
        );
      }
      const r = renderDesign({
        text: debouncedText,
        font,
        widthMm: Math.min(150, Math.max(1, debouncedWidth)),
        dpi,
        lineSpacing: debouncedSpacing,
        invert,
        rotate,
        edgeMode,
        textColor,
      });
      setResult(r);
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    debouncedText, font, debouncedWidth, dpi, debouncedSpacing,
    edgeMode, diag, direction,
  ]);

  const download = useCallback(async () => {
    if (!result || downloading) return;
    setDownloading(true);
    try {
      const blob = await canvasToPngBlobWithDpi(result.canvas, dpi);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laser_design_${widthMm}mm_${dpi}dpi.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  }, [result, dpi, widthMm, downloading]);

  const downloadVector = useCallback(
    async (format: "dxf" | "svg") => {
      if (vectorLoading) return;
      setVectorLoading(true);
      setError(null);
      try {
        const fontUrl = resolveFontUrl(font);
        const polylines = await textToPolylines({
          text, font, fontUrl,
          widthMm: Math.min(150, Math.max(1, widthMm)),
          lineSpacing,
        });
        if (!polylines.length) {
          throw new Error("No vector paths generated. Check the font file exists in /fonts/.");
        }
        const content = format === "dxf"
          ? polylinesToDxf(polylines)
          : polylinesToSvg(polylines);
        const mime = format === "dxf" ? "application/dxf" : "image/svg+xml";
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `laser_design_${widthMm}mm.${format}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Vector export failed.");
      } finally {
        setVectorLoading(false);
      }
    },
    [text, font, widthMm, lineSpacing, vectorLoading]
  );

  const copyText = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  }, [text]);

  const reset = useCallback(() => {
    setText("");
    setFontId(DEFAULT_FONT_ID);
    setWidthMm(40);
    setDpi(300);
    setLineSpacing(0.35);
    setEdgeMode("solid");
  }, []);

  const fontsOk = Object.values(diag.fonts).filter(Boolean).length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-[Inter,system-ui,sans-serif] antialiased">
      <header className="border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-5 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center shadow-lg shadow-amber-500/20">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-zinc-950" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
                <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight tracking-tight">
                Laser Design Studio
              </h1>
              <p className="text-[11px] text-zinc-500 leading-tight">
                Urdu / English → EZCAD2 PNG &amp; DXF · 1064nm fiber
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">
              Black text · White bg
            </span>
            <span className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800">
              Laser-ready
            </span>
            <button
              onClick={reset}
              className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 hover:border-zinc-600 hover:text-zinc-200 transition"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-5 py-6 grid lg:grid-cols-[420px_1fr] gap-6">
        <section className="space-y-5">
          {/* Text + Voice */}
          <Card title="Text" hint={direction === "rtl" ? "RTL · Urdu" : "LTR · English"}>
            <div className="relative">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                dir={direction}
                rows={3}
                placeholder="Type Urdu or English…  (mic se bol kar likhein)"
                style={{
                  fontFamily: `"${font.family}", sans-serif`,
                  fontWeight: (font as any).weight,
                }}
                className={cn(
                  "w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 pl-9 pr-12 text-xl leading-loose outline-none focus:border-amber-500/70 focus:ring-2 focus:ring-amber-500/20 resize-y transition",
                  direction === "rtl" ? "text-right" : "text-left"
                )}
              />
              <button
                onClick={copyText}
                title="Copy text"
                className="absolute top-2 left-2 text-zinc-500 hover:text-amber-300 transition p-1 rounded"
              >
                {copied ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15V5a2 2 0 012-2h10" />
                  </svg>
                )}
              </button>

              {voiceSupported && (
                <button
                  onClick={toggleVoice}
                  title={isListening ? "Stop recording" : "Bol kar likhein"}
                  className={cn(
                    "absolute bottom-2 right-2 w-9 h-9 rounded-full grid place-items-center transition shadow-lg",
                    isListening
                      ? "bg-red-500 text-white animate-pulse shadow-red-500/40"
                      : "bg-emerald-500 text-white hover:bg-emerald-400 shadow-emerald-500/30"
                  )}
                >
                  {isListening ? (
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                      <rect x="6" y="6" width="12" height="12" rx="2" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="12" rx="3" />
                      <path d="M5 10a7 7 0 0014 0" />
                      <path d="M12 17v4M8 21h8" />
                    </svg>
                  )}
                </button>
              )}

              {isListening && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full text-[10px] text-red-300 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  REC
                </div>
              )}
            </div>
          </Card>

          {/* Font */}
          <Card title="Font" hint={`${FONTS.length} available`}>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFontId(f.id)}
                  className={cn(
                    "text-left rounded-lg border px-3 py-2 transition",
                    fontId === f.id
                      ? "border-amber-500 bg-amber-500/10 shadow-[0_0_0_1px_rgba(245,158,11,0.4)]"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                  )}
                >
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">
                    {f.label}
                  </div>
                  <div
                    dir={f.lang === "ur" ? "rtl" : "ltr"}
                    style={{
                      fontFamily: `"${f.family}"`,
                      fontWeight: (f as any).weight,
                    }}
                    className={cn(
                      "text-lg leading-relaxed truncate",
                      f.lang === "ur" ? "text-right" : "text-left"
                    )}
                  >
                    {f.sample}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Width */}
          <Card title="Width" hint={`${widthMm} mm`}>
            <div className="flex gap-2 mb-3">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setWidthMm(p.mm)}
                  className={cn(
                    "flex-1 rounded-lg border py-2 text-sm font-medium transition",
                    widthMm === p.mm
                      ? "border-amber-500 bg-amber-500/10 text-amber-300"
                      : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                  )}
                >
                  <span className="mr-1">{p.icon}</span>
                  {p.label} <span className="text-zinc-500">{p.mm}mm</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={150}
                value={widthMm}
                onChange={(e) => setWidthMm(+e.target.value)}
                className="flex-1 accent-amber-500"
              />
              <div className="flex items-center gap-1 bg-zinc-950 border border-zinc-800 rounded-lg px-2">
                <input
                  type="number"
                  min={1}
                  max={150}
                  value={widthMm}
                  onChange={(e) =>
                    setWidthMm(Math.min(150, Math.max(1, +e.target.value || 1)))
                  }
                  className="w-14 bg-transparent py-1.5 text-right outline-none font-mono"
                />
                <span className="text-zinc-500 text-sm">mm</span>
              </div>
            </div>
          </Card>

          {/* DPI + spacing */}
          <Card title="Resolution & Spacing">
            <div className="mb-4">
              <div className="text-xs text-zinc-500 mb-1.5">
                DPI (embedded in PNG metadata)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[150, 300, 600].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDpi(d)}
                    className={cn(
                      "rounded-lg border py-2 text-sm font-mono transition",
                      dpi === d
                        ? "border-amber-500 bg-amber-500/10 text-amber-300"
                        : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
                <span>Line spacing (multi-line)</span>
                <span className="font-mono text-zinc-300">
                  {lineSpacing.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={lineSpacing}
                onChange={(e) => setLineSpacing(+e.target.value)}
                className="w-full accent-amber-500"
              />
            </div>
          </Card>

          {/* Edge mode only */}
          <Card title="Edge mode (PNG only)">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setEdgeMode("solid")}
                className={cn(
                  "rounded-lg border py-2 text-sm transition",
                  edgeMode === "solid"
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                )}
              >
                Solid
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  best for laser
                </div>
              </button>
              <button
                onClick={() => setEdgeMode("smooth")}
                className={cn(
                  "rounded-lg border py-2 text-sm transition",
                  edgeMode === "smooth"
                    ? "border-amber-500 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"
                )}
              >
                Smooth
                <div className="text-[10px] text-zinc-500 mt-0.5">
                  anti-aliased
                </div>
              </button>
            </div>
          </Card>

          {/* Info banner */}
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 px-4 py-3 text-xs leading-relaxed">
            <strong className="font-semibold">✓ Laser-ready output:</strong>{" "}
            Black text on white background. Machine black pixels mark karti hai.
          </div>
        </section>

        <section className="space-y-4">
          <Preview result={result} />

          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-red-300 px-4 py-3 text-sm">
              <strong className="font-semibold">Error:</strong> {error}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={download}
              disabled={!result || downloading}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-amber-400 to-orange-500 text-zinc-950 font-semibold px-5 py-3 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {downloading ? "Preparing…" : "Download PNG"}
            </button>

            <button
              onClick={() => downloadVector("dxf")}
              disabled={vectorLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-teal-500 text-zinc-950 font-semibold px-5 py-3 shadow-lg shadow-emerald-500/20 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {vectorLoading ? "Building…" : "Download DXF (vector)"}
            </button>

            <button
              onClick={() => downloadVector("svg")}
              disabled={vectorLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-800 text-zinc-100 border border-zinc-700 font-semibold px-4 py-3 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              SVG
            </button>

            {result && (
              <div className="text-xs text-zinc-400 font-mono space-x-3">
                <span>{result.widthPx}×{result.heightPx} px</span>
                <span>{dpi} dpi</span>
                <span>{result.widthMm.toFixed(2)}×{result.heightMm.toFixed(2)} mm</span>
                <span className="uppercase">{result.direction}</span>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400 space-y-1.5">
            <div className="text-zinc-200 font-semibold text-xs uppercase tracking-wider mb-2">
              EZCAD2 workflow
            </div>
            <p>
              <b className="text-zinc-200">Vector:</b> Download{" "}
              <span className="text-emerald-300">DXF</span> → EZCAD2 →{" "}
              <span className="text-zinc-200">File → Import</span> → Hatch
              (Angle 45°, Line Distance 0.02mm).
            </p>
            <p>
              <b className="text-zinc-200">Raster:</b> PNG → EZCAD2 →{" "}
              <span className="text-zinc-200">Draw → Bitmap File</span>.
            </p>
            <p>
              Output hamesha: <b>Black text · White background</b> — machine
              black mark karti hai.
            </p>
          </div>
        </section>
      </main>

      <footer className="max-w-7xl mx-auto px-5 pb-6">
        <button
          onClick={() => setShowDiag((s) => !s)}
          className="inline-flex items-center gap-2 text-[11px] font-mono text-zinc-500 hover:text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-full px-3 py-1.5 transition"
        >
          <span
            className={cn(
              "w-2 h-2 rounded-full",
              !diag.ready ? "bg-zinc-500 animate-pulse" : diag.shaping ? "bg-emerald-400" : "bg-red-500"
            )}
          />
          v{diag.version} · {diag.engine.split(" ")[0]} · shaping:{" "}
          {!diag.ready ? "checking…" : diag.shaping ? "OK" : "MISSING"} · fonts{" "}
          {fontsOk}/{FONTS.length} · voice: {voiceSupported ? "OK" : "N/A"}
        </button>
        {showDiag && (
          <pre className="mt-2 text-[11px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg p-3 overflow-auto">
            {JSON.stringify(
              {
                app: "Laser Design Studio",
                version: diag.version,
                render_engine: diag.engine,
                raqm_equivalent_shaping: diag.shaping,
                voice_supported: voiceSupported,
                text_color: textColor,
                white_background: invert,
                edge_mode: edgeMode,
                fonts: diag.fonts,
                user_agent: navigator.userAgent,
                field_mm: 150,
                exports: ["PNG (raster)", "DXF (vector)", "SVG (vector)"],
              },
              null,
              2
            )}
          </pre>
        )}
      </footer>
    </div>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h2>
        {hint && <span className="text-[11px] font-mono text-amber-300/80">{hint}</span>}
      </div>
      {children}
    </div>
  );
}