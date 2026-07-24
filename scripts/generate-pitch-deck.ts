/**
 * A4 Pitch Deck PDF Generator
 *
 * Generates a 17-page 16:9 pitch deck with landing page design elements:
 * dot grids, card panels, workflow SVGs, connector paths, window chrome, etc.
 *
 * Usage: npx tsx scripts/generate-pitch-deck.ts
 * Output: ~/Desktop/A4_Pitch_Deck_v2.pdf
 */

import PDFDocument from "pdfkit";
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Constants ───────────────────────────────────────────────────────────────

const W = 1920;
const H = 1080;
const OUT = path.join(process.env.HOME || "~", "Desktop", "A4_Pitch_Deck_v2.pdf");

// Colors
const C = {
  bg: "#0A0A0A",
  bg2: "#0D0D0D",
  bg3: "#111111",
  bg4: "#161616",
  primary: "#10B981",
  white: "#FFFFFF",
  blue: "#3B82F6",
  amber: "#F59E0B",
  red: "#F87171",
  purple: "#A855F7",
};

// Fonts
const FONTS_DIR = path.join(__dirname, "fonts");
const F = {
  sans: path.join(FONTS_DIR, "DMSans-Variable.ttf"),
  mono: path.join(FONTS_DIR, "IBMPlexMono-Regular.ttf"),
  monoMed: path.join(FONTS_DIR, "IBMPlexMono-Medium.ttf"),
  monoBold: path.join(FONTS_DIR, "IBMPlexMono-Bold.ttf"),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Blend a hex color toward the dark bg at given alpha (PDFKit doesn't support alpha hex) */
function blend(color: string, alpha: number, bgColor = "#0A0A0A"): string {
  const parse = (c: string) => {
    const h = c.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  };
  const [fr, fg, fb] = parse(color);
  const [br, bg2, bb] = parse(bgColor);
  const r = Math.round(br + (fr - br) * alpha);
  const g = Math.round(bg2 + (fg - bg2) * alpha);
  const b = Math.round(bb + (fb - bb) * alpha);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Alias — all existing hex(color, alpha) calls should produce blended colors */
const hex = blend;

function drawDotGrid(doc: PDFKit.PDFDocument, x0: number, y0: number, w: number, h: number, spacing = 32, radius = 1.2, opacity = 0.12) {
  doc.save();
  doc.opacity(opacity);
  doc.fillColor(C.white);
  for (let x = x0; x < x0 + w; x += spacing) {
    for (let y = y0; y < y0 + h; y += spacing) {
      doc.circle(x, y, radius).fill();
    }
  }
  doc.restore();
}

function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, scale = 1) {
  doc.save();
  const s = scale;
  doc.circle(x, y + 10 * s, 5 * s).fill(C.primary);
  doc.font(F.sans).fontSize(16 * s).fillColor(C.white);
  doc.text("A4", x + 12 * s, y, { lineBreak: false });
  doc.restore();
}

function drawSectionBadge(doc: PDFKit.PDFDocument, x: number, y: number, text: string) {
  const w = doc.font(F.mono).fontSize(11).widthOfString(text) + 36;
  const h = 28;
  doc.save();
  // Fill bg
  doc.roundedRect(x, y, w, h, 14).fill(C.bg4);
  // Subtle border
  doc.opacity(0.1);
  doc.roundedRect(x, y, w, h, 14).lineWidth(1).strokeColor(C.white).stroke();
  doc.opacity(1);
  // Emerald dot
  doc.circle(x + 14, y + h / 2, 3).fill(C.primary);
  // Text
  doc.font(F.mono).fontSize(11).fillColor(blend(C.white, 0.6));
  doc.text(text, x + 24, y + 8, { lineBreak: false });
  doc.restore();
}

function drawCardPanel(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, opts?: { accentTop?: boolean; bg?: string; radius?: number; borderColor?: string }) {
  const bg = opts?.bg ?? C.bg4;
  const r = opts?.radius ?? 6;
  const bc = opts?.borderColor ?? blend(C.white, 0.1);
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill(bg);
  doc.roundedRect(x, y, w, h, r).lineWidth(1).strokeColor(bc).stroke();
  if (opts?.accentTop) {
    doc.rect(x, y, w, 2).fill(blend(C.primary, 0.4));
  }
  doc.restore();
}

function drawHeroFrame(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.save();
  // Light top-left
  doc.opacity(0.2);
  doc.moveTo(x, y + h).lineTo(x, y).lineTo(x + w, y);
  doc.lineWidth(1.5).strokeColor(C.primary).stroke();
  // Heavy bottom-right
  doc.opacity(1);
  doc.moveTo(x + w, y).lineTo(x + w, y + h).lineTo(x, y + h);
  doc.lineWidth(2.5).strokeColor(C.primary).stroke();
  doc.restore();
}

function drawWindowChrome(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h = 32, label?: string) {
  doc.save();
  doc.rect(x, y, w, h).fill(C.bg4);
  doc.rect(x, y + h - 1, w, 1).fill(blend(C.white, 0.1));
  for (let i = 0; i < 3; i++) {
    doc.circle(x + 16 + i * 16, y + h / 2, 5).fill(blend(C.white, 0.2));
  }
  if (label) {
    doc.font(F.mono).fontSize(10).fillColor(blend(C.white, 0.3));
    doc.text(label, x + 70, y + h / 2 - 5, { lineBreak: false });
  }
  doc.restore();
}

function drawConnectorPath(doc: PDFKit.PDFDocument, path_d: string, color = C.primary, width = 2, opacity = 0.5) {
  doc.save();
  doc.opacity(opacity);
  doc.path(path_d).lineWidth(width).strokeColor(color).stroke();
  doc.restore();
}

function drawPageFooter(doc: PDFKit.PDFDocument, leftText: string, pageNum: number) {
  const y = H - 40;
  doc.save();
  doc.rect(0, y - 5, W, 1).fill(blend(C.white, 0.05));
  doc.font(F.mono).fontSize(11).fillColor(blend(C.white, 0.3));
  doc.text(leftText, 100, y + 5, { lineBreak: false });
  doc.text(pageNum.toString().padStart(2, "0"), W - 140, y + 5, { lineBreak: false, align: "right", width: 40 });
  doc.restore();
}

function drawPageHeader(doc: PDFKit.PDFDocument, sectionNum: string, sectionName: string) {
  drawLogo(doc, 100, 30);
  doc.font(F.mono).fontSize(12).fillColor(C.primary);
  doc.text(sectionNum, W - 350, 35, { lineBreak: false, width: 250, align: "right" });
  doc.fillColor(blend(C.white, 0.5));
  doc.text(`  ·  ${sectionName}`, W - 350 + doc.widthOfString(sectionNum), 35, { lineBreak: false });
}

function drawSectionLabel(doc: PDFKit.PDFDocument, x: number, y: number, text: string) {
  doc.save();
  doc.rect(x, y + 6, 28, 2).fill(C.primary);
  doc.font(F.mono).fontSize(13).fillColor(blend(C.white, 0.4));
  doc.text(text, x + 38, y, { lineBreak: false });
  doc.restore();
}

function newSlide(doc: PDFKit.PDFDocument) {
  doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill(C.bg);
}

// ─── Slide Functions ─────────────────────────────────────────────────────────

function slide01_Cover(doc: PDFKit.PDFDocument) {
  // Background with dot grid
  doc.rect(0, 0, W, H).fill(C.bg);
  drawDotGrid(doc, 0, 0, W, H, 40, 1, 0.06);

  // Badge
  const badgeText = "PITCH DECK · 2026";
  const badgeW = 200;
  drawSectionBadge(doc, W / 2 - badgeW / 2, 120, badgeText);

  // Hero frame with A4 logo
  const frameW = 200;
  const frameH = 240;
  const frameX = W / 2 - frameW / 2;
  const frameY = 190;
  drawHeroFrame(doc, frameX, frameY, frameW, frameH);

  // A4 text inside frame
  doc.font(F.sans).fontSize(90).fillColor(C.primary);
  doc.text("A", frameX + 25, frameY + 55, { lineBreak: false, continued: false });
  doc.font(F.sans).fontSize(90).fillColor(C.white);
  doc.text("4", frameX + 100, frameY + 55, { lineBreak: false });

  // Emerald accent line under logo
  doc.rect(frameX + 55, frameY + frameH - 20, 90, 3).fill(C.primary);

  // Tagline
  doc.font(F.sans).fontSize(36).fillColor(C.white);
  const tagline = "The AI-powered financial workspace that replaces the spreadsheets, dashboards,\nand advisors that small businesses and individuals can't afford.";
  doc.text(tagline, 200, 480, { width: W - 400, align: "center", lineGap: 8 });

  // Subtitle
  doc.font(F.sans).fontSize(18).fillColor(hex(C.white, 0.5));
  const sub = "Most people and small businesses manage their finances across a mess of spreadsheets, bank apps, and disconnected tools — losing thousands to blind spots that a CFO or advisor would catch in minutes. But CFOs cost $150k+ and advisors won't touch small accounts.";
  doc.text(sub, 280, 620, { width: W - 560, align: "center", lineGap: 6 });

  doc.font(F.sans).fontSize(18).fillColor(C.white);
  doc.text("We're building the AI that will.", 280, 710, { width: W - 560, align: "center" });

  // Bottom emerald line
  doc.rect(W / 2 - 80, H - 20, 160, 3).fill(C.primary);
}

function slide02_OneLiner(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "01", "ONE-LINER");
  drawDotGrid(doc, 0, 0, W, H, 48, 0.8, 0.03);

  drawSectionLabel(doc, 100, 280, "ONE-LINER");

  doc.font(F.sans).fontSize(42).fillColor(C.white);
  doc.text("Most people and small businesses manage their finances across a mess of spreadsheets, bank apps, and disconnected tools — ", 100, 330, {
    width: W - 200,
    lineGap: 12,
    continued: true,
  });
  doc.fillColor(C.primary);
  doc.text("losing thousands to blind spots", { continued: true });
  doc.fillColor(C.white);
  doc.text(" that a CFO or advisor would catch in minutes. But CFOs cost ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("$150k+", { continued: true });
  doc.fillColor(C.white);
  doc.text(" and advisors won't touch small accounts. We're building the AI that will.");

  drawPageFooter(doc, "A4 · FINANCIAL WORKSPACE FOR EVERYONE", 2);
}

function slide03_Problem(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "02", "THE PROBLEM");
  drawDotGrid(doc, 0, 0, W, H, 48, 0.8, 0.03);

  drawSectionLabel(doc, 100, 110, "THE PROBLEM");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Financial Blindness ", 100, 150, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("at Every Scale", { lineBreak: false });

  doc.font(F.sans).fontSize(17).fillColor(hex(C.white, 0.6));
  doc.text(
    "A freelancer with three income streams, a small business owner with $400k in annual revenue, an individual trying to coordinate a 401(k), a brokerage account, student loans, and a budget — none of them have a unified view of their financial life. The tools that exist force them to choose: oversimplified consumer apps that track spending but can't model scenarios, or enterprise software that costs more than their accountant.",
    100, 230, { width: W - 200, lineGap: 6 }
  );

  doc.font(F.sans).fontSize(17).fillColor(C.white);
  doc.text("The damage is constant and compounding:", 100, 340, { width: W - 200 });

  // Card 1: Fragmentation drag
  const cardY = 390;
  const cardW = (W - 260) / 2;
  const cardH = 220;

  drawCardPanel(doc, 100, cardY, cardW, cardH, { bg: C.bg3 });
  // Left emerald accent bar
  doc.rect(100, cardY, 3, cardH).fill(C.primary);
  doc.circle(128, cardY + 30, 4).fill(C.primary);
  doc.font(F.sans).fontSize(19).fillColor(C.white);
  doc.text("Fragmentation drag.", 140, cardY + 22, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text(
    "The average small business owner checks four different platforms to understand their cash position. Invoices in one tool, expenses in another, bank balances in a third, tax estimates on a napkin. Every context switch is a decision delayed, and delayed financial decisions have dollar costs.",
    128, cardY + 60, { width: cardW - 60, lineGap: 5 }
  );

  // Card 2: Analytical poverty
  const card2X = 100 + cardW + 60;
  drawCardPanel(doc, card2X, cardY, cardW, cardH, { bg: C.bg3 });
  doc.rect(card2X, cardY, 3, cardH).fill(C.primary);
  doc.circle(card2X + 28, cardY + 30, 4).fill(C.primary);
  doc.font(F.sans).fontSize(19).fillColor(C.white);
  doc.text("Analytical poverty.", card2X + 40, cardY + 22, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text(
    '"What happens if I hire in Q3?" "Can I afford to prepay this debt?" "Am I actually profitable after owner\'s comp?" These are ',
    card2X + 28, cardY + 60, { width: cardW - 60, lineGap: 5, continued: true }
  );
  doc.fillColor(C.primary).font(F.sans).fontSize(14);
  doc.text("$10,000–$100,000 questions", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" that get answered with gut instinct because the tools to model them properly cost $500/month or require a finance degree.");

  drawPageFooter(doc, "A4 · THE PROBLEM", 3);
}

function slide04_ProblemCont(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "02", "THE PROBLEM (CONT.)");
  drawDotGrid(doc, 0, 0, W, H, 48, 0.8, 0.03);

  drawSectionLabel(doc, 100, 110, "THE DAMAGE COMPOUNDS IN EVERY DIRECTION");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Three more leaks, all ", 100, 150, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("invisible until they aren't.", { lineBreak: false });

  const cards = [
    {
      title: "Tax drag.",
      body: "Small businesses routinely overpay taxes — missing deductions, misclassifying expenses, ignoring quarterly estimate optimization, failing to time major purchases. Individuals miss Roth conversion windows, hold tax-inefficient assets in the wrong accounts, and leave tax-loss harvesting on the table. Each mistake is small. Compounded across years, they're enormous.",
    },
    {
      title: "Cash drag.",
      body: "Money sits idle in low-yield checking accounts. Receivables go uncollected for weeks past due. Subscription costs creep up unnoticed. The financial equivalent of a slow leak — invisible until you realize you've been losing $200/month for three years.",
    },
    {
      title: "Decision paralysis disguised as caution.",
      body: "Some people avoid all the mistakes above by simply not acting — not investing surplus cash, not expanding the business, not negotiating that lease, not consolidating that debt. The opportunity cost of inaction, compounded over a decade, dwarfs most of the explicit mistakes combined.",
    },
  ];

  let cy = 240;
  for (const card of cards) {
    const ch = 130;
    drawCardPanel(doc, 100, cy, W - 200, ch, { bg: C.bg3 });
    doc.rect(100, cy, 3, ch).fill(C.primary);
    doc.circle(128, cy + 28, 4).fill(C.primary);
    doc.font(F.sans).fontSize(18).fillColor(C.white);
    doc.text(card.title, 140, cy + 20, { lineBreak: false });
    doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
    doc.text(card.body, 128, cy + 50, { width: W - 280, lineGap: 5 });
    cy += ch + 20;
  }

  drawPageFooter(doc, "A4 · THE PROBLEM", 4);
}

function slide05_CruelMath(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "02", "THE CRUEL MATH");

  drawSectionLabel(doc, 100, 210, "THE CRUEL MATH");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Financial blindness ", 100, 260, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("compounds in every direction.", { lineBreak: false });

  // Big callout card with hero frame
  const cx = 120;
  const cy = 370;
  const cw = W - 240;
  const ch = 200;
  drawCardPanel(doc, cx, cy, cw, ch, { bg: hex(C.primary, 0.05), borderColor: hex(C.primary, 0.15) });
  drawHeroFrame(doc, cx, cy, cw, ch);

  drawSectionLabel(doc, cx + 30, cy + 25, "COMPOUNDING COST OF INACTION");

  doc.font(F.sans).fontSize(17).fillColor(hex(C.white, 0.7));
  doc.text("The cruel math: a ", cx + 30, cy + 70, { width: cw - 60, lineGap: 6, continued: true });
  doc.fillColor(C.primary);
  doc.text("$5,000 inefficiency at 30", { continued: true });
  doc.fillColor(hex(C.white, 0.7));
  doc.text(" isn't a $5,000 problem. At a 7% real return, it's ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("$75,000 at 65", { continued: true });
  doc.fillColor(hex(C.white, 0.7));
  doc.text(". A small business that delays hiring by six months because it couldn't model the cash flow impact doesn't lose six months of salary — ", { continued: true });
  doc.fillColor(C.primary).font(F.sans).fontSize(17);
  doc.text("it loses the revenue that employee would have generated", { continued: true });
  doc.fillColor(hex(C.white, 0.7));
  doc.text(". Financial blindness compounds in every direction.");

  // Compounding growth illustration
  const chartX = cx + 60;
  const chartY = cy + ch + 40;
  const chartW = cw - 120;
  const chartH = 120;

  // Simple exponential curve
  doc.save();
  doc.opacity(0.3);
  let pathStr = `M ${chartX} ${chartY + chartH}`;
  for (let i = 0; i <= 100; i++) {
    const x = chartX + (i / 100) * chartW;
    const t = i / 100;
    const yVal = chartY + chartH - chartH * Math.pow(t, 2.5);
    pathStr += ` L ${x} ${yVal}`;
  }
  doc.path(pathStr).lineWidth(2).strokeColor(C.primary).stroke();
  // Fill under curve
  doc.opacity(0.05);
  doc.path(pathStr + ` L ${chartX + chartW} ${chartY + chartH} Z`).fill(C.primary);
  doc.restore();

  // Labels
  doc.font(F.mono).fontSize(10).fillColor(hex(C.white, 0.3));
  doc.text("$5K", chartX - 5, chartY + chartH + 5, { lineBreak: false });
  doc.text("$75K", chartX + chartW - 20, chartY - 5, { lineBreak: false });
  doc.font(F.mono).fontSize(9).fillColor(hex(C.white, 0.2));
  doc.text("Age 30", chartX, chartY + chartH + 20, { lineBreak: false });
  doc.text("Age 65", chartX + chartW - 30, chartY + chartH + 20, { lineBreak: false });

  drawPageFooter(doc, "A4 · THE PROBLEM", 5);
}

function slide06_WhyNow(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "03", "WHY NOW");
  drawDotGrid(doc, 0, 0, W, H, 48, 0.8, 0.03);

  drawSectionLabel(doc, 100, 100, "WHY NOW");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Three curves are crossing ", 100, 140, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("for the first time.", { lineBreak: false });

  const cards = [
    {
      num: "01",
      title: 'The "spreadsheet ceiling" is real and universal.',
      body: "Individuals and small businesses have outgrown basic apps but can't justify enterprise tools. The mid-market for financial intelligence — flexible enough for real decisions, affordable enough for a one-person company — has been structurally empty.",
    },
    {
      num: "02",
      title: "The advice gap has widened, not narrowed.",
      body: "Fractional CFOs start at $3k/month. Bookkeepers track history but don't advise on the future. Financial advisors require $250k+ in assets. The people who need the most help have the fewest options.",
    },
    {
      num: "03",
      title: "LLMs crossed the threshold for financial reasoning.",
      body: "As of 2025, frontier models can parse financial documents, reason through multi-step scenarios, and explain tradeoffs at a level that would have required a CPA or CFP just a few years ago. An AI that can read your invoices, understand your debt structure, model your tax scenarios, and explain the tradeoffs in plain language — that product was impossible two years ago. It's a wedge today.",
    },
  ];

  const cardW = (W - 280) / 3;
  const cardH = 340;
  const cardY = 230;

  cards.forEach((card, i) => {
    const cx = 100 + i * (cardW + 40);
    drawCardPanel(doc, cx, cardY, cardW, cardH, { bg: C.bg3 });
    // Top accent line
    doc.rect(cx, cardY, cardW, 2).fill(hex(C.primary, 0.4));

    // Number
    doc.font(F.mono).fontSize(36).fillColor(C.primary);
    doc.text(card.num, cx + 24, cardY + 24, { lineBreak: false });

    // Connector line under number
    doc.rect(cx + 24, cardY + 70, cardW - 48, 1).fill(hex(C.white, 0.06));

    // Title
    doc.font(F.sans).fontSize(17).fillColor(C.white);
    doc.text(card.title, cx + 24, cardY + 85, { width: cardW - 48, lineGap: 4 });

    // Body
    doc.font(F.sans).fontSize(13).fillColor(hex(C.white, 0.5));
    doc.text(card.body, cx + 24, cardY + 140, { width: cardW - 48, lineGap: 5 });
  });

  // Connector paths between cards
  for (let i = 0; i < 2; i++) {
    const x1 = 100 + (i + 1) * (cardW + 40) - 20;
    const x2 = x1 - 1;
    drawConnectorPath(doc, `M ${x1} ${cardY + 60} C ${x1} ${cardY + 80}, ${x2} ${cardY + 80}, ${x2} ${cardY + 60}`, C.primary, 1.5, 0.15);
  }

  // Bottom callout
  const byC = cardY + cardH + 30;
  drawCardPanel(doc, 100, byC, W - 200, 85, { bg: C.bg3 });
  doc.font(F.sans).fontSize(15).fillColor(C.white);
  doc.text("The window is open. ", 130, byC + 20, { width: W - 260, lineGap: 5, continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text("Incumbents are structurally disadvantaged: QuickBooks and Xero are accounting-first and can't reason. Consumer apps (Mint, Monarch) track but can't advise. Traditional advisors can't serve small accounts profitably. And horizontal AI tools (ChatGPT, Claude) ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("have no persistent financial context", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" — the user has to re-explain everything every session.");

  drawPageFooter(doc, "A4 · WHY NOW", 6);
}

function slide07_Solution(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "04", "OUR SOLUTION");

  drawSectionLabel(doc, 100, 110, "OUR SOLUTION");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("A Financial Workspace, ", 100, 150, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("Not a Dashboard.", { lineBreak: false });

  doc.font(F.sans).fontSize(16).fillColor(hex(C.white, 0.6));
  doc.text(
    "A4 is a financial workspace — a persistent, contextual environment where your entire financial picture lives on an infinite canvas, and an AI advisor named Paige reasons over all of it. The distinction matters. Dashboards display data. Chatbots answer questions. A workspace knows you: your accounts, your invoices, your debts, your portfolio, your budget, your tax situation, your last conversation. It proactively surfaces decisions you should be making, flags problems before they become crises, and models scenarios you didn't know you should be running.",
    100, 225, { width: W - 200, lineGap: 5 }
  );

  const cards = [
    {
      num: "01",
      title: "Unified over fragmented.",
      body: "Every financial primitive — budgets, invoices, receipts, subscriptions, accounts, portfolios, debts, net worth, P&L, cash flow, tax estimates, loan models, projections — lives in one workspace on one canvas. No more alt-tabbing between six apps to understand your financial position.",
    },
    {
      num: "02",
      title: "Proactive over reactive.",
      body: "A great CFO doesn't wait for you to ask about cash flow — they call you before it's a problem. Paige operates the same way: surfacing tax-loss harvesting in November, flagging subscription creep, alerting you when receivables are aging, modeling the impact of decisions before you make them.",
    },
    {
      num: "03",
      title: "Educational over prescriptive.",
      body: "We don't tell users what to do. We show the tradeoffs, quantify the impact, explain the underlying principle, and let them decide. Every interaction leaves them more financially capable than the last.",
    },
  ];

  const cardW = (W - 280) / 3;
  const cardH = 290;
  const cardY = 360;

  cards.forEach((card, i) => {
    const cx = 100 + i * (cardW + 40);
    drawCardPanel(doc, cx, cardY, cardW, cardH, { bg: C.bg3 });

    // Rounded number badge
    const badgeSize = 36;
    doc.roundedRect(cx + 24, cardY + 20, badgeSize, badgeSize, 8).fill(hex(C.primary, 0.15));
    doc.font(F.mono).fontSize(15).fillColor(C.primary);
    doc.text(card.num, cx + 24, cardY + 30, { width: badgeSize, align: "center" });

    doc.font(F.sans).fontSize(18).fillColor(C.white);
    doc.text(card.title, cx + 24, cardY + 75, { width: cardW - 48 });

    doc.font(F.sans).fontSize(13).fillColor(hex(C.white, 0.5));
    doc.text(card.body, cx + 24, cardY + 110, { width: cardW - 48, lineGap: 5 });
  });

  drawPageFooter(doc, "A4 · OUR SOLUTION", 7);
}

function slide08_Product(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "05", "PRODUCT");

  drawSectionLabel(doc, 100, 100, "PRODUCT · WHAT A4 DOES");

  doc.font(F.sans).fontSize(48).fillColor(C.white);
  doc.text("A workspace with ", 100, 140, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("27 canvas tools", { continued: true });
  doc.fillColor(C.white);
  doc.text(" built for financial reasoning.", { lineBreak: false });

  doc.font(F.sans).fontSize(15).fillColor(hex(C.white, 0.5));
  doc.text(
    "A user creates a workspace — for their freelance business, their personal finances, their side project, their household — and immediately has access to 27 canvas tools purpose-built for financial reasoning:",
    100, 215, { width: W - 200, lineGap: 4 }
  );

  const features = [
    { num: "1", title: "A complete financial toolkit.", body: "Budgets, invoices, receipts, subscription trackers, account overviews, portfolio managers, debt planners, net worth trackers, P&L statements, balance sheets, cash flow views, tax estimators, loan calculators, projection models, breakeven analysis, depreciation schedules, rent-vs-buy comparisons. Each one is a live, interactive card on the canvas — not a static report." },
    { num: "2", title: "Document intelligence.", body: "Upload bank statements, tax returns, receipts, contracts — PDFs, CSVs, Excel files, images. A4 extracts the data via OCR and embedding, makes it searchable, and feeds it into Paige's reasoning context. Your documents become queryable financial knowledge." },
    { num: "3", title: "An AI that sees everything.", body: 'Paige doesn\'t just answer questions — she creates. "Set up a monthly budget for my freelance business" produces a fully populated budget card. "Create an invoice for Acme Corp" generates a complete invoice with line items. She reasons across every card, document, and data point in the workspace.' },
    { num: "4", title: "Scenario modeling.", body: '"What if I take on $50k in debt at 7% to expand?" "15-year vs 30-year mortgage — show me the math." "What\'s my breakeven if I raise prices 15%?" Side-by-side scenario comparisons with real numbers, generated in seconds.' },
    { num: "5", title: "Cross-workspace intelligence.", body: 'Query across all your workspaces simultaneously. "What\'s my total net worth across personal and business?" "Compare cash flow across all three projects." The AI sees the full picture even when your finances are organized into separate workspaces.' },
  ];

  const row1Y = 280;
  const cardW = (W - 280) / 3;
  const cardH = 240;

  // Row 1: 3 cards
  for (let i = 0; i < 3; i++) {
    const f = features[i];
    const cx = 100 + i * (cardW + 40);
    drawCardPanel(doc, cx, row1Y, cardW, cardH, { bg: C.bg3 });

    doc.roundedRect(cx + 24, row1Y + 16, 36, 36, 8).fill(hex(C.primary, 0.15));
    doc.font(F.mono).fontSize(15).fillColor(C.primary);
    doc.text(f.num, cx + 24, row1Y + 26, { width: 36, align: "center" });

    doc.font(F.sans).fontSize(16).fillColor(C.white);
    doc.text(f.title, cx + 70, row1Y + 26, { width: cardW - 94, lineBreak: false });

    doc.font(F.sans).fontSize(12).fillColor(hex(C.white, 0.5));
    doc.text(f.body, cx + 24, row1Y + 65, { width: cardW - 48, lineGap: 4 });
  }

  // Row 2: 2 cards
  const row2Y = row1Y + cardH + 24;
  const card2W = (W - 240) / 2;
  for (let i = 0; i < 2; i++) {
    const f = features[3 + i];
    const cx = 100 + i * (card2W + 40);
    drawCardPanel(doc, cx, row2Y, card2W, 190, { bg: C.bg3 });

    doc.roundedRect(cx + 24, row2Y + 16, 36, 36, 8).fill(hex(C.primary, 0.15));
    doc.font(F.mono).fontSize(15).fillColor(C.primary);
    doc.text(f.num, cx + 24, row2Y + 26, { width: 36, align: "center" });

    doc.font(F.sans).fontSize(16).fillColor(C.white);
    doc.text(f.title, cx + 70, row2Y + 26, { width: card2W - 94, lineBreak: false });

    doc.font(F.sans).fontSize(12).fillColor(hex(C.white, 0.5));
    doc.text(f.body, cx + 24, row2Y + 65, { width: card2W - 48, lineGap: 4 });
  }

  drawPageFooter(doc, "A4 · PRODUCT", 8);
}

function slide09_Market(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "06", "MARKET OPPORTUNITY");

  drawSectionLabel(doc, 100, 110, "MARKET OPPORTUNITY");

  doc.font(F.sans).fontSize(48).fillColor(C.primary);
  doc.text("Tens of millions", 100, 150, { lineBreak: false, continued: true });
  doc.fillColor(C.white);
  doc.text(" underserved by both consumer apps and enterprise tools.");

  const cardW = (W - 280) / 3;
  const cardH = 280;
  const cardY = 300;

  // TAM
  drawCardPanel(doc, 100, cardY, cardW, cardH, { bg: C.bg3 });
  drawSectionBadge(doc, 124, cardY + 20, "TAM");
  doc.rect(124, cardY + 70, cardW - 48, 1).fill(hex(C.white, 0.06));
  doc.font(F.mono).fontSize(52).fillColor(C.primary);
  doc.text("33M", 124, cardY + 85, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text("small businesses in the U.S. alone, plus ", 124, cardY + 155, { width: cardW - 48, lineGap: 4, continued: true });
  doc.fillColor(C.white).font(F.sans).fontSize(14);
  doc.text("~100 million individuals", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" with investable assets or complex-enough finances to need more than a checking account app. Globally, several multiples larger.");

  // SAM
  const samX = 100 + cardW + 40;
  drawCardPanel(doc, samX, cardY, cardW, cardH, { bg: C.bg3 });
  drawSectionBadge(doc, samX + 24, cardY + 20, "SAM");
  doc.rect(samX + 24, cardY + 70, cardW - 48, 1).fill(hex(C.white, 0.06));
  doc.font(F.mono).fontSize(48).fillColor(C.primary);
  doc.text("40–50M", samX + 24, cardY + 85, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text("potential users in the U.S. — small businesses with ", samX + 24, cardY + 155, { width: cardW - 48, lineGap: 4, continued: true });
  doc.fillColor(C.white).font(F.sans).fontSize(14);
  doc.text("$100k–$5M", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" in revenue, freelancers and contractors, and individuals with ", { continued: true });
  doc.fillColor(C.white);
  doc.text("$10k–$500k", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" in financial complexity — all underserved by both consumer apps and enterprise tools.");

  // WEDGE
  const wedgeX = 100 + 2 * (cardW + 40);
  drawCardPanel(doc, wedgeX, cardY, cardW, cardH, { bg: C.bg3 });
  drawSectionBadge(doc, wedgeX + 24, cardY + 20, "WEDGE");
  doc.rect(wedgeX + 24, cardY + 70, cardW - 48, 1).fill(hex(C.white, 0.06));
  doc.font(F.sans).fontSize(40).fillColor(C.primary);
  doc.text("One use case → many", wedgeX + 24, cardY + 85, { width: cardW - 48, lineGap: 2 });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text("The workspace model means users start with one use case (budgeting, invoicing, portfolio tracking) and expand as they realize the value of having everything in one place. The canvas is a natural expansion surface.", wedgeX + 24, cardY + 165, { width: cardW - 48, lineGap: 4 });

  // Bottom callout
  const byC = cardY + cardH + 30;
  drawCardPanel(doc, 100, byC, W - 200, 75, { bg: C.bg3 });
  doc.font(F.mono).fontSize(12).fillColor(C.primary);
  doc.text("WILLINGNESS-TO-PAY ANCHOR", 130, byC + 18, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.6));
  doc.text("QuickBooks charges ", 130, byC + 40, { width: W - 290, lineGap: 4, continued: true });
  doc.fillColor(C.primary);
  doc.text("$30–$200/month", { continued: true });
  doc.fillColor(hex(C.white, 0.6));
  doc.text(" for accounting alone. Financial advisors charge ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("1% of AUM", { continued: true });
  doc.fillColor(hex(C.white, 0.6));
  doc.text(". Fractional CFOs start at ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("$3k/month", { continued: true });
  doc.fillColor(hex(C.white, 0.6));
  doc.text(". ");
  doc.font(F.sans).fontSize(14).fillColor(C.white);
  doc.text("A4 can credibly price at $15–$50/month", 130, byC + 58, { width: W - 290, continued: true });
  doc.fillColor(hex(C.white, 0.6));
  doc.text(" and deliver more integrated value than any of them for the segment we serve.");

  drawPageFooter(doc, "A4 · MARKET OPPORTUNITY", 9);
}

function slide10_BusinessModel(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "07", "BUSINESS MODEL");

  drawSectionLabel(doc, 100, 110, "BUSINESS MODEL");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Subscription, ", 100, 150, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("aligned with the user.", { lineBreak: false });

  const cardW = (W - 260) / 2;
  const cardH = 260;
  const cardY = 250;

  // Subscription card
  drawCardPanel(doc, 100, cardY, cardW, cardH, { bg: C.bg3 });
  doc.rect(100, cardY, 3, cardH).fill(C.primary);
  doc.circle(128, cardY + 30, 4).fill(C.primary);
  doc.font(F.sans).fontSize(20).fillColor(C.white);
  doc.text("Subscription", 140, cardY + 22, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text(
    "Tiered monthly/annual pricing. Free tier with limited workspaces and AI interactions to drive adoption; paid tiers unlock ",
    128, cardY + 60, { width: cardW - 60, lineGap: 5, continued: true }
  );
  doc.fillColor(C.white).font(F.sans).fontSize(14);
  doc.text("unlimited workspaces, proactive monitoring, advanced scenario modeling, document processing, and cross-workspace intelligence.", { continued: false });

  // No conflicts card with vault mini-vis
  const ncX = 100 + cardW + 60;
  drawCardPanel(doc, ncX, cardY, cardW, cardH, { bg: C.bg3, borderColor: hex(C.primary, 0.15) });
  drawHeroFrame(doc, ncX, cardY, cardW, cardH);
  doc.circle(ncX + 28, cardY + 30, 4).fill(C.primary);
  doc.font(F.sans).fontSize(20).fillColor(C.white);
  doc.text("No conflicts of interest", ncX + 40, cardY + 22, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text(
    "We don't sell financial products. We don't earn commissions. We don't sell user data. ",
    ncX + 28, cardY + 60, { width: cardW - 60, lineGap: 5, continued: true }
  );
  doc.fillColor(C.white);
  doc.text("A4's only incentive is to make the user's financial decisions better.", { continued: true });
  doc.fillColor(hex(C.white, 0.5));
  doc.text(" Alignment is the brand.");

  // Vault mini visualization
  const vx = ncX + 28;
  const vy = cardY + 175;
  doc.font(F.mono).fontSize(9).fillColor(hex(C.white, 0.3));
  doc.text("VAULT ENCRYPTION", vx, vy, { lineBreak: false });

  // Lock icon
  doc.save();
  doc.roundedRect(vx, vy + 18, 14, 10, 2).lineWidth(1).strokeColor(C.primary).stroke();
  doc.path(`M ${vx + 3} ${vy + 18} L ${vx + 3} ${vy + 14} A 4 4 0 0 1 ${vx + 11} ${vy + 14} L ${vx + 11} ${vy + 18}`).lineWidth(1).strokeColor(C.primary).stroke();
  doc.restore();

  doc.font(F.mono).fontSize(9).fillColor(hex(C.white, 0.4));
  doc.text("Passphrase → PBKDF2 → AES-256-GCM", vx + 20, vy + 20, { lineBreak: false });
  doc.font(F.mono).fontSize(8).fillColor(hex(C.primary, 0.6));
  doc.text("plaintext never stored", vx + 20, vy + 35, { lineBreak: false });

  // Bottom callout
  const byC = cardY + cardH + 30;
  drawCardPanel(doc, 100, byC, W - 200, 75, { bg: C.bg3 });
  doc.font(F.mono).fontSize(12).fillColor(hex(C.white, 0.4));
  doc.text("FUTURE REVENUE EXTENSIONS · DELIBERATELY DEPRIORITIZED", 130, byC + 15, { lineBreak: false });
  doc.font(F.sans).fontSize(14).fillColor(hex(C.white, 0.5));
  doc.text("Premium tier with on-demand human CPA/CFP review, B2B2C distribution through employers and accelerators, API access for accountants managing client workspaces.", 130, byC + 40, { width: W - 290, lineGap: 4 });

  drawPageFooter(doc, "A4 · BUSINESS MODEL", 10);
}

function slide11_Competitive(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "08", "COMPETITIVE LANDSCAPE");

  drawSectionLabel(doc, 100, 100, "COMPETITIVE LANDSCAPE");

  doc.font(F.sans).fontSize(48).fillColor(C.white);
  doc.text("Nothing on this list ", 100, 140, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("combines all four.", { lineBreak: false });

  // Window chrome above table
  const tableX = 100;
  const tableY = 220;
  const tableW = W - 200;
  drawWindowChrome(doc, tableX, tableY, tableW, 32);

  // Table
  const tY = tableY + 32;
  const rows = [
    { cat: "Accounting software", ex: "QuickBooks, Xero, FreshBooks", why: "Backward-looking record-keeping; no AI reasoning, no personal finance, no scenario modeling" },
    { cat: "Personal finance apps", ex: "Monarch, YNAB, Copilot", why: "Budgeting and tracking only; can't model scenarios, create invoices, or manage a business" },
    { cat: "Robo-advisors", ex: "Betterment, Wealthfront", why: "Allocate capital, don't advise on decisions; investment-only, no business finance" },
    { cat: "Traditional advisors", ex: "RIAs, CFPs, CPAs", why: "$250k+ minimums or $200+/hour; won't serve small accounts or small businesses" },
    { cat: "Spreadsheets", ex: "Excel, Google Sheets", why: "Infinitely flexible, zero intelligence; no AI, no proactive insights, breaks constantly" },
    { cat: "General-purpose AI", ex: "ChatGPT, Claude", why: "No persistent context, no account data, no canvas, no proactive monitoring" },
    { cat: "Enterprise FP&A", ex: "Anaplan, Mosaic, Runway", why: "$50k+/year; designed for finance teams of 5+, not founders and freelancers" },
  ];

  // Header row
  const colWidths = [tableW * 0.22, tableW * 0.22, tableW * 0.56];
  doc.rect(tableX, tY, tableW, 36).fill(hex(C.white, 0.03));
  doc.font(F.mono).fontSize(11).fillColor(hex(C.white, 0.3));
  doc.text("CATEGORY", tableX + 20, tY + 12, { lineBreak: false });
  doc.text("EXAMPLES", tableX + colWidths[0] + 20, tY + 12, { lineBreak: false });
  doc.text("WHY THEY DON'T SOLVE THIS", tableX + colWidths[0] + colWidths[1] + 20, tY + 12, { lineBreak: false });

  let rowY = tY + 36;
  rows.forEach((row, i) => {
    const rh = 52;
    if (i % 2 === 0) {
      doc.rect(tableX, rowY, tableW, rh).fill(hex(C.white, 0.02));
    }
    doc.rect(tableX + colWidths[0] + colWidths[1], rowY, 1, rh).fill(hex(C.white, 0.04));

    doc.font(F.sans).fontSize(13).fillColor(C.white);
    doc.text(row.cat, tableX + 20, rowY + 16, { width: colWidths[0] - 30, lineBreak: false });
    doc.font(F.sans).fontSize(13).fillColor(C.primary);
    doc.text(row.ex, tableX + colWidths[0] + 20, rowY + 16, { width: colWidths[1] - 30, lineBreak: false });
    doc.font(F.sans).fontSize(12).fillColor(hex(C.white, 0.5));
    doc.text(row.why, tableX + colWidths[0] + colWidths[1] + 20, rowY + 10, { width: colWidths[2] - 40, lineGap: 3 });

    rowY += rh;
  });

  // Bottom border
  doc.rect(tableX, rowY, tableW, 1).fill(hex(C.white, 0.06));

  // Summary
  doc.font(F.sans).fontSize(15).fillColor(hex(C.white, 0.6));
  doc.text("Nothing on this list combines ", 100, rowY + 20, { lineBreak: false, continued: true });
  doc.fillColor(C.white).font(F.sans).fontSize(15);
  doc.text("unified financial data, an interactive canvas, AI reasoning, and proactive intelligence", { continued: true });
  doc.fillColor(hex(C.white, 0.6));
  doc.text(" at a price point accessible to individuals and small businesses.");

  drawPageFooter(doc, "A4 · COMPETITIVE LANDSCAPE", 11);
}

function slide12_GTM(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "09", "GO-TO-MARKET");

  drawSectionLabel(doc, 100, 100, "GO-TO-MARKET");

  doc.font(F.sans).fontSize(48).fillColor(C.white);
  doc.text("Trust-led, ", 100, 140, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("community-rooted, productized to spread.", { lineBreak: false });

  const cardW = (W - 260) / 2;
  const cardH = 190;

  const cards = [
    {
      title: "Creator-led acquisition.",
      body: "Finance creators on YouTube, TikTok, and Substack have massive trust with our demographic. The canvas is inherently visual and shareable — a 60-second screen recording of Paige building a complete budget or modeling a scenario is organic content that markets itself.",
    },
    {
      title: "Community-first.",
      body: "r/smallbusiness, r/freelance, r/personalfinance, Indie Hackers, FIRE communities — these are communities full of people actively managing their own finances and hungry for better tools. We earn credibility by being demonstrably better and genuinely aligned.",
    },
    {
      title: "Productized virality.",
      body: "Every workspace produces artifacts worth sharing — invoices sent to clients, budget breakdowns shared with partners, scenario models shared with co-founders. Each one is a touchpoint with a non-user.",
    },
    {
      title: "B2B2C wedge.",
      body: 'Accelerators, coworking spaces, and employer financial wellness programs are natural distribution channels. "Give every employee/founder access to an AI financial workspace" is a compelling benefit at our price point.',
    },
  ];

  // Row 1
  for (let i = 0; i < 2; i++) {
    const cx = 100 + i * (cardW + 60);
    const cy = 230;
    drawCardPanel(doc, cx, cy, cardW, cardH, { bg: C.bg3 });
    doc.rect(cx, cy, 3, cardH).fill(C.primary);
    doc.font(F.sans).fontSize(18).fillColor(C.white);
    doc.text(cards[i].title, cx + 28, cy + 22, { width: cardW - 56 });
    doc.font(F.sans).fontSize(13).fillColor(hex(C.white, 0.5));
    doc.text(cards[i].body, cx + 28, cy + 55, { width: cardW - 56, lineGap: 5 });
  }

  // Row 2
  for (let i = 0; i < 2; i++) {
    const cx = 100 + i * (cardW + 60);
    const cy = 230 + cardH + 30;
    drawCardPanel(doc, cx, cy, cardW, cardH, { bg: C.bg3 });
    doc.rect(cx, cy, 3, cardH).fill(C.primary);
    doc.font(F.sans).fontSize(18).fillColor(C.white);
    doc.text(cards[2 + i].title, cx + 28, cy + 22, { width: cardW - 56 });
    doc.font(F.sans).fontSize(13).fillColor(hex(C.white, 0.5));
    doc.text(cards[2 + i].body, cx + 28, cy + 55, { width: cardW - 56, lineGap: 5 });
  }

  // Chat demo snippet at bottom
  const chatY = 230 + 2 * (cardH + 30) + 20;
  const chatW = W - 200;
  drawCardPanel(doc, 100, chatY, chatW, 100, { bg: C.bg3 });
  drawWindowChrome(doc, 100, chatY, chatW, 28, "paige — content demo");

  // User msg
  doc.font(F.mono).fontSize(11).fillColor(hex(C.white, 0.5));
  doc.text('"Create a budget breakdown I can share with my co-founder"', 180, chatY + 42, { lineBreak: false });

  // Paige response
  doc.circle(140, chatY + 72, 8).fill(hex(C.primary, 0.15));
  doc.font(F.mono).fontSize(8).fillColor(C.primary);
  doc.text("P", 136, chatY + 68, { lineBreak: false });
  doc.font(F.mono).fontSize(11).fillColor(hex(C.white, 0.6));
  doc.text("Generated a shareable budget card with 6 categories and a PDF export link.", 160, chatY + 66, { lineBreak: false });
  doc.font(F.mono).fontSize(9).fillColor(C.primary);
  doc.text("GENERATED", chatW - 10, chatY + 66, { lineBreak: false });

  drawPageFooter(doc, "A4 · GO-TO-MARKET", 12);
}

function slide13_Roadmap(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "10", "TRACTION & ROADMAP");

  drawSectionLabel(doc, 100, 100, "TRACTION & ROADMAP");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Built. ", 100, 140, { lineBreak: false, continued: true });
  doc.fillColor(C.primary);
  doc.text("Shipping.", { continued: true });
  doc.fillColor(C.white);
  doc.text(" Scaling.", { lineBreak: false });

  const cardW = (W - 280) / 3;
  const cardH = 520;
  const cardY = 230;

  const phases = [
    {
      label: "BUILT TO DATE",
      title: "Full-stack product, shipped.",
      items: [
        "Full-stack product: 27 canvas item types, 21 database tables, 20 API routers, 36 AI tools",
        "AI advisor (Paige) with full canvas manipulation — creates, populates, and reasons over every card type",
        "Document pipeline: upload PDFs/CSVs/Excel/images, OCR extraction, semantic search via embeddings",
        "Cross-workspace intelligence: query and compare data across all user workspaces",
        "Scenario modeling engine: side-by-side financial comparisons with real calculations",
        "Vault encryption for sensitive financial data",
        "CI pipeline: lint, typecheck, unit tests, E2E tests, build — all passing",
      ],
    },
    {
      label: "NEXT 6 MONTHS",
      title: "Public beta & live data.",
      items: [
        "Public beta launch with refined onboarding",
        "Account aggregation via Plaid (bank accounts, credit cards, investment accounts)",
        "Integration connectors: Stripe, QuickBooks, Plaid for live data sync",
        "Proactive intelligence layer: automated alerts, tax optimization nudges, cash flow warnings",
        "First paid tier; target early revenue validation",
      ],
    },
    {
      label: "MONTHS 6–18",
      title: "Goals, taxes, distribution.",
      items: [
        "Goal-based planning (home purchase, hiring, expansion, retirement)",
        "Tax optimization deepening (quarterly estimates, Roth analysis, deduction optimization)",
        "B2B2C pilot with target accelerators and employer channels",
        "Mobile companion for approvals, alerts, and quick queries",
        "Path to Series A readiness",
      ],
    },
  ];

  phases.forEach((phase, i) => {
    const cx = 100 + i * (cardW + 40);
    drawCardPanel(doc, cx, cardY, cardW, cardH, { bg: C.bg3 });

    // Timeline dot and line
    doc.circle(cx + 24, cardY + 20, 6).fill(C.primary);
    doc.rect(cx + 30, cardY + 17, cardW - 54, 2).fill(C.primary);

    // Label
    doc.font(F.mono).fontSize(11).fillColor(C.primary);
    doc.text(phase.label, cx + 24, cardY + 40, { lineBreak: false });

    // Title
    doc.font(F.sans).fontSize(18).fillColor(C.white);
    doc.text(phase.title, cx + 24, cardY + 62, { width: cardW - 48 });

    // Items
    let iy = cardY + 100;
    phase.items.forEach((item) => {
      doc.font(F.sans).fontSize(12).fillColor(hex(C.white, 0.5));
      doc.rect(cx + 24, iy + 5, 6, 1.5).fill(hex(C.white, 0.3));
      const h = doc.heightOfString(item, { width: cardW - 72 });
      doc.text(item, cx + 38, iy, { width: cardW - 72, lineGap: 3 });
      iy += h + 12;
    });
  });

  // Connector paths between cards
  for (let i = 0; i < 2; i++) {
    const x1 = 100 + (i + 1) * (cardW + 40) - 20;
    drawConnectorPath(doc,
      `M ${100 + i * (cardW + 40) + cardW} ${cardY + 20} L ${100 + (i + 1) * (cardW + 40)} ${cardY + 20}`,
      C.primary, 2, 0.3
    );
  }

  drawPageFooter(doc, "A4 · TRACTION & ROADMAP", 13);
}

function slide14_Team(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "11", "TEAM");

  drawSectionLabel(doc, 100, 210, "TEAM");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("Team", 100, 250);

  // Placeholder card with hero frame
  const cx = 100;
  const cy = 360;
  const cw = W - 200;
  const ch = 200;
  drawCardPanel(doc, cx, cy, cw, ch, { bg: C.bg3, borderColor: hex(C.white, 0.08) });
  // Dashed border
  doc.save();
  doc.roundedRect(cx + 2, cy + 2, cw - 4, ch - 4, 4).dash(8, { space: 6 }).lineWidth(1).strokeColor(hex(C.white, 0.1)).stroke();
  doc.restore();

  doc.font(F.mono).fontSize(13).fillColor(hex(C.white, 0.3));
  doc.text("RESERVED · SECTION IN PROGRESS", cx, cy + 75, { width: cw, align: "center" });

  doc.font(F.sans).fontSize(24).fillColor(C.primary);
  doc.text("[ To be completed ]", cx, cy + 105, { width: cw, align: "center" });

  drawHeroFrame(doc, cx, cy, cw, ch);

  drawPageFooter(doc, "A4 · TEAM", 14);
}

function slide15_Ask(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "12", "THE ASK");

  drawSectionLabel(doc, 100, 210, "THE ASK");

  doc.font(F.sans).fontSize(52).fillColor(C.white);
  doc.text("The Ask", 100, 250);

  const cx = 100;
  const cy = 360;
  const cw = W - 200;
  const ch = 200;
  drawCardPanel(doc, cx, cy, cw, ch, { bg: C.bg3, borderColor: hex(C.white, 0.08) });
  doc.save();
  doc.roundedRect(cx + 2, cy + 2, cw - 4, ch - 4, 4).dash(8, { space: 6 }).lineWidth(1).strokeColor(hex(C.white, 0.1)).stroke();
  doc.restore();

  doc.font(F.mono).fontSize(13).fillColor(hex(C.white, 0.3));
  doc.text("RESERVED · SECTION IN PROGRESS", cx, cy + 70, { width: cw, align: "center" });

  doc.font(F.sans).fontSize(22).fillColor(C.primary);
  doc.text("[ To be completed with specific raise amount, milestones, and use of funds ]", cx + 100, cy + 100, { width: cw - 200, align: "center" });

  drawHeroFrame(doc, cx, cy, cw, ch);

  drawPageFooter(doc, "A4 · THE ASK", 15);
}

function slide16_Vision(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "13", "VISION");

  // Subtle dot grid watermark
  drawDotGrid(doc, 0, 0, W, H, 40, 1, 0.04);

  // Canvas illustration as faint background
  // Mini cards scattered in background
  const miniCards = [
    { x: 120, y: 650, w: 100, h: 60 },
    { x: 350, y: 700, w: 90, h: 50 },
    { x: 1500, y: 680, w: 110, h: 55 },
    { x: 1650, y: 600, w: 85, h: 50 },
    { x: 200, y: 800, w: 95, h: 45 },
    { x: 1400, y: 780, w: 100, h: 60 },
  ];
  doc.save();
  doc.opacity(0.06);
  miniCards.forEach((mc) => {
    doc.roundedRect(mc.x, mc.y, mc.w, mc.h, 3).lineWidth(1).strokeColor(C.primary).stroke();
  });
  // Connector lines between some mini cards
  drawConnectorPath(doc, `M ${220} ${680} C ${285} ${690}, ${285} ${710}, ${350} ${720}`, C.primary, 1.5, 1);
  drawConnectorPath(doc, `M ${1610} ${680} C ${1630} ${620}, ${1640} ${620}, ${1650} ${625}`, C.primary, 1.5, 1);
  doc.restore();

  drawSectionLabel(doc, W / 2 - 40, 240, "VISION");

  // Render heading — measure "The financial workspace " width to place "for everyone." after it
  const headFontSize = 52;
  doc.font(F.sans).fontSize(headFontSize);
  const headPart1 = "The financial workspace ";
  const headPart2 = "for everyone.";
  const headFull = headPart1 + headPart2;
  const headFullW = doc.widthOfString(headFull);
  const headX = (W - headFullW) / 2;
  const part1W = doc.widthOfString(headPart1);
  doc.fillColor(C.white);
  doc.text(headPart1, headX, 290, { lineBreak: false });
  doc.fillColor(C.primary);
  doc.text(headPart2, headX + part1W, 290, { lineBreak: false });

  doc.font(F.sans).fontSize(18).fillColor(hex(C.white, 0.7));
  doc.text("Within five years, ", 200, 400, { width: W - 400, lineGap: 6, continued: true });
  doc.fillColor(C.white).font(F.sans).fontSize(18);
  doc.text("every freelancer, small business owner, and financially active individual will open A4 alongside their bank account.", { continued: true });
  doc.fillColor(hex(C.white, 0.7));
  doc.text(" Within ten, the idea that a person should manage their financial life across six disconnected apps and a spreadsheet will look as absurd as ", { continued: true });
  doc.fillColor(C.primary);
  doc.text("navigating with paper maps.");

  doc.font(F.sans).fontSize(17).fillColor(hex(C.white, 0.6));
  doc.text(
    "The deeper vision is structural. Small businesses are the backbone of every economy, and individuals are making increasingly complex financial decisions with increasingly inadequate tools. The advisory industry has watched this gap widen for decades and has no economic model to close it — humans don't scale, and human advice costs too much. ",
    200, 520, { width: W - 400, lineGap: 6, continued: true }
  );
  doc.fillColor(C.white).font(F.sans).fontSize(17);
  doc.text("AI changes that math for the first time.");

  drawPageFooter(doc, "A4 · VISION", 16);
}

function slide17_Mission(doc: PDFKit.PDFDocument) {
  newSlide(doc);
  drawPageHeader(doc, "FIN", "MISSION");

  // Background
  drawDotGrid(doc, 0, 0, W, H, 40, 1, 0.04);

  // Large A4 logo watermark — very faint, behind everything
  doc.save();
  doc.opacity(0.02);
  const logoX = W / 2 - 120;
  const logoY = 600;
  drawHeroFrame(doc, logoX, logoY, 240, 300);
  doc.font(F.sans).fontSize(140).fillColor(C.primary);
  doc.text("A4", logoX + 20, logoY + 60, { lineBreak: false });
  doc.restore();

  doc.font(F.sans).fontSize(28).fillColor(C.white);
  doc.text(
    "We are building the financial workspace for everyone the existing financial system has failed to serve. The product is a canvas. ",
    200, 300, { width: W - 400, align: "center", lineGap: 10, continued: true }
  );
  doc.fillColor(C.primary);
  doc.text("The AI is an advisor.", { continued: true });
  doc.fillColor(C.white);
  doc.text(" The mission is to make sure that every financial decision — from a $50 subscription to a $500,000 expansion — gets made with full context, clear tradeoffs, and zero conflicts of interest.");

  // Divider
  doc.save();
  doc.rect(W / 2 - 100, 560, 60, 1).fill(hex(C.white, 0.15));
  doc.font(F.mono).fontSize(12).fillColor(hex(C.white, 0.3));
  doc.text("A4 · THANK YOU", W / 2 - 100 + 70, 553, { lineBreak: false });
  doc.rect(W / 2 + 90, 560, 60, 1).fill(hex(C.white, 0.15));
  doc.restore();

  drawPageFooter(doc, "A4 · MISSION", 17);
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log("Generating A4 Pitch Deck v2...");

  const doc = new PDFDocument({
    size: [W, H],
    margin: 0,
    info: {
      Title: "A4 Pitch Deck 2026",
      Author: "A4 Systems",
      Subject: "AI-powered financial workspace",
    },
  });

  const stream = fs.createWriteStream(OUT);
  doc.pipe(stream);

  // Register fonts
  doc.registerFont("DMSans", F.sans);
  doc.registerFont("IBMPlexMono", F.mono);
  doc.registerFont("IBMPlexMono-Medium", F.monoMed);
  doc.registerFont("IBMPlexMono-Bold", F.monoBold);

  // Background for first page
  doc.rect(0, 0, W, H).fill(C.bg);

  // Generate all slides
  slide01_Cover(doc);
  slide02_OneLiner(doc);
  slide03_Problem(doc);
  slide04_ProblemCont(doc);
  slide05_CruelMath(doc);
  slide06_WhyNow(doc);
  slide07_Solution(doc);
  slide08_Product(doc);
  slide09_Market(doc);
  slide10_BusinessModel(doc);
  slide11_Competitive(doc);
  slide12_GTM(doc);
  slide13_Roadmap(doc);
  slide14_Team(doc);
  slide15_Ask(doc);
  slide16_Vision(doc);
  slide17_Mission(doc);

  doc.end();

  stream.on("finish", () => {
    const size = fs.statSync(OUT).size;
    console.log(`Done! ${(size / 1024).toFixed(0)}KB → ${OUT}`);
  });
}

main();
