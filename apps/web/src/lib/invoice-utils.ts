export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface InvoiceParty {
  name: string;
  address: string;
  email: string;
}

export interface InvoiceCardData {
  invoiceNumber: string;
  date: string;
  dueDate: string;
  from: InvoiceParty;
  to: InvoiceParty;
  items: InvoiceLineItem[];
  taxRate: number;
  notes: string;
  status: InvoiceStatus;
}

export function createDefaultInvoiceData(): InvoiceCardData {
  const today = new Date();
  const due = new Date();
  due.setDate(due.getDate() + 30);

  return {
    invoiceNumber: 'INV-001',
    date: today.toISOString().slice(0, 10),
    dueDate: due.toISOString().slice(0, 10),
    from: { name: '', address: '', email: '' },
    to: { name: '', address: '', email: '' },
    items: [{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0 }],
    taxRate: 0,
    notes: '',
    status: 'draft',
  };
}

export function computeSubtotal(items: InvoiceLineItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
}

export function computeTax(subtotal: number, taxRate: number): number {
  return subtotal * (taxRate / 100);
}

export function computeTotal(subtotal: number, tax: number): number {
  return subtotal + tax;
}

export function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export async function exportInvoicePdf(data: InvoiceCardData, itemName: string): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });

  const pageW = doc.internal.pageSize.getWidth();
  let y = 50;

  // Title
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', 40, y);

  // Invoice number + dates (right-aligned)
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${data.invoiceNumber}`, pageW - 40, y - 10, { align: 'right' });
  doc.text(`Date: ${data.date}`, pageW - 40, y + 4, { align: 'right' });
  doc.text(`Due: ${data.dueDate}`, pageW - 40, y + 18, { align: 'right' });

  // Status badge
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(data.status.toUpperCase(), pageW - 40, y + 34, { align: 'right' });

  y += 60;

  // From / To
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('FROM', 40, y);
  doc.text('BILL TO', 300, y);
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);

  const fromLines = [data.from.name, data.from.address, data.from.email].filter(Boolean);
  const toLines = [data.to.name, data.to.address, data.to.email].filter(Boolean);
  const maxLines = Math.max(fromLines.length, toLines.length, 1);
  for (let i = 0; i < maxLines; i++) {
    const fl = fromLines[i];
    const tl = toLines[i];
    if (fl) doc.text(fl, 40, y);
    if (tl) doc.text(tl, 300, y);
    y += 14;
  }

  y += 20;

  // Table header
  doc.setFillColor(245, 245, 245);
  doc.rect(40, y - 12, pageW - 80, 18, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', 46, y);
  doc.text('Qty', 360, y, { align: 'right' });
  doc.text('Unit Price', 440, y, { align: 'right' });
  doc.text('Amount', pageW - 46, y, { align: 'right' });
  y += 18;

  // Line items
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const item of data.items) {
    const amount = item.quantity * item.unitPrice;
    doc.text(item.description || '—', 46, y);
    doc.text(String(item.quantity), 360, y, { align: 'right' });
    doc.text(formatCurrency(item.unitPrice), 440, y, { align: 'right' });
    doc.text(formatCurrency(amount), pageW - 46, y, { align: 'right' });
    y += 18;
  }

  y += 10;
  doc.setDrawColor(220, 220, 220);
  doc.line(40, y, pageW - 40, y);
  y += 20;

  // Totals
  const subtotal = computeSubtotal(data.items);
  const tax = computeTax(subtotal, data.taxRate);
  const total = computeTotal(subtotal, tax);

  doc.setFontSize(10);
  doc.text('Subtotal', 400, y, { align: 'right' });
  doc.text(formatCurrency(subtotal), pageW - 46, y, { align: 'right' });
  y += 16;
  doc.text(`Tax (${data.taxRate}%)`, 400, y, { align: 'right' });
  doc.text(formatCurrency(tax), pageW - 46, y, { align: 'right' });
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total', 400, y, { align: 'right' });
  doc.text(formatCurrency(total), pageW - 46, y, { align: 'right' });

  // Notes
  if (data.notes) {
    y += 40;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTES', 40, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    const noteLines = doc.splitTextToSize(data.notes, pageW - 80);
    doc.text(noteLines, 40, y);
  }

  const fileName = itemName.replace(/[^a-zA-Z0-9_-]/g, '_') || 'invoice';
  doc.save(`${fileName}.pdf`);
}
