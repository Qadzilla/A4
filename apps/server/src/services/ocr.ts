export const MIN_PDF_TEXT_LENGTH = 50;
const MAX_OCR_PAGES = 10;
const PDF_RENDER_SCALE = 4; // 4x scale — better recognition of thin characters like minus signs

export async function ocrImage(input: string | Buffer): Promise<string> {
  try {
    const { createWorker, PSM } = await import('tesseract.js');
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    try {
      const { data } = await worker.recognize(input);
      return data.text.trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn('[ocr] Image OCR failed:', err);
    return '';
  }
}

export async function ocrPdfPages(buffer: Buffer): Promise<string> {
  try {
    const mupdf = await import('mupdf');
    const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
    const pageCount = Math.min(doc.countPages(), MAX_OCR_PAGES);

    if (pageCount === 0) {
      return '';
    }

    // Render each page to PNG
    const pngBuffers: Buffer[] = [];
    const matrix = mupdf.Matrix.scale(PDF_RENDER_SCALE, PDF_RENDER_SCALE);
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
      const png = pixmap.asPNG();
      pngBuffers.push(Buffer.from(png));
    }

    // OCR all pages with a single worker
    const { createWorker, PSM } = await import('tesseract.js');
    const worker = await createWorker('eng');
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    });
    try {
      const pages: string[] = [];
      for (const png of pngBuffers) {
        const { data } = await worker.recognize(png);
        const text = data.text.trim();
        if (text) pages.push(text);
      }
      return pages.join('\n\n');
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    console.warn('[ocr] PDF OCR failed:', err);
    return '';
  }
}
