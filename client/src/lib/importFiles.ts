import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker, PSM } from "tesseract.js";
import type { ImportedDocument } from "./models";
import { createId } from "./storage";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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

export interface PositionedPdfTextItem {
  str: string;
  transform: number[];
  hasEOL?: boolean;
}

/** Rebuild PDF.js text items into reading-order lines instead of flattening away spatial structure. */
export const reconstructPdfText = (items: readonly PositionedPdfTextItem[]): string => {
  const positioned = items.filter((item) => item.str.trim()).map((item, index) => ({
    text: item.str.trim(), x: item.transform[4] ?? 0, y: item.transform[5] ?? 0,
    hasEOL: Boolean(item.hasEOL), index,
  })).sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x || a.index - b.index);
  const lines: string[] = [];
  let current = "";
  let currentY: number | null = null;
  for (const item of positioned) {
    if (currentY !== null && Math.abs(item.y - currentY) > 2) {
      if (current.trim()) lines.push(current.trim());
      current = "";
    }
    current = current ? `${current} ${item.text}` : item.text;
    currentY = item.y;
    if (item.hasEOL) {
      lines.push(current.trim());
      current = "";
      currentY = null;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines.join("\n");
};

const extractCandidates = (text: string): ImportedDocument["candidatePrices"] => {
  const results: ImportedDocument["candidatePrices"] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const matches = [...line.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2}|,\d{1})|\d{4,}(?:,\d{2})?)/g)];
    for (const match of matches) {
      const token = match[1];
      const cents = parsePriceToken(token);
      if (cents === null || cents < 10_000_00 || cents > 100_000_000) continue;
      const key = `${line}|${cents}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ label: line.slice(0, 180), priceCents: cents, deliveryText: "", confirmed: false });
    }
  }
  return results.slice(0, 100);
};

const parsePriceToken = (value: string): number | null => {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
};

const loadPdf = async (file: File, allowOCR: boolean, onProgress: (progress: ImportProgress) => void) => {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pagesToRead = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const pageTexts: string[] = [];
  onProgress({ stage: "extracting", progress: 0, detail: `Lendo texto de ${pagesToRead} de ${pdf.numPages} páginas.` });
  for (let pageNo = 1; pageNo <= pagesToRead; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter((item): item is typeof item & PositionedPdfTextItem =>
      "str" in item && "transform" in item && Array.isArray(item.transform));
    pageTexts.push(reconstructPdfText(items));
    onProgress({ stage: "extracting", progress: pageNo / pagesToRead, detail: `Texto da página ${pageNo}/${pagesToRead}.` });
  }
  let text = pageTexts.join("\n\n").trim();
  let pagesProcessed = pagesToRead;
  if ((!text || text.length < 80) && allowOCR) {
    const ocrPages = Math.min(pagesToRead, MAX_OCR_PAGES);
    const worker = await createWorker("por", 1, {
      logger: (message) => {
        if (message.status === "recognizing text") {
          onProgress({ stage: "ocr", progress: message.progress ?? 0, detail: `OCR da tabela: ${Math.round((message.progress ?? 0) * 100)}%.` });
        }
      },
    });
    const scanned: string[] = [];
    try {
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: "1" });
      for (let pageNo = 1; pageNo <= ocrPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale: 1.8 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({ canvas, canvasContext: context, viewport } as Parameters<typeof page.render>[0]).promise;
        const result = await worker.recognize(canvas);
        scanned.push(result.data.text);
        onProgress({ stage: "ocr", progress: pageNo / ocrPages, detail: `OCR da página ${pageNo}/${ocrPages}.` });
      }
      text = scanned.join("\n\n").trim();
      pagesProcessed = ocrPages;
    } finally {
      await worker.terminate();
    }
  }
  return { text, pagesTotal: pdf.numPages, pagesProcessed };
};

const loadImage = async (
  file: File,
  onProgress: (progress: ImportProgress) => void,
): Promise<{ text: string; pagesTotal: number; pagesProcessed: number }> => {
  const worker = await createWorker("por", 1, {
    logger: (message) => {
      if (message.status === "recognizing text") {
        onProgress({ stage: "ocr", progress: message.progress ?? 0, detail: `OCR da imagem: ${Math.round((message.progress ?? 0) * 100)}%.` });
      }
    },
  });
  try {
    let source: File | HTMLCanvasElement = file;
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
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
      }
      bitmap.close();
    }

    const readings: string[] = [];
    for (const mode of [PSM.SPARSE_TEXT, PSM.AUTO]) {
      await worker.setParameters({ tessedit_pageseg_mode: mode, preserve_interword_spaces: "1" });
      const result = await worker.recognize(source);
      if (result.data.text.trim()) readings.push(result.data.text.trim());
    }
    return { text: [...new Set(readings)].join("\n\n"), pagesTotal: 1, pagesProcessed: 1 };
  } finally {
    await worker.terminate();
  }
};

export const parseTableFile = async (
  file: File,
  runOCR: boolean,
  onProgress: (progress: ImportProgress) => void,
): Promise<ParsedDocument> => {
  if (file.size > MAX_FILE_BYTES) throw new Error("Arquivo acima de 25 MB. Divida a tabela em arquivos menores para importação.");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isImage = file.type.startsWith("image/");
  if (!isPdf && !isImage) throw new Error("Formato não suportado. Envie PDF, JPG, PNG, WebP ou outra imagem.");
  onProgress({ stage: "reading", progress: 0, detail: "Preparando arquivo no navegador." });
  const parsed = isPdf
    ? await loadPdf(file, runOCR, onProgress)
    : await loadImage(file, onProgress);
  onProgress({ stage: "done", progress: 1, detail: "Extração concluída. Revise os dados antes de gravar." });
  const now = new Date().toISOString();
  return {
    id: createId("doc"),
    name: file.name,
    mimeType: file.type || (isPdf ? "application/pdf" : "image/*"),
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
