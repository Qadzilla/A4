import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRecognize = vi.fn();
const mockTerminate = vi.fn();
const mockSetParameters = vi.fn();
const mockCreateWorker = vi.fn();

vi.mock('tesseract.js', () => ({
  createWorker: (...args: any[]) => mockCreateWorker(...args),
  PSM: { SINGLE_BLOCK: 6 },
}));

const mockToPixmap = vi.fn();
const mockAsPNG = vi.fn();
const mockLoadPage = vi.fn();
const mockCountPages = vi.fn();
const mockOpenDocument = vi.fn();

vi.mock('mupdf', () => ({
  Document: {
    openDocument: (...args: any[]) => mockOpenDocument(...args),
  },
  Matrix: {
    scale: (x: number, y: number) => [x, 0, 0, y, 0, 0],
  },
  ColorSpace: {
    DeviceRGB: 'DeviceRGB',
  },
}));

import { ocrImage, ocrPdfPages } from '../services/ocr.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateWorker.mockResolvedValue({
    recognize: mockRecognize,
    terminate: mockTerminate,
    setParameters: mockSetParameters,
  });
  mockTerminate.mockResolvedValue(undefined);
  mockSetParameters.mockResolvedValue(undefined);

  mockAsPNG.mockReturnValue(new Uint8Array([1, 2, 3]));
  mockToPixmap.mockReturnValue({ asPNG: mockAsPNG });
  mockLoadPage.mockReturnValue({ toPixmap: mockToPixmap });
  mockCountPages.mockReturnValue(2);
  mockOpenDocument.mockReturnValue({
    countPages: mockCountPages,
    loadPage: mockLoadPage,
  });
});

describe('ocrImage', () => {
  it('returns recognized text from image file path', async () => {
    mockRecognize.mockResolvedValue({ data: { text: '  Receipt total: $42.50  ' } });

    const result = await ocrImage('/path/to/receipt.jpg');

    expect(result).toBe('Receipt total: $42.50');
    expect(mockCreateWorker).toHaveBeenCalledWith('eng');
    expect(mockSetParameters).toHaveBeenCalledWith({
      tessedit_pageseg_mode: 6,
      preserve_interword_spaces: '1',
    });
    expect(mockRecognize).toHaveBeenCalledWith('/path/to/receipt.jpg');
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('returns empty string when Tesseract fails', async () => {
    mockCreateWorker.mockRejectedValue(new Error('worker init failed'));

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ocrImage('/path/to/bad.jpg');

    expect(result).toBe('');
    spy.mockRestore();
  });

  it('terminates worker even on recognition failure', async () => {
    mockRecognize.mockRejectedValue(new Error('recognition error'));

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ocrImage('/path/to/corrupt.jpg');

    expect(result).toBe('');
    expect(mockTerminate).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('ocrPdfPages', () => {
  it('renders PDF pages and OCRs each one', async () => {
    mockCountPages.mockReturnValue(2);
    mockRecognize
      .mockResolvedValueOnce({ data: { text: 'Page 1 text' } })
      .mockResolvedValueOnce({ data: { text: 'Page 2 text' } });

    const buf = Buffer.from('fake-pdf');
    const result = await ocrPdfPages(buf);

    expect(result).toBe('Page 1 text\n\nPage 2 text');
    expect(mockOpenDocument).toHaveBeenCalledWith(buf, 'application/pdf');
    expect(mockSetParameters).toHaveBeenCalledWith({
      tessedit_pageseg_mode: 6,
      preserve_interword_spaces: '1',
    });
    expect(mockLoadPage).toHaveBeenCalledTimes(2);
    expect(mockLoadPage).toHaveBeenCalledWith(0);
    expect(mockLoadPage).toHaveBeenCalledWith(1);
    expect(mockRecognize).toHaveBeenCalledTimes(2);
    expect(mockTerminate).toHaveBeenCalled();
  });

  it('respects MAX_OCR_PAGES limit (caps at 10)', async () => {
    mockCountPages.mockReturnValue(25);
    mockRecognize.mockResolvedValue({ data: { text: 'text' } });

    await ocrPdfPages(Buffer.from('fake-pdf'));

    expect(mockLoadPage).toHaveBeenCalledTimes(10);
  });

  it('returns empty string when document has no pages', async () => {
    mockCountPages.mockReturnValue(0);

    const result = await ocrPdfPages(Buffer.from('fake-pdf'));

    expect(result).toBe('');
    expect(mockCreateWorker).not.toHaveBeenCalled();
  });

  it('returns empty string when mupdf fails', async () => {
    mockOpenDocument.mockImplementation(() => {
      throw new Error('corrupt PDF');
    });

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await ocrPdfPages(Buffer.from('bad-pdf'));

    expect(result).toBe('');
    spy.mockRestore();
  });

  it('reuses single worker across all pages, terminates after', async () => {
    mockCountPages.mockReturnValue(3);
    mockRecognize.mockResolvedValue({ data: { text: 'text' } });

    await ocrPdfPages(Buffer.from('fake-pdf'));

    expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    expect(mockRecognize).toHaveBeenCalledTimes(3);
    expect(mockTerminate).toHaveBeenCalledTimes(1);
  });
});
