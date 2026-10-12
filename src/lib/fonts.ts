export interface FontDef {
  id: string;
  label: string;
  family: string;
  weight: number;
  lang: "ur" | "en";
  sample: string;
  padFactor: number;
  url: string; // ← YE NAYA FIELD ADD HUA HAI
}

export const FONTS: FontDef[] = [
  { id: "nastaliq-bold", label: "Urdu — Nastaliq Bold", family: "Noto Nastaliq Urdu", weight: 700, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 1.4, url: "/fonts/NotoNastaliqUrdu-Bold.ttf" },
  { id: "nastaliq-regular", label: "Urdu — Nastaliq Regular", family: "Noto Nastaliq Urdu", weight: 400, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 1.4, url: "/fonts/NotoNastaliqUrdu-Regular.ttf" },
  { id: "naskh", label: "Urdu — Naskh", family: "Noto Naskh Arabic", weight: 700, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 0.9, url: "/fonts/NotoNaskhArabic-Bold.ttf" },
  { id: "script", label: "English — Script", family: "Great Vibes", weight: 400, lang: "en", sample: "Laser Design", padFactor: 0.8, url: "/fonts/GreatVibes-Regular.ttf" },
  { id: "bold", label: "English — Bold", family: "Roboto", weight: 900, lang: "en", sample: "Laser Design", padFactor: 0.5, url: "/fonts/Roboto-Black.ttf" },
  { id: "serif", label: "English — Serif", family: "Noto Serif", weight: 700, lang: "en", sample: "Laser Design", padFactor: 0.5, url: "/fonts/NotoSerif-Bold.ttf" },
];

export const DEFAULT_FONT_ID = "nastaliq-bold";

export async function ensureFontsLoaded(): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};
  await Promise.all(
    FONTS.map(async (f) => {
      try {
        await document.fonts.load(`${f.weight} 64px "${f.family}"`, f.sample);
        status[f.id] = document.fonts.check(`${f.weight} 64px "${f.family}"`, f.sample);
      } catch {
        status[f.id] = false;
      }
    })
  );
  return status;
}