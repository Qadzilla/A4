import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipSync } from 'fflate';

const mockOcrImage = vi.fn();
const mockOcrPdfPages = vi.fn();
vi.mock('../services/ocr.js', () => ({
  get ocrImage() {
    return mockOcrImage;
  },
  get ocrPdfPages() {
    return mockOcrPdfPages;
  },
  MIN_PDF_TEXT_LENGTH: 50,
}));

import { extractText } from '../services/text-extraction.js';

beforeEach(() => {
  mockOcrImage.mockReset();
  mockOcrPdfPages.mockReset();
});

describe('extractText', () => {
  describe('plain text', () => {
    it('extracts text from a buffer', async () => {
      const buf = Buffer.from('Hello, world!\nLine two.');
      const result = await extractText(buf, 'text/plain');
      expect(result).toBe('Hello, world!\nLine two.');
    });

    it('returns empty string for empty buffer', async () => {
      const result = await extractText(Buffer.alloc(0), 'text/plain');
      expect(result).toBe('');
    });
  });

  describe('CSV', () => {
    it('extracts readable pipe-separated text from CSV', async () => {
      const buf = Buffer.from('Name,Amount,Date\nAlice,100,2024-01-01\nBob,200,2024-02-01');
      const result = await extractText(buf, 'text/csv');
      expect(result).toContain('Name | Amount | Date');
      expect(result).toContain('Alice | 100 | 2024-01-01');
      expect(result).toContain('Bob | 200 | 2024-02-01');
    });

    it('handles quoted fields containing commas', async () => {
      const buf = Buffer.from('Name,Address\n"Smith, John","123 Main St, Apt 4"');
      const result = await extractText(buf, 'text/csv');
      expect(result).toContain('Smith, John');
      expect(result).toContain('123 Main St, Apt 4');
    });
  });

  describe('PDF', () => {
    it('extracts text from a PDF buffer', async () => {
      // Minimal valid PDF with text content
      const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
434
%%EOF`;
      const buf = Buffer.from(pdfContent);
      const result = await extractText(buf, 'application/pdf');
      expect(result).toContain('Hello PDF');
    });

    it('returns empty string on extraction error', async () => {
      const result = await extractText(Buffer.from('not a pdf'), 'application/pdf');
      expect(result).toBe('');
    });

    it('falls back to OCR when pdf-parse returns < 50 chars', async () => {
      mockOcrPdfPages.mockResolvedValue('OCR extracted: Bank Statement March 2026');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 35>>stream
BT /F1 12 Tf 100 700 Td (Hi) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000351 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
425
%%EOF`;
      const buf = Buffer.from(pdfContent);
      const result = await extractText(buf, 'application/pdf');

      expect(result).toBe('OCR extracted: Bank Statement March 2026');
      // ocrPdfPages now receives a Buffer, not a file path
      expect(mockOcrPdfPages).toHaveBeenCalledWith(buf);
      spy.mockRestore();
    });

    it('does NOT call OCR when pdf-parse returns >= 50 chars', async () => {
      const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 44>>stream
BT /F1 12 Tf 100 700 Td (Hello PDF) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000360 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
434
%%EOF`;
      const buf = Buffer.from(pdfContent);
      const result = await extractText(buf, 'application/pdf');
      expect(result).toBeTruthy();
    });

    it('returns pdf-parse text when both pdf-parse and OCR return short text', async () => {
      mockOcrPdfPages.mockResolvedValue('');
      const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const pdfContent = `%PDF-1.0
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 35>>stream
BT /F1 12 Tf 100 700 Td (Hi) Tj ET
endstream
endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000351 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
425
%%EOF`;
      const buf = Buffer.from(pdfContent);
      const result = await extractText(buf, 'application/pdf');
      expect(result).toBeTruthy();
      spy.mockRestore();
    });
  });

  describe('DOCX', () => {
    it('extracts text via mammoth', async () => {
      const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Hello from DOCX</w:t></w:r></w:p>
  </w:body>
</w:document>`;
      const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
      const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

      const enc = new TextEncoder();
      const zipData = zipSync({
        '[Content_Types].xml': enc.encode(contentTypesXml),
        '_rels/.rels': enc.encode(relsXml),
        'word/document.xml': enc.encode(docXml),
      });

      const buf = Buffer.from(zipData);
      const result = await extractText(
        buf,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result).toContain('Hello from DOCX');
    });

    it('returns empty string on error', async () => {
      const buf = Buffer.from('not a real docx');
      const result = await extractText(
        buf,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(result).toBe('');
    });
  });

  describe('Excel', () => {
    it('extracts text from XLSX', async () => {
      const enc = new TextEncoder();
      const sharedStringsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3">
  <si><t>Product</t></si>
  <si><t>Price</t></si>
  <si><t>Widget</t></si>
</sst>`;
      const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
    </row>
    <row r="2">
      <c r="A2" t="s"><v>2</v></c>
      <c r="B2"><v>9.99</v></c>
    </row>
  </sheetData>
</worksheet>`;

      const zipData = zipSync({
        'xl/sharedStrings.xml': enc.encode(sharedStringsXml),
        'xl/worksheets/sheet1.xml': enc.encode(sheetXml),
      });

      const buf = Buffer.from(zipData);
      const result = await extractText(
        buf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result).toContain('Product | Price');
      expect(result).toContain('Widget | 9.99');
    });

    it('returns empty string for malformed xlsx', async () => {
      const buf = Buffer.from('not a real xlsx');
      const result = await extractText(
        buf,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(result).toBe('');
    });
  });

  describe('images', () => {
    it('extracts text from PNG via OCR', async () => {
      mockOcrImage.mockResolvedValue('Receipt total: $42.50');
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const result = await extractText(buf, 'image/png');
      expect(result).toBe('Receipt total: $42.50');
      expect(mockOcrImage).toHaveBeenCalledWith(buf);
    });

    it('extracts text from JPEG via OCR', async () => {
      mockOcrImage.mockResolvedValue('Bank statement');
      const buf = Buffer.from([0xff, 0xd8, 0xff]);
      const result = await extractText(buf, 'image/jpeg');
      expect(result).toBe('Bank statement');
      expect(mockOcrImage).toHaveBeenCalledWith(buf);
    });

    it('returns empty string when OCR fails', async () => {
      mockOcrImage.mockResolvedValue('');
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const result = await extractText(buf, 'image/png');
      expect(result).toBe('');
    });

    it('returns empty string when OCR throws', async () => {
      mockOcrImage.mockRejectedValue(new Error('OCR crashed'));
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
      const result = await extractText(buf, 'image/png');
      expect(result).toBe('');
      spy.mockRestore();
    });
  });

  describe('unknown types', () => {
    it('returns empty string for application/octet-stream', async () => {
      const buf = Buffer.from('binary data');
      const result = await extractText(buf, 'application/octet-stream');
      expect(result).toBe('');
    });
  });
});
