import type { ImportedDocument } from "./models";
import { createId } from "./storage";
import { isSafeRasterImageMime } from "./clipboard";

export interface ImportProgress {
  stage: "reading" | "extracting" | "ocr" | "done";
  progress: number;
  detail: string;
}

export interface ParsedDocument extends ImportedDocument {
  pagesProcessed: number;
  pagesTotal: number;
  needsReview: true;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PDF_PAGES = 12;
const MAX_OCR_PAGES = 5;
const MIN_CANDIDATE_PRICE_CENTS = 10_000_00; // R$ 10.000,00
const MAX_CANDIDATE_PRICE_CENTS = 1_000_000_000; // R$ 10.000.000,00

export interface PositionedPdfTextItem {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

/**
 * Rebuild PDF.js text items into reading-order lines using stable row bucketing
 * instead of a non-transitive comparator.
 */
export const reconstructPdfText = (items: readonly PositionedPdfTextItem[]): string => {
  const positioned = items
    .filter((item) => item.str.trim())
    .map((item, index) => ({
      text: item.str.trim(),
      x: item.transform[4] ?? 0,
      y: item.transform[5] ?? 0,
      hasEOL: Boolean(item.hasEOL),
      index,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x || a.index - b.index);

  const rows: Array<{ y: number; items: typeof positioned }> = [];
  for (const item of positioned) {
    const existingRow = rows.find((row) => Math.abs(row.y - item.y) <= 2.5);
    if (existingRow) {
      existingRow.items.push(item);
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  const lines: string[] = [];
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x || a.index - b.index);
    const lineText = row.items.map((entry) => entry.text).join(" ").trim();
    if (lineText) lines.push(lineText);
  }
  return lines.join("\n");
};

const parsePriceToken = (value: string): number | null => {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
};

export const extractCandidates = (text: string): ImportedDocument["candidatePrices"] => {
  const results: ImportedDocument["candidatePrices"] = [];
  const seen = new Set<string>();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    const matches = [...line.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2}|,\d{1})|\d{4,}(?:,\d{2})?)/g)];
    for (const match of matches) {
      const token = match[1];
      const cents = parsePriceToken(token);
      if (cents === null || cents < MIN_CANDIDATE_PRICE_CENTS || cents > MAX_CANDIDATE_PRICE_CENTS) continue;
      const key = `${line}|${cents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ label: line.slice(0, 180), priceCents: cents, deliveryText: "", confirmed: false });
    }
  }
  return results.slice(0, 100);
};

let pdfjsReady: Promise<typeof import("pdfjs-dist")> | null = null;
const loadPdfJs = async () => {
  if (!pdfjsReady) {
    pdfjsReady = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]).then(([pdfjsLib, workerModule]) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      return pdfjsLib;
    });
  }
  return pdfjsReady;
};

const loadPdf = async (file: File, allowOCR: boolean, onProgress: (progress: ImportProgress) => void) => {
  const pdfjsLib = await loadPdfJs();
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  try {
    const pagesToRead = Math.min(pdf.numPages, MAX_PDF_PAGES);
    const pageTexts: string[] = [];
    onProgress({ stage: "extracting", progress: 0, detail: `Lendo texto de ${pagesToRead} de ${pdf.numPages} páginas.` });
    for (let pageNo = 1; pageNo <= pagesToRead; pageNo += 1) {
      const page = await pdf.getPage(pageNo);
      try {
        const textContent = await page.getTextContent();
        const items = textContent.items.filter(
          (item): item is typeof item & PositionedPdfTextItem =>
            "str" in item && "transform" in item && Array.isArray(item.transform),
        );
        pageTexts.push(reconstructPdfText(items));
      } finally {
        page.cleanup();
      }
      onProgress({
        stage: "extracting",
        progress: pageNo / pagesToRead,
        detail: `Texto da página ${pageNo}/${pagesToRead}.`,
      });
    }
    let text = pageTexts.join("\n\n").trim();
    let pagesProcessed = pagesToRead;

    if ((!text || text.length < 80) && allowOCR) {
      const { createWorker, PSM } = await import("tesseract.js");
      const ocrPages = Math.min(pagesToRead, MAX_OCR_PAGES);
      const worker = await createWorker("por", 1, {
        logger: (message) => {
          if (message.status === "recognizing text") {
            onProgress({
              stage: "ocr",
              progress: message.progress ?? 0,
              detail: `OCR da tabela: ${Math.round((message.progress ?? 0) * 100)}%.`,
            });
          }
        },
      });
      const scanned: string[] = [];
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
        for (let pageNo = 1; pageNo <= ocrPages; pageNo += 1) {
          const page = await pdf.getPage(pageNo);
          const canvas = document.createElement("canvas");
          try {
            const viewport = page.getViewport({ scale: 1.8 });
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const context = canvas.getContext("2d");
            if (!context) continue;
            await page.render({ canvasContext: context, viewport }).promise;
            const result = await worker.recognize(canvas);
            scanned.push(result.data.text);
            onProgress({
              stage: "ocr",
              progress: pageNo / ocrPages,
              detail: `OCR da página ${pageNo}/${ocrPages}.`,
            });
          } finally {
            canvas.width = 0;
            canvas.height = 0;
            page.cleanup();
          }
        }
        text = scanned.join("\n\n").trim();
        pagesProcessed = ocrPages;
      } finally {
        await worker.terminate();
      }
    }
    return { text, pagesTotal: pdf.numPages, pagesProcessed };
  } finally {
    await pdf.destroy();
  }
};

const loadImage = async (
  file: File,
  onProgress: (progress: ImportProgress) => void,
): Promise<{ text: string; pagesTotal: number; pagesProcessed: number }> => {
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("por", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress({
          stage: "ocr",
          progress: message.progress ?? 0,
          detail: `OCR da imagem: ${Math.round((message.progress ?? 0) * 100)}%.`,
        });
      }
    },
  });
  let tempCanvas: HTMLCanvasElement | null = null;
  try {
    let source: File | HTMLCanvasElement = file;
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      try {
        const longestSide = Math.max(bitmap.width, bitmap.height);
        const scale = Math.min(3, 3200 / Math.max(1, longestSide));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (context) {
          context.filter = "grayscale(1) contrast(1.28) brightness(1.03)";
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = "high";
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          source = canvas;
          tempCanvas = canvas;
        }
      } finally {
        bitmap.close();
      }
    }

    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
    const primary = (await worker.recognize(source)).data.text.trim();
    if (primary.length >= 80) {
      return { text: primary, pagesTotal: 1, pagesProcessed: 1 };
    }

    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, preserve_interword_spaces: "1" });
    const fallback = (await worker.recognize(source)).data.text.trim();
    const readings = [...new Set([primary, fallback].filter(Boolean))];
    return { text: readings.join("\n\n"), pagesTotal: 1, pagesProcessed: 1 };
  } finally {
    if (tempCanvas) {
      tempCanvas.width = 0;
      tempCanvas.height = 0;
    }
    await worker.terminate();
  }
};

export const parseTableFile = async (
  file: File,
  runOCR: boolean,
  onProgress: (progress: ImportProgress) => void,
): Promise<ParsedDocument> => {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Arquivo acima de 25 MB. Divida a tabela em arquivos menores para importação.");
  }
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = isSafeRasterImageMime(file.type);
  if (!isPdf && !isImage) {
    throw new Error("Formato não suportado. Envie PDF ou imagem raster (JPG, PNG, WebP, BMP, GIF ou HEIC).");
  }
  onProgress({ stage: "reading", progress: 0, detail: "Preparando arquivo no navegador." });
  const parsed = isPdf ? await loadPdf(file, runOCR, onProgress) : await loadImage(file, onProgress);
  onProgress({ stage: "done", progress: 1, detail: "Extração concluída. Revise os dados antes de gravar." });
  const now = new Date().toISOString();
  return {
    id: createId("doc"),
    name: file.name,
    mimeType: file.type || (isPdf ? "application/pdf" : "image/png"),
    sizeBytes: file.size,
    importedAt: now,
    tableDate: now.slice(0, 10),
    source: file.name,
    rawText: parsed.text,
    note: "Extração/OCR local. Os campos abaixo são rascunhos e precisam ser revisados contra o arquivo original.",
    status: "draft",
    candidatePrices: extractCandidates(parsed.text),
    pagesProcessed: parsed.pagesProcessed,
    pagesTotal: parsed.pagesTotal,
    needsReview: true,
  };
};
