export interface FontDef {
  id: string;
  label: string;
  family: string;
  weight: number;
  lang: "ur" | "en";
  sample: string;
  /** extra vertical padding factor (Nastaliq has deep descenders) */
  padFactor: number;
}

export const FONTS: FontDef[] = [
  { id: "nastaliq-bold", label: "Urdu — Nastaliq Bold", family: "Noto Nastaliq Urdu", weight: 700, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 1.4 },
  { id: "nastaliq-regular", label: "Urdu — Nastaliq Regular", family: "Noto Nastaliq Urdu", weight: 400, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 1.4 },
  { id: "naskh", label: "Urdu — Naskh", family: "Noto Naskh Arabic", weight: 700, lang: "ur", sample: "لیزر ڈیزائن", padFactor: 0.9 },
  { id: "script", label: "English — Script", family: "Great Vibes", weight: 400, lang: "en", sample: "Laser Design", padFactor: 0.8 },
  { id: "bold", label: "English — Bold", family: "Roboto", weight: 900, lang: "en", sample: "Laser Design", padFactor: 0.5 },
  { id: "serif", label: "English — Serif", family: "Noto Serif", weight: 700, lang: "en", sample: "Laser Design", padFactor: 0.5 },
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
