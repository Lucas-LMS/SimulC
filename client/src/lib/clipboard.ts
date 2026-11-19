export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/bmp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

export const isSafeRasterImageMime = (mimeType: string): boolean =>
  ALLOWED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase().trim());

export const getImageFromClipboardData = (clipboardData: DataTransfer): File | null => {
  const file = Array.from(clipboardData.files).find((candidate) => isSafeRasterImageMime(candidate.type));
  if (file) return file;
  const item = Array.from(clipboardData.items).find((candidate) => isSafeRasterImageMime(candidate.type));
  return item?.getAsFile() ?? null;
};

/** Reads a copied bitmap after a user click; Ctrl+V remains a fallback for browsers that deny clipboard-read permission. */
export const readClipboardImage = async (): Promise<File | null> => {
  if (!navigator.clipboard?.read) {
    throw new Error("A leitura direta da área de transferência não está disponível neste navegador.");
  }
  const items = await navigator.clipboard.read();
  for (const item of items) {
    const mimeType = item.types.find((type) => isSafeRasterImageMime(type));
    if (!mimeType) continue;
    const blob = await item.getType(mimeType);
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([blob], `imagem-colada.${extension}`, { type: mimeType });
  }
  return null;
};
