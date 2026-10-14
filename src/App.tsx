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

const APP_VERSION = "3.3.0";
const PRESETS = [
  { label: "Pen", mm: 25, icon: "🖊️" },
  { label: "Keychain", mm: 40, icon: "🔑" },
  { label: "Bottle", mm: 60, icon: "🍶" },
];

const DPI_OPTIONS = [600, 1000, 1500, 2000];

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

/* ============================================================
   LOGO
   ============================================================ */
function UsmanLogo({ size = 44 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className="drop-shadow-[0_0_14px_rgba(227,6,19,0.55)]"
    >
      <defs>
        <linearGradient id="uSilver" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#c9cdd3" />
          <stop offset="70%" stopColor="#7c8289" />
          <stop offset="100%" stopColor="#e6e8ec" />
        </linearGradient>
        <linearGradient id="uRed" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#8b0009" />
          <stop offset="50%" stopColor="#e30613" />
          <stop offset="100%" stopColor="#ff2a36" />
        </linearGradient>
        <radialGradient id="spark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#ff5964" />
          <stop offset="100%" stopColor="#e30613" stopOpacity="0" />
        </radialGradient>
      </defs>

      <path
        d="M 20 15 L 20 70 Q 20 100 50 100 Q 80 100 80 70 L 80 15 L 62 15 L 62 68 Q 62 82 50 82 Q 38 82 38 68 L 38 15 Z"
        fill="url(#uSilver)"
        stroke="#1a1a1a"
        strokeWidth="0.5"
      />
      <path d="M 46 78 L 100 20 L 100 55 L 68 82 Z" fill="url(#uRed)" />
      <g transform="translate(98,22)">
        <circle r="16" fill="url(#spark)" opacity="0.75" />
        <path
          d="M 0 -14 L 2 -3 L 13 -1 L 2 1 L 0 12 L -2 1 L -13 -1 L -2 -3 Z"
          fill="#ffffff"
        />
        <path
          d="M 0 -8 L 1 -2 L 7 -1 L 1 0 L 0 6 L -1 0 L -7 -1 L -1 -2 Z"
          fill="#e30613"
        />
      </g>
    </svg>
  );
}

/* ============================================================
   SPLASH SCREEN
   ============================================================ */
function SplashScreen({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 200),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1800),
      setTimeout(() => setPhase(4), 2700),
      setTimeout(onDone, 3400),
    ];
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[999] grid place-items-center bg-black transition-opacity duration-700 overflow-hidden",
        phase >= 4 ? "opacity-0 pointer-events-none" : "opacity-100"
      )}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-red-600/20 rounded-full blur-[140px] animate-pulse" />
        <div
          className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-red-800/15 rounded-full blur-[140px] animate-pulse"
          style={{ animationDelay: "0.5s" }}
        />
      </div>

      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {phase >= 3 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent 40%, rgba(227,6,19,0.35) 50%, transparent 60%)",
            animation: "sweep 1.2s ease-out forwards",
          }}
        />
      )}

      <style>{`
        @keyframes sweep {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes sparkPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.15); opacity: 0.85; }
        }
      `}</style>

      <div className="relative text-center px-6">
        <div
          className={cn(
            "mx-auto mb-8 transition-all duration-700",
            phase >= 1 ? "opacity-100 scale-100" : "opacity-0 scale-50"
          )}
          style={{
            animation:
              phase >= 2 ? "sparkPulse 2s ease-in-out infinite" : undefined,
          }}
        >
          <UsmanLogo size={140} />
        </div>

        {/* USMAN — silver chrome */}
        <h1
          className={cn(
            "text-5xl md:text-7xl font-black tracking-tight transition-all duration-700",
            "bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent",
            "[text-shadow:_0_2px_24px_rgba(255,255,255,0.25)]",
            phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          )}
          style={{ letterSpacing: "-0.02em" }}
        >
          USMAN
        </h1>

        {/* LASER (red) + SOLUTIONS (silver) */}
        <div
          className={cn(
            "mt-1 text-2xl md:text-3xl font-black tracking-[0.15em] transition-all duration-700 flex items-center justify-center gap-2",
            phase >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          )}
          style={{ transitionDelay: "0.15s" }}
        >
          <span
            className="text-[#e30613] drop-shadow-[0_0_20px_rgba(227,6,19,0.7)]"
            style={{ letterSpacing: "0.15em" }}
          >
            LASER
          </span>
          <span
            className="bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent [text-shadow:_0_2px_24px_rgba(255,255,255,0.25)]"
            style={{ letterSpacing: "0.15em" }}
          >
            SOLUTIONS
          </span>
        </div>

        <div className="mt-10 relative h-[2px] w-72 mx-auto overflow-hidden rounded-full bg-white/5">
          <div
            className={cn(
              "absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-red-500 to-transparent transition-all duration-1000",
              phase >= 3 ? "w-full opacity-100" : "w-0 opacity-0"
            )}
            style={{ boxShadow: "0 0 24px rgba(227,6,19,0.9)" }}
          />
        </div>

        <div
          className={cn(
            "mt-4 flex justify-center gap-1.5 transition-opacity duration-500",
            phase >= 2 ? "opacity-100" : "opacity-0"
          )}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-red-500/70 animate-pulse"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [text, setText] = useState("لیزر ڈیزائن");
  const [fontId, setFontId] = useState(DEFAULT_FONT_ID);
  const [widthMm, setWidthMm] = useState(40);
  const [dpi, setDpi] = useState(600);
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

  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  const textColor = "black" as const;
  const invert = true;
  const rotate = false;
  const lineSpacing = 0.35;

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
  const debouncedWidth = useDebounced(widthMm, 150);

  const startListening = useCallback(() => {
    if (!voiceSupported) {
      setError("Voice not supported. Use Chrome or Edge.");
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
        if (event.results[i].isFinal) finalText += transcript;
        else interim += transcript;
      }
      setText(finalText || interim || "");
    };
    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === "not-allowed") setError("Mic permission denied.");
      else if (e.error === "no-speech") setError("No speech detected.");
      else setError("Voice error: " + e.error);
    };
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    try {
      rec.start();
      setIsListening(true);
      setError(null);
    } catch {
      setError("Could not start voice.");
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
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

  useEffect(() => {
    if (!diag.ready) return;
    try {
      if (direction === "rtl" && !diag.shaping) {
        throw new Error(
          "Urdu shaping engine not available. Please use Chrome, Edge, Firefox or Safari."
        );
      }
      const r = renderDesign({
        text: debouncedText,
        font,
        widthMm: Math.min(150, Math.max(1, debouncedWidth)),
        dpi,
        lineSpacing,
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
  }, [debouncedText, font, debouncedWidth, dpi, edgeMode, diag, direction]);

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
          text,
          font,
          fontUrl,
          widthMm: Math.min(150, Math.max(1, widthMm)),
          lineSpacing,
        });
        if (!polylines.length) throw new Error("No vector paths generated.");
        const content =
          format === "dxf"
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
    [text, font, widthMm, vectorLoading]
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
    setDpi(600);
    setEdgeMode("solid");
  }, []);

  const fontsOk = Object.values(diag.fonts).filter(Boolean).length;

  return (
    <>
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      <div
        className={cn(
          "min-h-screen bg-black text-zinc-100 antialiased relative overflow-x-hidden transition-opacity duration-700",
          showSplash ? "opacity-0" : "opacity-100"
        )}
      >
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-600/10 rounded-full blur-[120px]" />
          <div className="absolute top-1/3 -right-40 w-96 h-96 bg-red-800/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-red-900/6 rounded-full blur-[120px]" />
        </div>

        {/* Header */}
        <header className="border-b border-white/5 bg-black/85 backdrop-blur-xl sticky top-0 z-30">
          <div className="max-w-[1400px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <UsmanLogo size={44} />
              <div>
                <h1
                  className="font-black text-[17px] leading-tight tracking-tight bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  USMAN
                </h1>
                <p
                  className="text-[10px] leading-tight mt-0.5 font-black flex gap-1.5"
                  style={{ letterSpacing: "0.18em" }}
                >
                  <span className="text-[#e30613]">LASER</span>
                  <span className="bg-gradient-to-b from-white via-zinc-300 to-zinc-500 bg-clip-text text-transparent">
                    SOLUTIONS
                  </span>
                </p>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] font-medium text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-100" />
                Black text
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] font-medium text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-white border border-zinc-600" />
                White bg
              </span>
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/10 text-[11px] font-medium text-zinc-400 hover:border-red-500/50 hover:text-red-300 transition-all duration-200"
              >
                Reset
              </button>
            </div>
          </div>
        </header>

        <main className="relative max-w-[1400px] mx-auto px-6 py-8 grid lg:grid-cols-[440px_1fr] gap-8">
          <section className="space-y-4">
            {/* Text */}
            <Card
              title="Text"
              hint={direction === "rtl" ? "RTL · Urdu" : "LTR · English"}
            >
              <div className="relative">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  dir={direction}
                  rows={3}
                  placeholder="Type Urdu or English…"
                  style={{
                    fontFamily: `"${font.family}", sans-serif`,
                    fontWeight: (font as any).weight,
                  }}
                  className={cn(
                    "w-full bg-black/60 border border-white/10 rounded-xl px-4 py-3 text-xl leading-loose outline-none transition-all duration-200 resize-y",
                    "focus:border-red-500/60 focus:ring-2 focus:ring-red-500/20",
                    direction === "rtl" ? "text-right pr-24" : "text-left pr-24"
                  )}
                />

                <button
                  onClick={copyText}
                  title="Copy"
                  className={cn(
                    "absolute top-3 left-3 p-1.5 rounded-lg transition-all duration-200",
                    copied
                      ? "text-emerald-400 bg-emerald-500/10"
                      : "text-zinc-500 hover:text-red-400 hover:bg-white/5"
                  )}
                >
                  {copied ? (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
                    title={isListening ? "Stop" : "Voice input"}
                    className={cn(
                      "absolute bottom-3 right-3 w-10 h-10 rounded-full grid place-items-center transition-all duration-200 shadow-lg",
                      isListening
                        ? "bg-red-600 text-white shadow-red-600/50 ring-4 ring-red-600/30 animate-pulse"
                        : "bg-gradient-to-br from-red-500 to-red-700 text-white shadow-red-600/40 hover:shadow-red-600/60 hover:scale-105"
                    )}
                  >
                    {isListening ? (
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                        <rect x="6" y="6" width="12" height="12" rx="2" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="2" width="6" height="12" rx="3" />
                        <path d="M5 10a7 7 0 0014 0" />
                        <path d="M12 17v4M8 21h8" />
                      </svg>
                    )}
                  </button>
                )}

                {isListening && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 bg-red-600/20 border border-red-600/40 rounded-full text-[10px] text-red-300 font-mono font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    REC
                  </div>
                )}
              </div>
            </Card>

            {/* Font */}
            <Card title="Font" hint={`${FONTS.length} styles`}>
              <div className="grid grid-cols-2 gap-2">
                {FONTS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFontId(f.id)}
                    className={cn(
                      "group text-left rounded-xl border px-3.5 py-2.5 transition-all duration-200",
                      fontId === f.id
                        ? "border-red-500/60 bg-gradient-to-br from-red-500/10 to-red-900/5 shadow-[0_0_0_1px_rgba(227,6,19,0.35),0_4px_20px_-4px_rgba(227,6,19,0.4)]"
                        : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60"
                    )}
                  >
                    <div
                      className={cn(
                        "text-[9px] uppercase tracking-wider font-semibold mb-1 transition-colors",
                        fontId === f.id
                          ? "text-red-400"
                          : "text-zinc-500 group-hover:text-zinc-400"
                      )}
                    >
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
              <div className="grid grid-cols-3 gap-2 mb-3">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setWidthMm(p.mm)}
                    className={cn(
                      "group rounded-xl border py-2.5 transition-all duration-200",
                      widthMm === p.mm
                        ? "border-red-500/60 bg-gradient-to-br from-red-500/10 to-red-900/5 shadow-[0_0_0_1px_rgba(227,6,19,0.35)]"
                        : "border-white/10 bg-black/40 hover:border-white/20"
                    )}
                  >
                    <div className="text-base">{p.icon}</div>
                    <div
                      className={cn(
                        "text-[11px] font-semibold mt-0.5",
                        widthMm === p.mm ? "text-red-400" : "text-zinc-300"
                      )}
                    >
                      {p.label}
                    </div>
                    <div className="text-[9px] text-zinc-500 font-mono">
                      {p.mm}mm
                    </div>
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
                  className="flex-1 accent-red-600 cursor-pointer"
                />
                <div className="flex items-center gap-1 bg-black/60 border border-white/10 rounded-lg px-2.5 focus-within:border-red-500/60 transition-colors">
                  <input
                    type="number"
                    min={1}
                    max={150}
                    value={widthMm}
                    onChange={(e) =>
                      setWidthMm(Math.min(150, Math.max(1, +e.target.value || 1)))
                    }
                    className="w-12 bg-transparent py-1.5 text-right outline-none font-mono text-sm"
                  />
                  <span className="text-zinc-500 text-xs">mm</span>
                </div>
              </div>
            </Card>

            {/* Resolution */}
            <Card title="Resolution">
              <div className="text-[11px] text-zinc-500 mb-2 font-medium">
                DPI <span className="text-zinc-600">· embedded in PNG</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {DPI_OPTIONS.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDpi(d)}
                    className={cn(
                      "rounded-lg border py-2 text-sm font-mono transition-all duration-200",
                      dpi === d
                        ? "border-red-500/60 bg-red-500/10 text-red-300 shadow-[0_0_0_1px_rgba(227,6,19,0.35)]"
                        : "border-white/10 bg-black/40 text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Card>

            {/* Edge mode */}
            <Card title="Edge Mode">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setEdgeMode("solid")}
                  className={cn(
                    "rounded-xl border py-2.5 transition-all duration-200 text-left px-3",
                    edgeMode === "solid"
                      ? "border-red-500/60 bg-gradient-to-br from-red-500/10 to-red-900/5 shadow-[0_0_0_1px_rgba(227,6,19,0.35)]"
                      : "border-white/10 bg-black/40 hover:border-white/20"
                  )}
                >
                  <div
                    className={cn(
                      "text-[12px] font-semibold",
                      edgeMode === "solid" ? "text-red-400" : "text-zinc-300"
                    )}
                  >
                    Solid
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Binary — best for laser
                  </div>
                </button>
                <button
                  onClick={() => setEdgeMode("smooth")}
                  className={cn(
                    "rounded-xl border py-2.5 transition-all duration-200 text-left px-3",
                    edgeMode === "smooth"
                      ? "border-red-500/60 bg-gradient-to-br from-red-500/10 to-red-900/5 shadow-[0_0_0_1px_rgba(227,6,19,0.35)]"
                      : "border-white/10 bg-black/40 hover:border-white/20"
                  )}
                >
                  <div
                    className={cn(
                      "text-[12px] font-semibold",
                      edgeMode === "smooth" ? "text-red-400" : "text-zinc-300"
                    )}
                  >
                    Smooth
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Anti-aliased — screen
                  </div>
                </button>
              </div>
            </Card>

            {/* Status */}
            <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/5 px-4 py-3 flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/20 grid place-items-center flex-shrink-0 mt-0.5">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <div>
                <div className="text-[12px] font-semibold text-emerald-300">
                  Laser-ready output
                </div>
                <div className="text-[11px] text-emerald-400/70 mt-0.5 leading-relaxed">
                  Black text on white background — machine black pixels mark karti hai.
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <Preview result={result} />

            {error && (
              <div className="rounded-xl border border-red-500/40 bg-gradient-to-br from-red-500/10 to-rose-500/5 text-red-200 px-4 py-3 text-sm flex items-start gap-3">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
                <div>
                  <strong className="font-semibold text-red-300">Error</strong>
                  <div className="mt-0.5 text-red-300/90">{error}</div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={download}
                disabled={!result || downloading}
                className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-700 text-white font-bold px-6 py-3.5 shadow-xl shadow-red-700/40 hover:shadow-red-600/60 hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
              >
                {downloading ? (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 12a9 9 0 11-6.22-8.56" />
                    </svg>
                    <span>Preparing…</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                    </svg>
                    <span>Download PNG</span>
                  </>
                )}
              </button>

              <button
                onClick={() => downloadVector("dxf")}
                disabled={vectorLoading}
                className="group relative inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-zinc-100 via-white to-zinc-300 text-black font-bold px-6 py-3.5 shadow-xl shadow-white/20 hover:shadow-white/40 hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
              >
                {vectorLoading ? (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M21 12a9 9 0 11-6.22-8.56" />
                    </svg>
                    <span>Building…</span>
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                    </svg>
                    <span>Download DXF</span>
                  </>
                )}
              </button>

              <button
                onClick={() => downloadVector("svg")}
                disabled={vectorLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-white/5 text-zinc-100 border border-white/10 font-semibold px-5 py-3.5 hover:bg-white/10 hover:border-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
              >
                SVG
              </button>
            </div>

            {result && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <Stat label="Size" value={`${result.widthPx}×${result.heightPx}px`} />
                <Stat label="DPI" value={String(dpi)} />
                <Stat label="mm" value={`${result.widthMm.toFixed(2)}×${result.heightMm.toFixed(2)}`} />
                <Stat label="Dir" value={result.direction.toUpperCase()} />
              </div>
            )}

            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-5 backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-red-500/15 grid place-items-center">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="text-[12px] font-bold uppercase tracking-wider text-zinc-200">
                  EZCAD2 Workflow
                </div>
              </div>
              <div className="space-y-3 text-[13px] text-zinc-400 leading-relaxed">
                <Step
                  num={1}
                  title="Vector (Best)"
                  desc={
                    <>
                      Download <span className="text-red-400 font-semibold">DXF</span> → EZCAD2{" "}
                      <span className="text-zinc-200">File → Import</span> → Hatch (Angle{" "}
                      <span className="font-mono text-red-400">45°</span>, Distance{" "}
                      <span className="font-mono text-red-400">0.02mm</span>)
                    </>
                  }
                />
                <Step
                  num={2}
                  title="Raster"
                  desc={<>PNG → EZCAD2 <span className="text-zinc-200">Draw → Bitmap File</span></>}
                />
                <Step
                  num={3}
                  title="Colour"
                  desc={<>Always <span className="font-semibold text-white">Black text on White background</span> — machine black marks</>}
                />
              </div>
            </div>
          </section>
        </main>

        <footer className="relative max-w-[1400px] mx-auto px-6 pb-8">
          <button
            onClick={() => setShowDiag((s) => !s)}
            className="group inline-flex items-center gap-2.5 text-[11px] font-mono text-zinc-500 hover:text-zinc-200 bg-white/[0.03] border border-white/10 rounded-full px-3.5 py-2 transition-all duration-200 hover:border-red-500/30"
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                !diag.ready
                  ? "bg-zinc-500 animate-pulse"
                  : diag.shaping
                  ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                  : "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]"
              )}
            />
            <span>v{diag.version}</span>
            <span className="text-zinc-700">·</span>
            <span>shaping: <span className={diag.shaping ? "text-emerald-400" : "text-red-400"}>{!diag.ready ? "…" : diag.shaping ? "OK" : "MISSING"}</span></span>
            <span className="text-zinc-700">·</span>
            <span>fonts {fontsOk}/{FONTS.length}</span>
            <span className="text-zinc-700">·</span>
            <span>voice: <span className={voiceSupported ? "text-emerald-400" : "text-zinc-500"}>{voiceSupported ? "OK" : "N/A"}</span></span>
          </button>
          {showDiag && (
            <pre className="mt-3 text-[11px] font-mono text-zinc-400 bg-black/60 border border-white/10 rounded-xl p-4 overflow-auto">
              {JSON.stringify(
                {
                  app: "Usman Laser Solutions",
                  version: diag.version,
                  render_engine: diag.engine,
                  raqm_equivalent_shaping: diag.shaping,
                  voice_supported: voiceSupported,
                  text_color: textColor,
                  white_background: invert,
                  edge_mode: edgeMode,
                  dpi_options: DPI_OPTIONS,
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
    </>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-white/[0.01] p-4 backdrop-blur-sm shadow-lg shadow-black/40">
      <div className="flex items-center justify-between mb-3.5">
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-zinc-400">{title}</h2>
        {hint && (
          <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md text-zinc-400 bg-white/5">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.03] border border-white/10">
      <span className="text-zinc-500 uppercase text-[10px] font-semibold">{label}</span>
      <span className="text-zinc-200">{value}</span>
    </div>
  );
}

function Step({ num, title, desc }: { num: number; title: string; desc: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-md bg-red-500/10 border border-red-500/30 grid place-items-center flex-shrink-0 text-[11px] font-bold text-red-400 mt-0.5">
        {num}
      </div>
      <div>
        <div className="text-[12px] font-semibold text-zinc-200 mb-0.5">{title}</div>
        <div className="text-[12px] text-zinc-500 leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}