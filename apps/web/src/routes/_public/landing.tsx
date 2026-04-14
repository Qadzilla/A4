import { type ReactNode, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { HeroChatInput } from "@/components/landing/HeroChatInput";
import CanvasBackground from "@/components/landing/CanvasBackground";

const sectionReveal = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

function SectionReveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={sectionReveal}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function useInView() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setInView(true); obs.disconnect(); } },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { svgRef, inView };
}

function CanvasCard({ x, y, width, height, children }: { x: number; y: number; width: number; height: number; children: ReactNode }) {
  return (
    <foreignObject x={x} y={y} width={width} height={height} overflow="hidden">
      <div style={{
        width: '100%',
        height: '100%',
        background: '#161616',
        border: '1px solid rgba(255,255,255,0.1)',
        overflow: 'hidden',
        fontSize: '10px',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {children}
      </div>
    </foreignObject>
  );
}

function TaxPrepTile() {
  const { svgRef, inView } = useInView();

  return (
    <div className="bg-[#111111] border border-white/10 p-6 flex flex-col h-[380px] relative group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/0 group-hover:bg-primary/50 transition-colors" />
      <div className="text-xs font-mono text-white/40 mb-4">[01] TAX_PREP_WORKFLOW</div>
      <svg ref={svgRef} data-visible={inView} viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet" className="flex-1 w-full">
        {/* Receipt card — shifted up 5px for more cascade room */}
        <rect x="10" y="5" width="90" height="65" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="18" y="18" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">RECEIPTS</text>
        <circle cx="20" cy="28" r="2" fill="#f59e0b" />
        <text x="25" y="30" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">Staples</text>
        <text x="92" y="30" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$84</text>
        <circle cx="20" cy="40" r="2" fill="#3b82f6" />
        <text x="25" y="42" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">Delta</text>
        <text x="92" y="42" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$420</text>
        <circle cx="20" cy="52" r="2" fill="#22c55e" />
        <text x="25" y="54" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">AWS</text>
        <text x="92" y="54" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$1,200</text>

        {/* Ledger card — shifted right 5px, up 10px */}
        <rect x="140" y="85" width="100" height="55" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="148" y="98" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">LEDGER</text>
        <text x="148" y="110" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.3)">Jan 15</text>
        <text x="175" y="110" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.5)">Office Supplies</text>
        <text x="232" y="110" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="#f87171" textAnchor="end">-$84</text>
        <text x="148" y="121" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.3)">Jan 18</text>
        <text x="175" y="121" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.5)">Travel</text>
        <text x="232" y="121" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="#f87171" textAnchor="end">-$420</text>
        <text x="148" y="132" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.3)">Jan 20</text>
        <text x="175" y="132" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.5)">Cloud Infra</text>
        <text x="232" y="132" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="#f87171" textAnchor="end">-$1,200</text>

        {/* Tax card — shifted right 25px, down 15px, compressed to h=65 */}
        <rect x="200" y="190" width="100" height="65" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="208" y="203" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">TAX</text>
        <rect x="225" y="196" width="20" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
        <text x="235" y="204" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.4)" textAnchor="middle">2026</text>
        <text x="208" y="213" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)">Income</text>
        <text x="292" y="213" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.7)" textAnchor="end">$152K</text>
        <text x="208" y="223" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)">Deductions</text>
        <text x="292" y="223" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.7)" textAnchor="end">-$28K</text>
        <line x1="208" y1="227" x2="292" y2="227" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" strokeDasharray="2 2" />
        <text x="208" y="237" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.6)">Est. Tax</text>
        <text x="292" y="237" fontSize="11" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="white" textAnchor="end">$34,200</text>
        <rect x="266" y="242" width="26" height="10" rx="2" fill="rgba(16,185,129,0.2)" />
        <text x="279" y="250" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="#10B981" textAnchor="middle">22.4%</text>

        {/* Connectors — both ~80-85px diagonal, quarter-arc with midpoint control points */}
        {/* Receipts right (100,37) → Ledger left (140,112). Mid-x=120. Diagonal ≈ 85 */}
        <path className="workflow-connector" pathLength="1" d="M 100 37 C 120 37, 120 112, 140 112" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
        {/* Ledger bottom (190,140) → Tax top (250,190). Mid-y=165. Diagonal ≈ 78 */}
        <path className="workflow-connector-2" pathLength="1" d="M 190 140 C 190 165, 250 165, 250 190" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
      </svg>
      <div className="mt-4 text-sm font-mono text-white/80 group-hover:text-white transition-colors">
        Receipts → Ledger → Tax Estimate
      </div>
    </div>
  );
}

function RunwayTile() {
  const { svgRef, inView } = useInView();

  return (
    <div className="bg-[#111111] border border-white/10 p-6 flex flex-col h-[380px] relative group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/0 group-hover:bg-primary/50 transition-colors" />
      <div className="text-xs font-mono text-white/40 mb-4">[02] RUNWAY_FORECAST</div>
      <svg ref={svgRef} data-visible={inView} viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet" className="flex-1 w-full">
        <defs>
          <linearGradient id="wf-proj-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10B981" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Account card */}
        <rect x="10" y="10" width="100" height="70" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="18" y="23" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">ACCOUNT</text>
        <text x="18" y="35" fontSize="8" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.7)">Operating</text>
        <rect x="58" y="28" width="40" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
        <text x="78" y="36" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.4)" textAnchor="middle">checking</text>
        <text x="18" y="50" fontSize="11" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="#10B981">$248,000</text>
        <rect x="18" y="58" width="84" height="4" rx="2" fill="rgba(255,255,255,0.06)" />
        <rect x="18" y="58" width="84" height="4" rx="2" fill="rgba(16,185,129,0.4)" />

        {/* Subs card */}
        <rect x="250" y="10" width="100" height="80" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="258" y="23" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">SUBS</text>
        <text x="342" y="23" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.3)" textAnchor="end">6 active</text>
        <circle cx="260" cy="35" r="2" fill="#10B981" />
        <text x="265" y="37" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">AWS</text>
        <text x="342" y="37" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.5)" textAnchor="end">$4,200/mo</text>
        <circle cx="260" cy="47" r="2" fill="#10B981" />
        <text x="265" y="49" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">Slack</text>
        <text x="342" y="49" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.5)" textAnchor="end">$840/mo</text>
        <circle cx="260" cy="59" r="2" fill="#10B981" />
        <text x="265" y="61" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.6)">GitHub</text>
        <text x="342" y="61" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.5)" textAnchor="end">$320/mo</text>
        <line x1="258" y1="68" x2="342" y2="68" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        <text x="342" y="80" fontSize="8" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="rgba(255,255,255,0.8)" textAnchor="end">$8,400/mo</text>

        {/* Projection card */}
        <rect x="115" y="170" width="130" height="80" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="123" y="183" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">PROJECTION</text>
        <rect x="186" y="175" width="18" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
        <text x="195" y="183" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.4)" textAnchor="middle">5yr</text>
        {/* Sparkline */}
        <path d="M 123 214 Q 143 212, 163 208 T 193 200 T 237 192" stroke="#10B981" strokeWidth="1.5" fill="none" />
        <path d="M 123 214 Q 143 212, 163 208 T 193 200 T 237 192 V 220 H 123 Z" fill="url(#wf-proj-grad)" />
        <text x="123" y="235" fontSize="11" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="white">$1.2M</text>
        <text x="123" y="244" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="#10B981">29 months runway</text>

        {/* Connectors — perpendicular exit/entry, midpoint control points */}
        {/* Account bottom-center (60,80) → Projection top-left (155,170). Mid-y = 125 */}
        <path className="workflow-connector" pathLength="1" d="M 60 80 C 60 125, 155 125, 155 170" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
        {/* Subs bottom-center (300,90) → Projection top-right (205,170). Mid-y = 130 */}
        <path className="workflow-connector-2" pathLength="1" d="M 300 90 C 300 130, 205 130, 205 170" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
      </svg>
      <div className="mt-4 text-sm font-mono text-white/80 group-hover:text-white transition-colors">
        Balance + Burn → Runway Projection
      </div>
    </div>
  );
}

function PortfolioTile() {
  const { svgRef, inView } = useInView();

  return (
    <div className="bg-[#111111] border border-white/10 p-6 flex flex-col h-[380px] relative group">
      <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/0 group-hover:bg-primary/50 transition-colors" />
      <div className="text-xs font-mono text-white/40 mb-4">[03] PORTFOLIO_ANALYSIS</div>
      <svg ref={svgRef} data-visible={inView} viewBox="0 0 360 260" preserveAspectRatio="xMidYMid meet" className="flex-1 w-full">
        {/* Portfolio card */}
        <rect x="10" y="10" width="100" height="85" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="18" y="23" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">PORTFOLIO</text>
        {/* Allocation bar */}
        <rect x="18" y="30" width="40" height="4" rx="2" fill="#3b82f6" />
        <rect x="59" y="30" width="26" height="4" rx="2" fill="#10B981" />
        <rect x="86" y="30" width="16" height="4" rx="2" fill="#f59e0b" />
        {/* Holdings */}
        <circle cx="20" cy="44" r="2" fill="#3b82f6" />
        <text x="25" y="46" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.6)">AAPL</text>
        <text x="102" y="46" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$48K</text>
        <circle cx="20" cy="56" r="2" fill="#10B981" />
        <text x="25" y="58" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.6)">VTI</text>
        <text x="102" y="58" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$32K</text>
        <circle cx="20" cy="68" r="2" fill="#f59e0b" />
        <text x="25" y="70" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.6)">BND</text>
        <text x="102" y="70" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.8)" textAnchor="end">$20K</text>
        <text x="102" y="84" fontSize="8" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="rgba(255,255,255,0.8)" textAnchor="end">$142K</text>

        {/* P&L card */}
        <rect x="250" y="10" width="100" height="85" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="258" y="23" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">{"P&L"}</text>
        <rect x="278" y="15" width="22" height="10" rx="2" fill="rgba(255,255,255,0.06)" />
        <text x="289" y="23" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="rgba(255,255,255,0.4)" textAnchor="middle">FY26</text>
        {/* Revenue bar + label */}
        <rect x="258" y="33" width="2" height="10" rx="1" fill="#10B981" />
        <text x="264" y="41" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)">Revenue</text>
        <text x="342" y="41" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="#10B981" textAnchor="end">$285K</text>
        {/* Expenses bar + label */}
        <rect x="258" y="48" width="2" height="10" rx="1" fill="#f87171" />
        <text x="264" y="56" fontSize="7" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)">Expenses</text>
        <text x="342" y="56" fontSize="7" fontFamily="'IBM Plex Mono', monospace" fill="#f87171" textAnchor="end">$198K</text>
        <line x1="258" y1="63" x2="342" y2="63" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
        <text x="258" y="75" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.6)">Net</text>
        <text x="342" y="75" fontSize="10" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="#10B981" textAnchor="end">$87K</text>
        <rect x="316" y="80" width="26" height="10" rx="2" fill="rgba(16,185,129,0.2)" />
        <text x="329" y="88" fontSize="6" fontFamily="'IBM Plex Mono', monospace" fill="#10B981" textAnchor="middle">30.5%</text>

        {/* Net Worth card */}
        <rect x="120" y="170" width="120" height="80" rx="3" fill="#161616" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
        <text x="128" y="183" fontSize="7" fontFamily="system-ui, sans-serif" fontWeight="500" fill="rgba(255,255,255,0.4)" letterSpacing="0.05em">NET WORTH</text>
        <text x="128" y="200" fontSize="14" fontFamily="'IBM Plex Mono', monospace" fontWeight="700" fill="#10B981">$1.24M</text>
        {/* Assets / liabilities bar */}
        <rect x="128" y="208" width="96" height="4" rx="2" fill="rgba(248,113,113,0.6)" />
        <rect x="128" y="208" width="85" height="4" rx="2" fill="rgba(16,185,129,0.6)" />
        <text x="128" y="224" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)">$1.42M assets</text>
        <text x="232" y="224" fontSize="6" fontFamily="system-ui, sans-serif" fill="rgba(255,255,255,0.4)" textAnchor="end">$180K liab.</text>

        {/* Connectors — perpendicular exit/entry, midpoint control points */}
        {/* Portfolio right (110,52) → P&L left (250,52). Gentle arc, both ctrl at y=62 */}
        <path className="workflow-connector" pathLength="1" d="M 110 52 C 150 62, 210 62, 250 52" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
        {/* P&L bottom-center (300,95) → Net Worth top-center (180,170). Mid-y = 132 */}
        <path className="workflow-connector-2" pathLength="1" d="M 300 95 C 300 132, 180 132, 180 170" stroke="#10B981" strokeWidth="1.5" fill="none" opacity="0.7" />
      </svg>
      <div className="mt-4 text-sm font-mono text-white/80 group-hover:text-white transition-colors">
        Holdings → P&L → Net Worth
      </div>
    </div>
  );
}

function CanvasSection() {
  const canvasSvgRef = useRef<SVGSVGElement>(null);
  const [canvasInView, setCanvasInView] = useState(false);

  useEffect(() => {
    const el = canvasSvgRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setCanvasInView(true); obs.disconnect(); } },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const chartCard = { x: 95, y: 55, w: 220, h: 150 };
  const invoiceCard = { x: 105, y: 290, w: 200, h: 190 };
  const tableCard = { x: 415, y: 35, w: 350, h: 265 };
  const kpiCard = { x: 865, y: 45, w: 210, h: 130 };
  const projCard = { x: 865, y: 275, w: 210, h: 185 };
  const budgetCard = { x: 485, y: 395, w: 210, h: 230 };

  return (
    <section className="w-full py-32 px-6 relative border-t border-white/5 bg-[#0A0A0A] overflow-hidden">
      <SectionReveal className="max-w-7xl mx-auto flex flex-col items-center gap-12 relative z-10 text-center">
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#161616] border border-white/10 text-xs font-mono text-white/60 shadow-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            WORKSPACE · 27 TOOLS
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight drop-shadow-md">
            An infinite canvas for <br/> your financial life.
          </h2>
          <p className="text-lg text-white/60 max-w-2xl leading-relaxed mx-auto">
            Drag and drop 27 financial tools, connect them with live data, and build the exact view you need to understand your money.
          </p>
        </div>

        <div className="w-full relative border border-white/10 bg-[#111111] overflow-hidden rounded-lg shadow-2xl">
          {/* Window chrome */}
          <div className="h-10 border-b border-white/10 bg-[#161616] flex items-center px-4 gap-2">
            <div className="w-3 h-3 rounded-full bg-white/20" />
            <div className="w-3 h-3 rounded-full bg-white/20" />
            <div className="w-3 h-3 rounded-full bg-white/20" />
          </div>

          {/* Single SVG canvas — cards + connectors in one coordinate system */}
          <svg
            ref={canvasSvgRef}
            data-visible={canvasInView}
            viewBox="0 0 1200 675"
            preserveAspectRatio="xMidYMid meet"
            className="w-full block"
          >
            {/* Dot grid pattern */}
            <defs>
              <pattern id="dotgrid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.12)" />
              </pattern>
            </defs>
            <rect x="0" y="0" width="1200" height="675" fill="url(#dotgrid)" />

            {/* ═══ CONNECTORS (behind cards) ═══ */}
            {/* Chart right (315,130) → Table left (415,155). Mid-x=365 */}
            <path className="canvas-connector" pathLength="1"
              d="M 315 130 C 365 130, 365 155, 415 155"
              stroke="#10B981" strokeWidth="2" fill="none" opacity="0.5" />
            {/* Invoice right (305,385) → Table left-lower (415,230). Mid-x=360 */}
            <path className="canvas-connector delay-1" pathLength="1"
              d="M 305 385 C 360 385, 360 230, 415 230"
              stroke="#10B981" strokeWidth="2" fill="none" opacity="0.5" />
            {/* Table right (765,110) → KPI left (865,110). Gentle downward arc */}
            <path className="canvas-connector delay-2" pathLength="1"
              d="M 765 110 C 798 122, 832 122, 865 110"
              stroke="#10B981" strokeWidth="2" fill="none" opacity="0.5" />
            {/* Table bottom (590,300) → Budget top (590,395). Gentle rightward arc */}
            <path className="canvas-connector delay-3" pathLength="1"
              d="M 590 300 C 602 332, 602 363, 590 395"
              stroke="#10B981" strokeWidth="2" fill="none" opacity="0.5" />
            {/* KPI bottom (970,175) → Projection top (970,275). Gentle leftward arc */}
            <path className="canvas-connector delay-4" pathLength="1"
              d="M 970 175 C 958 208, 958 242, 970 275"
              stroke="#10B981" strokeWidth="2" fill="none" opacity="0.3" />

            {/* ═══ CARD 1: Monthly Revenue Chart ═══ */}
            <CanvasCard x={chartCard.x} y={chartCard.y} width={chartCard.w} height={chartCard.h}>
              <div style={{ padding: '12px 12px 4px' }}>
                <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monthly Revenue</div>
              </div>
              <div style={{ padding: '0 12px 8px', display: 'flex', alignItems: 'flex-end', gap: '5px', flex: 1 }}>
                {[
                  { h: '45%', label: 'Jan' },
                  { h: '62%', label: 'Feb' },
                  { h: '38%', label: 'Mar' },
                  { h: '80%', label: 'Apr' },
                  { h: '55%', label: 'May' },
                  { h: '92%', label: 'Jun' },
                ].map((bar) => (
                  <div key={bar.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                    <div style={{ width: '100%', background: '#10B981', borderRadius: '1px 1px 0 0', height: bar.h }} />
                    <div style={{ fontSize: '7px', color: 'rgba(255,255,255,0.4)', marginTop: '3px', fontFamily: "'IBM Plex Mono', monospace" }}>{bar.label}</div>
                  </div>
                ))}
              </div>
            </CanvasCard>

            {/* ═══ CARD 2: Invoice ═══ */}
            <CanvasCard x={invoiceCard.x} y={invoiceCard.y} width={invoiceCard.w} height={invoiceCard.h}>
              <div style={{ padding: '12px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '8px', fontFamily: "'IBM Plex Mono', monospace", color: 'rgba(255,255,255,0.4)' }}>INV-2026-087</span>
                <span style={{ fontSize: '8px', fontWeight: 500, padding: '2px 6px', borderRadius: '2px', background: 'rgba(16,185,129,0.2)', color: '#10B981' }}>PAID</span>
              </div>
              <div style={{ padding: '8px 12px 0' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'white', marginBottom: '8px' }}>INVOICE</div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)', marginBottom: '2px' }}>Bill To</div>
                <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.8)', fontFamily: "'IBM Plex Mono', monospace", marginBottom: '6px' }}>Acme Corp</div>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>4 items</div>
              </div>
              <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ fontSize: '8px', color: 'rgba(255,255,255,0.4)' }}>Total</div>
                <div style={{ fontSize: '20px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'white' }}>$24,500</div>
              </div>
            </CanvasCard>

            {/* ═══ CARD 3: Q2 Transactions Table ═══ */}
            <CanvasCard x={tableCard.x} y={tableCard.y} width={tableCard.w} height={tableCard.h}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.02)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" /></svg>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>Q2 Transactions</span>
              </div>
              <div style={{ padding: '6px 12px' }}>
                <div style={{ display: 'flex', fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '6px', marginBottom: '4px' }}>
                  <div style={{ width: '18%' }}>Date</div>
                  <div style={{ width: '34%' }}>Description</div>
                  <div style={{ width: '24%' }}>Category</div>
                  <div style={{ width: '24%', textAlign: 'right' }}>Amount</div>
                </div>
                {[
                  { date: 'Apr 01', desc: 'AWS Infrastructure', cat: 'Engineering', amt: '-$12,400', color: 'rgba(255,255,255,0.7)' },
                  { date: 'Apr 03', desc: 'Client Payment', cat: 'Revenue', amt: '+$45,000', color: '#10B981', stripe: true },
                  { date: 'Apr 07', desc: 'Marketing Campaign', cat: 'Marketing', amt: '-$8,200', color: 'rgba(255,255,255,0.7)' },
                  { date: 'Apr 12', desc: 'Office Lease', cat: 'Operations', amt: '-$6,500', color: 'rgba(255,255,255,0.7)', stripe: true },
                  { date: 'Apr 15', desc: 'Consulting Fee', cat: 'Revenue', amt: '+$24,500', color: '#10B981' },
                ].map((row) => (
                  <div key={row.date} style={{ display: 'flex', fontSize: '9px', fontFamily: "'IBM Plex Mono', monospace", padding: '4px 0', background: row.stripe ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                    <div style={{ width: '18%', color: 'rgba(255,255,255,0.4)' }}>{row.date}</div>
                    <div style={{ width: '34%', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.desc}</div>
                    <div style={{ width: '24%', color: 'rgba(255,255,255,0.4)' }}>{row.cat}</div>
                    <div style={{ width: '24%', textAlign: 'right', color: row.color }}>{row.amt}</div>
                  </div>
                ))}
              </div>
              <div style={{ height: '24px', background: 'linear-gradient(to top, #161616, transparent)' }} />
            </CanvasCard>

            {/* ═══ CARD 4: KPI ═══ */}
            <CanvasCard x={kpiCard.x} y={kpiCard.y} width={kpiCard.w} height={kpiCard.h}>
              <div style={{ padding: '12px 12px 0' }}>
                <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Monthly Revenue</div>
              </div>
              <div style={{ padding: '8px 12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: '26px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'white' }}>$142,800</div>
              </div>
              <div style={{ padding: '0 12px', marginTop: 'auto' }}>
                <svg style={{ width: '100%', height: '30px', display: 'block' }} viewBox="0 0 210 30" preserveAspectRatio="none">
                  <path d="M 0 25 C 30 23, 50 20, 70 17 C 90 14, 110 11, 130 8 C 150 5, 175 3, 210 1" fill="none" stroke="#10B981" strokeWidth="1.5" opacity="0.2" />
                  <path d="M 0 25 C 30 23, 50 20, 70 17 C 90 14, 110 11, 130 8 C 150 5, 175 3, 210 1 L 210 30 L 0 30 Z" fill="#10B981" opacity="0.08" />
                </svg>
              </div>
              <div style={{ padding: '6px 12px 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
                <span style={{ fontSize: '10px', fontFamily: "'IBM Plex Mono', monospace", color: '#10B981' }}>+8.3%</span>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>vs last month</span>
              </div>
            </CanvasCard>

            {/* ═══ CARD 5: Projection ═══ */}
            <CanvasCard x={projCard.x} y={projCard.y} width={projCard.w} height={projCard.h}>
              <div style={{ padding: '12px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Projection</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>7% · 5yr</div>
              </div>
              <div style={{ padding: '8px 12px' }}>
                <svg style={{ width: '100%', height: '60px' }} viewBox="0 0 200 60" preserveAspectRatio="none">
                  <path d="M 0 55 C 40 50, 80 40, 120 28 C 150 18, 175 10, 200 5 L 200 60 L 0 60 Z" fill="#10B981" opacity="0.1" />
                  <path d="M 0 55 C 40 50, 80 40, 120 28 C 150 18, 175 10, 200 5" fill="none" stroke="#10B981" strokeWidth="2" />
                </svg>
              </div>
              <div style={{ padding: '0 12px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>$500K</span>
                <span style={{ fontSize: '18px', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'white' }}>$842,000</span>
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>$10K/mo</span>
                <span style={{ fontSize: '9px', color: '#10B981', fontFamily: "'IBM Plex Mono', monospace" }}>+$342K growth</span>
              </div>
            </CanvasCard>

            {/* ═══ CARD 6: Budget ═══ */}
            <CanvasCard x={budgetCard.x} y={budgetCard.y} width={budgetCard.w} height={budgetCard.h}>
              <div style={{ padding: '12px 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontSize: '9px', fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Budget</div>
                <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>Q2 2026</div>
              </div>
              <div style={{ padding: '0 12px' }}>
                {[
                  { name: 'Engineering', dot: '#3b82f6', pct: 65, bar: '#10B981', w: '65%' },
                  { name: 'Marketing', dot: '#a855f7', pct: 82, bar: '#f59e0b', w: '82%' },
                  { name: 'Operations', dot: '#94a3b8', pct: 45, bar: '#10B981', w: '45%' },
                ].map((cat) => (
                  <div key={cat.name} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: cat.dot }} />
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.7)' }}>{cat.name}</span>
                      </div>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', fontFamily: "'IBM Plex Mono', monospace" }}>{cat.pct}%</span>
                    </div>
                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: '3px', background: cat.bar, width: cat.w }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 12px' }} />
              <div style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '9px', fontWeight: 500, padding: '2px 6px', borderRadius: '2px', background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>64% spent</span>
                <span style={{ fontSize: '9px', color: '#10B981', fontFamily: "'IBM Plex Mono', monospace" }}>$87,700 left</span>
              </div>
            </CanvasCard>
          </svg>
        </div>
      </SectionReveal>
    </section>
  );
}

function DocSection() {
  const docSvgRef = useRef<SVGSVGElement>(null);
  const [docVisible, setDocVisible] = useState(false);

  useEffect(() => {
    const el = docSvgRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) { setDocVisible(true); obs.disconnect(); } },
      { threshold: 0.2 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const files = [
    { name: 'quarterly_revenue.csv', ext: 'CSV', color: '#10B981', y: 30 },
    { name: 'financial_model_v2.xlsx', ext: 'XLSX', color: '#3B82F6', y: 135 },
    { name: 'invoice_acme_q1.pdf', ext: 'PDF', color: '#F59E0B', y: 240 },
  ];

  const parsed = [
    { label: 'Revenue', value: '$284,600', source: 'CSV', sourceColor: '#10B981' },
    { label: 'OpEx', value: '$124,800', source: 'XLSX', sourceColor: '#3B82F6' },
    { label: 'Invoice Total', value: '$24,500', source: 'PDF', sourceColor: '#F59E0B' },
  ];

  return (
    <section className="w-full py-32 px-6 relative border-t border-white/5 bg-[#0A0A0A]">
      <SectionReveal>
        <div className="max-w-7xl mx-auto flex flex-col items-center text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/60 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            INGESTION
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
            Drag, drop, parse.
          </h2>
          <p className="text-lg text-white/50 max-w-2xl leading-relaxed">
            Upload CSVs, Excel models, or even unstructured PDF invoices. A4 automatically parses the data, categorizes it, and makes it available to the AI and your canvas.
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="border border-white/10 bg-[#111111] overflow-hidden rounded-lg shadow-2xl">
            {/* Window chrome */}
            <div className="h-10 border-b border-white/10 bg-[#161616] flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <div className="w-3 h-3 rounded-full bg-white/20" />
              <span className="ml-3 text-[10px] font-mono text-white/30">document pipeline</span>
            </div>

            <svg
              ref={docSvgRef}
              data-visible={docVisible}
              viewBox="0 0 900 340"
              preserveAspectRatio="xMidYMid meet"
              className="w-full block"
            >
              <defs>
                <pattern id="doc-dotgrid" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="0.8" fill="rgba(255,255,255,0.08)" />
                </pattern>
              </defs>
              <rect x="0" y="0" width="900" height="340" fill="url(#doc-dotgrid)" />

              {/* Connectors — file cards to parsed output */}
              <path className="doc-connector" pathLength="1"
                d="M 280 75 C 400 75, 440 78, 560 78"
                stroke="#10B981" strokeWidth="2" fill="none" opacity="0.5" />
              <path className="doc-connector delay-1" pathLength="1"
                d="M 280 180 C 400 180, 440 148, 560 148"
                stroke="#3B82F6" strokeWidth="2" fill="none" opacity="0.5" />
              <path className="doc-connector delay-2" pathLength="1"
                d="M 280 285 C 400 285, 440 218, 560 218"
                stroke="#F59E0B" strokeWidth="2" fill="none" opacity="0.5" />

              {/* Animated dots traveling along connectors */}
              {docVisible && (
                <>
                  <circle r="3" fill="#10B981" opacity="0.8">
                    <animateMotion dur="2.5s" repeatCount="indefinite" path="M 280 75 C 400 75, 440 78, 560 78" />
                  </circle>
                  <circle r="3" fill="#3B82F6" opacity="0.8">
                    <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.4s" path="M 280 180 C 400 180, 440 148, 560 148" />
                  </circle>
                  <circle r="3" fill="#F59E0B" opacity="0.8">
                    <animateMotion dur="2.5s" repeatCount="indefinite" begin="0.8s" path="M 280 285 C 400 285, 440 218, 560 218" />
                  </circle>
                </>
              )}

              {/* File cards */}
              {files.map((file) => (
                <foreignObject key={file.ext} x={40} y={file.y} width={240} height={80} overflow="hidden">
                  <div style={{
                    width: '100%', height: '100%',
                    background: '#161616', border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px',
                    fontFamily: "'IBM Plex Mono', 'DM Sans', system-ui, sans-serif",
                  }}>
                    <div style={{
                      width: '36px', height: '44px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '8px', fontWeight: 600, color: file.color, letterSpacing: '0.05em' }}>
                        {file.ext}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                      <div style={{
                        fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {file.name}
                      </div>
                      <div style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)', marginTop: '4px' }}>
                        Parsed successfully
                      </div>
                    </div>
                  </div>
                </foreignObject>
              ))}

              {/* Parsed output card */}
              <foreignObject x={560} y={20} width={300} height={300} overflow="hidden">
                <div style={{
                  width: '100%', height: '100%',
                  background: '#161616', border: '1px solid rgba(255,255,255,0.1)',
                  fontFamily: "'IBM Plex Mono', 'DM Sans', system-ui, sans-serif",
                  display: 'flex', flexDirection: 'column',
                }}>
                  <div style={{
                    padding: '14px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: '9px', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Extracted Data
                    </span>
                    <span style={{ fontSize: '9px', color: '#10B981' }}>3 sources</span>
                  </div>
                  <div style={{ flex: 1, padding: '8px 0' }}>
                    {parsed.map((row, i) => (
                      <div key={row.label} style={{
                        padding: '12px 16px', display: 'flex', alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: i < parsed.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', marginBottom: '4px' }}>
                            {row.label}
                          </div>
                          <div style={{ fontSize: '16px', fontWeight: 600, color: 'white', fontFamily: "'IBM Plex Mono', monospace", fontVariantNumeric: 'tabular-nums' }}>
                            {row.value}
                          </div>
                        </div>
                        <div style={{
                          padding: '2px 8px', background: `${row.sourceColor}15`,
                          border: `1px solid ${row.sourceColor}30`,
                          fontSize: '8px', fontWeight: 600, color: row.sourceColor,
                          letterSpacing: '0.05em',
                        }}>
                          {row.source}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                    <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.3)' }}>
                      Ready for AI analysis
                    </span>
                  </div>
                </div>
              </foreignObject>
            </svg>
          </div>
        </div>
      </SectionReveal>
    </section>
  );
}

export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Enable smooth scrolling and force dark mode for the marketing site
  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      document.documentElement.style.scrollBehavior = "";
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);
  return (
    <div className="landing-page relative min-h-screen bg-[#0D0D0D] text-white font-sans selection:bg-white/20 selection:text-white overflow-x-hidden flex flex-col scroll-smooth">

      {/* Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 bg-[#0D0D0D]/80 backdrop-blur-md border-b border-primary/20 h-24 flex items-center px-6 md:px-12 transition-all duration-300">

        {/* Left Half */}
        <div className="flex-1 flex items-center relative h-full">
          {/* Mobile Hamburger Menu Icon (Visible only on small screens) */}
          <button
            className="md:hidden p-2 -ml-2 text-white relative"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            <div className={`w-5 h-[2px] bg-current transition-all duration-200 ${mobileMenuOpen ? 'rotate-45 translate-y-[5.5px]' : 'mb-1.5'}`} />
            <div className={`w-5 h-[2px] bg-current transition-all duration-200 ${mobileMenuOpen ? 'opacity-0' : 'mb-1.5'}`} />
            <div className={`w-5 h-[2px] bg-current transition-all duration-200 ${mobileMenuOpen ? '-rotate-45 -translate-y-[5.5px]' : ''}`} />
          </button>

          {/* Mobile Menu Content */}
          {mobileMenuOpen && (
            <div className="absolute top-24 left-0 w-full bg-[#1A1A1A] border-b border-white/10 flex flex-col text-left py-4 md:hidden z-50">
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-6 py-3 font-medium hover:bg-white/5">Pricing</a>
              <Link to="/sign-in" onClick={() => setMobileMenuOpen(false)} className="px-6 py-3 font-medium hover:bg-white/5">Log in</Link>
              <Link to="/sign-up" onClick={() => setMobileMenuOpen(false)} className="px-6 py-3 font-medium hover:bg-white/5 text-primary">Get Started</Link>
            </div>
          )}

          <div className="hidden md:flex items-center gap-10 text-base font-medium text-white/70 absolute left-1/2 -translate-x-1/2">
            <div className="flex items-center gap-2">
              <svg width="68" height="84" viewBox="0 0 68 84" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-16 w-auto -ml-2">
                <path d="M6 76 L6 4 L62 4" stroke="#10B981" strokeWidth="1.5" strokeLinejoin="miter" fill="none" opacity="0.2"/>
                <path d="M62 4 L62 76 L6 76" stroke="#10B981" strokeWidth="2.5" strokeLinejoin="miter" fill="none"/>
                <text x="34" y="49" textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="23" fontWeight="600" letterSpacing="-0.5" fill="currentColor">A4</text>
              </svg>
            </div>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
          </div>
        </div>

        {/* Right Half */}
        <div className="flex-1 flex items-center justify-end h-full">
          <div className="hidden md:flex items-center gap-8 text-base font-medium">
            <Link to="/sign-in" className="text-white/70 hover:text-white transition-colors">Log in</Link>
            <Link to="/sign-up" className="h-10 px-6 text-sm font-semibold bg-white text-black hover:bg-white/90 rounded-full transition-colors flex items-center gap-2">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main
        className="min-h-screen flex flex-col items-center justify-center pt-24 pb-12 px-6 z-10 text-center relative w-full text-white overflow-hidden"
        style={{
          backgroundColor: '#0A0A0A',
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='2' height='2' fill='rgba(255, 255, 255, 0.10)'/%3E%3C/svg%3E")`
        }}
      >
         <div className="absolute inset-0 z-0 pointer-events-none">
           <CanvasBackground />
         </div>

         <div className="relative z-10 flex flex-col items-center w-full px-4">
           <motion.div
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
             className="bg-[#161616]/90 backdrop-blur-md rounded-none p-8 md:p-12 flex flex-col items-center w-full max-w-3xl relative"
             style={{
               borderTop: "1.5px solid rgba(16, 185, 129, 0.2)",
               borderLeft: "1.5px solid rgba(16, 185, 129, 0.2)",
               borderRight: "2.5px solid #10B981",
               borderBottom: "2.5px solid #10B981"
             }}
           >
             <h1
               className="text-4xl md:text-5xl lg:text-6xl font-semibold mb-6 tracking-[-0.04em] leading-[1.05] max-w-2xl text-center"
             >
               Your AI-powered financial workspace.
             </h1>

             <p
               className="text-lg md:text-xl text-white/60 mb-10 max-w-xl font-normal leading-relaxed text-center"
             >
               Upload documents, build dashboards, and let AI analyze your entire financial picture.
             </p>

             {/* Animated Chat Input Mockup */}
             <div className="w-full max-w-2xl mb-10">
               <HeroChatInput />
             </div>

             <div className="flex flex-col sm:flex-row items-center gap-4">
               <Link to="/sign-up" className="h-12 px-6 rounded-full bg-white text-black hover:bg-white/90 font-semibold text-base transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2">
                 Get Started Free
                 <ArrowRight size={16} />
               </Link>
               <a href="#pricing" className="h-12 px-6 rounded-full bg-transparent text-white/80 hover:text-white hover:bg-white/5 font-semibold text-base transition-colors flex items-center justify-center border border-white/10">
                 See Pricing
               </a>
             </div>
           </motion.div>
         </div>

      </main>


      {/* Feature Section 1: The Canvas */}
      <CanvasSection />

      {/* Feature Section 2: Document Handling */}
      <DocSection />

      {/* Feature Section 3: AI Chat */}
      <section className="w-full py-32 px-6 relative border-t border-white/5 bg-[#0A0A0A]">
        <SectionReveal className="max-w-7xl mx-auto">
          {/* Top — Copy */}
          <div className="text-center mb-16 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/60 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              INTELLIGENCE
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
              Talk to your money.
            </h2>
            <p className="text-lg text-white/50 max-w-xl leading-relaxed">
              Meet Paige, your AI assistant scoped to your workspace data. Ask complex questions, get instant analysis, and generate financial reports — all inside your workspace.
            </p>
          </div>

          {/* Bottom — Paige animation + Chat demo side by side */}
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16">
            {/* Paige card flip */}
            <div className="hidden md:flex shrink-0 items-center justify-center" style={{ perspective: '900px', width: '200px' }}>
              <div style={{ position: 'relative', width: '160px', height: '208px', transformStyle: 'preserve-3d' }}>
                <div style={{ position: 'absolute', bottom: '-18px', left: '50%', transform: 'translateX(-50%)', width: '120px', height: '8px', background: 'radial-gradient(ellipse, rgba(16,185,129,0.12) 0%, transparent 70%)', animation: 'darkShadow 7s ease infinite' }} />
                {/* Paige face (revealed behind cover) */}
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transform: 'scale(0.92)', animation: 'darkPaige 7s ease infinite' }}>
                  <svg width="160" height="208" viewBox="0 0 160 208" fill="none">
                    <path d="M12 196 L12 12 L148 12" stroke="#10B981" strokeWidth="2" strokeLinejoin="miter" fill="none" opacity="0.2"/>
                    <path d="M148 12 L148 196 L12 196" stroke="#10B981" strokeWidth="3.5" strokeLinejoin="miter" fill="none"/>
                    <circle cx="62" cy="88" r="7" fill="#10B981"/>
                    <circle cx="98" cy="88" r="7" fill="#10B981"/>
                    <path d="M62 132 Q80 154 98 132" stroke="#10B981" strokeWidth="4.5" strokeLinecap="round" fill="none"/>
                  </svg>
                </div>
                {/* Cover (flips open) */}
                <div style={{ position: 'absolute', inset: 0, transformStyle: 'preserve-3d', transformOrigin: 'left center', animation: 'darkCover 7s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}>
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="160" height="208" viewBox="0 0 160 208" fill="none">
                      <rect x="0" y="0" width="160" height="208" fill="#0A0A0A"/>
                      <path d="M12 196 L12 12 L148 12" stroke="#10B981" strokeWidth="2" strokeLinejoin="miter" fill="none" opacity="0.2"/>
                      <path d="M148 12 L148 196 L12 196" stroke="#10B981" strokeWidth="3.5" strokeLinejoin="miter" fill="none"/>
                      <text x="80" y="116" textAnchor="middle" fontFamily="'DM Sans', sans-serif" fontSize="42" fontWeight="600" letterSpacing="-1" fill="#FFFFFF">A4</text>
                    </svg>
                  </div>
                  <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <svg width="160" height="208" viewBox="0 0 160 208" fill="none">
                      <rect x="0" y="0" width="160" height="208" fill="#1A1A1A"/>
                      <path d="M12 196 L12 12 L148 12" stroke="#10B981" strokeWidth="1" strokeLinejoin="miter" fill="none" opacity="0.06"/>
                      <path d="M148 12 L148 196 L12 196" stroke="#10B981" strokeWidth="1" strokeLinejoin="miter" fill="none" opacity="0.06"/>
                      {[50, 70, 90, 110, 130, 150].map(y => (
                        <line key={y} x1="30" y1={y} x2={60 + (y % 40)} y2={y} stroke="#10B981" strokeWidth="0.5" opacity="0.06"/>
                      ))}
                    </svg>
                  </div>
                </div>
                <div style={{ position: 'absolute', bottom: '-40px', left: '50%', transform: 'translateX(-50%)', fontFamily: "'IBM Plex Mono', monospace", fontSize: '10px', letterSpacing: '0.06em', textTransform: 'uppercase', color: '#10B981', whiteSpace: 'nowrap', opacity: 0, animation: 'darkLabel 7s ease infinite' }}>Meet Paige</div>
              </div>
            </div>

            {/* Chat demo */}
            <div className="flex-1 w-full min-w-0">
              <div className="border border-white/10 bg-[#161616] rounded-lg overflow-hidden shadow-2xl">
              {/* Window chrome */}
              <div className="h-9 border-b border-white/10 bg-[#111111] flex items-center px-3 gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/15" />
                <span className="ml-3 text-[10px] font-mono text-white/30">paige — Q1 Analysis</span>
              </div>

              {/* Chat body */}
              <div className="p-5 space-y-5">
                {/* User message */}
                <div className="flex items-start gap-3 justify-end">
                  <div className="max-w-[80%] px-4 py-3 bg-white/5 border border-white/5 rounded text-xs text-white/70 font-mono leading-relaxed">
                    Here's my Q1 data across three sources.<br/>
                    Generate a P&L statement.
                  </div>
                  <div className="w-7 h-7 rounded bg-white/10 flex items-center justify-center text-[10px] font-mono text-white/50 shrink-0">U</div>
                </div>

                {/* Paige response */}
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                  <div className="max-w-[85%] space-y-3">
                    <div className="px-4 py-3 bg-[#111111] border border-white/10 rounded text-xs text-white/60 font-mono leading-relaxed">
                      Analyzed <span className="text-white/80">3 sources</span> — bank transactions, invoices, and expense reports. Here's your consolidated P&L:
                    </div>

                    {/* Generated P&L card */}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: 0.3 }}
                      className="border border-primary/25 bg-[#111111] rounded overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-white/[0.06] flex justify-between items-center bg-primary/[0.03]">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                          <span className="text-[10px] font-mono text-white/70 font-medium">Q1 2026 — Profit & Loss</span>
                        </div>
                        <span className="text-[9px] font-mono text-primary/70 px-1.5 py-0.5 bg-primary/10 rounded">GENERATED</span>
                      </div>
                      <div className="px-4 py-3 space-y-2">
                        {[
                          { label: 'Revenue', value: '$284,600', color: 'text-[#10B981]' },
                          { label: 'Cost of Goods Sold', value: '-$98,200', color: 'text-white/60' },
                          { label: 'Gross Profit', value: '$186,400', color: 'text-white/80', bold: true, border: true },
                          { label: 'Operating Expenses', value: '-$124,800', color: 'text-white/60' },
                          { label: 'Net Income', value: '$61,600', color: 'text-[#10B981]', bold: true, border: true },
                        ].map((row) => (
                          <div key={row.label} className={`flex justify-between items-center py-1.5 ${row.border ? 'border-t border-white/[0.06] pt-2' : ''}`}>
                            <span className={`text-[11px] ${row.bold ? 'text-white/80 font-medium' : 'text-white/40'}`}>{row.label}</span>
                            <span className={`text-[11px] font-mono ${row.bold ? 'font-semibold' : ''} ${row.color}`}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-2 border-t border-white/[0.06] flex items-center gap-2">
                        <span className="text-[9px] font-mono text-primary">21.6% net margin</span>
                        <span className="text-[9px] text-white/20">·</span>
                        <span className="text-[9px] font-mono text-white/30">vs Q4: +12.3%</span>
                      </div>
                    </motion.div>

                    {/* Typing indicator */}
                    <div className="px-4 py-2.5 bg-[#111111] border border-white/10 rounded inline-flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0 }} className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-primary/60" />
                      </div>
                      <span className="text-[10px] font-mono text-white/30">Adding to canvas...</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Input bar */}
              <div className="h-11 border-t border-white/10 bg-[#111111] flex items-center px-4 gap-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                <span className="text-xs text-white/20 font-mono">Ask Paige anything about your workspace...</span>
              </div>
            </div>
          </div>
          </div>
        </SectionReveal>
      </section>

      {/* Feature Section 4: Workflows */}
      <section className="w-full py-32 px-6 relative border-t border-white/5 bg-[#111111]">
        <SectionReveal className="max-w-7xl mx-auto">
          <div className="mb-16">
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
              See what you can build.
            </h2>
            <p className="text-lg text-white/50 max-w-xl leading-relaxed">
              Stop fighting rigid dashboards. Snap together modular instruments to model complex scenarios, forecast your runway, and see your whole financial picture at once.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <TaxPrepTile />
            <RunwayTile />
            <PortfolioTile />
          </div>
        </SectionReveal>
      </section>

      {/* Feature Section 6: Vault / Security */}
      <section className="w-full py-32 px-6 relative border-t border-white/5 bg-[#0A0A0A]">
        <SectionReveal>
          <div className="max-w-7xl mx-auto flex flex-col items-center text-center mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-white/60 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              VAULT
            </div>
            <h2 className="text-4xl md:text-5xl font-semibold tracking-tight mb-6">
              Your secrets, your key.
            </h2>
            <p className="text-lg text-white/50 max-w-2xl leading-relaxed">
              Sensitive data is encrypted in your browser with a passphrase only you know.
              The server stores ciphertext it can never decrypt.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <div className="border border-white/10 bg-[#161616] p-8 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-primary/40" />

              {/* Encryption flow visualization */}
              <div className="font-mono text-xs text-primary mb-8 flex items-center gap-2">
                <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                VAULT_ENCRYPTION
              </div>

              {/* Step 1: Passphrase */}
              <div className="mb-6">
                <div className="font-mono text-[10px] text-white/40 mb-2">STEP 1 — YOUR PASSPHRASE</div>
                <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/5 rounded">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0">
                    <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2" className="text-primary" />
                    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" strokeWidth="1.2" className="text-primary" />
                  </svg>
                  <div className="font-mono text-sm text-white/80 tracking-wider">
                    maple &middot; summit &middot; orchid
                  </div>
                  <div className="ml-auto font-mono text-[10px] text-white/30">3 words · never sent to server</div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center my-4">
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M10 2v16M4 14l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20" />
                </svg>
              </div>

              {/* Step 2: Key Derivation */}
              <div className="mb-6">
                <div className="font-mono text-[10px] text-white/40 mb-2">STEP 2 — KEY DERIVATION</div>
                <div className="p-3 bg-white/[0.03] border border-white/5 rounded font-mono text-[11px]">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/50">algorithm</span>
                    <span className="text-white/80">PBKDF2-SHA256</span>
                  </div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/50">iterations</span>
                    <span className="text-primary">600,000</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">output</span>
                    <span className="text-white/80">AES-256-GCM key</span>
                  </div>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex justify-center my-4">
                <svg width="20" height="24" viewBox="0 0 20 24" fill="none">
                  <path d="M10 2v16M4 14l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20" />
                </svg>
              </div>

              {/* Step 3: Encrypted Output */}
              <div>
                <div className="font-mono text-[10px] text-white/40 mb-2">STEP 3 — WHAT THE SERVER SEES</div>
                <div className="p-3 bg-white/[0.03] border border-white/5 rounded font-mono text-[11px]">
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/50">salt</span>
                    <span className="text-white/30">dG9wLXNlY3JldC1zYWx0...</span>
                  </div>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-white/50">ciphertext</span>
                    <span className="text-white/30">xK9mF2pQ7vN3bR8wYjL...</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-white/50">plaintext</span>
                    <span className="text-primary/60">never stored</span>
                  </div>
                </div>
              </div>

              {/* Bottom note */}
              <div className="mt-8 p-4 bg-primary/5 border border-primary/20 text-primary text-xs font-mono">
                &gt; Encryption runs entirely in your browser via WebCrypto. No keys leave the client.
              </div>
            </div>
          </div>
        </SectionReveal>
      </section>

      {/* Feature Section 7: Pricing */}
      <section id="pricing" className="w-full py-32 px-6 relative border-t border-white/5 bg-[#111111]">
        <SectionReveal className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
              Free while in early access
            </h2>
            <p className="text-lg text-white/50 max-w-xl mx-auto leading-relaxed">
              Everything below is included. No credit card required.
            </p>
          </div>

          <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-px bg-white/10 border border-white/10">
            {/* Free (Early Access) */}
            <div className="bg-[#161616] p-10 flex flex-col h-full hover:bg-[#1A1A1A] transition-colors relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-[2px] bg-primary transition-colors" />
              <div className="text-sm font-mono text-primary mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Free
              </div>
              <div className="text-4xl font-mono font-medium mb-4 flex items-baseline">
                $0<span className="text-lg text-white/40 ml-1">/mo</span>
              </div>
              <p className="text-white/50 mb-8 min-h-[48px]">
                Full access during early access
              </p>
              <ul className="space-y-3 text-sm text-white/70 font-mono mb-10 flex-1">
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> All 27 canvas tools</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Unlimited workspaces</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Document upload + AI parsing</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> AI chat assistant (Paige)</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Vault encryption</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Market data quotes</li>
              </ul>
              <Link to="/sign-up" className="w-full h-12 rounded-full bg-white text-black font-semibold text-sm hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center">
                Get Started Free
              </Link>
            </div>

            {/* Pro (Coming Soon) */}
            <div className="bg-[#161616] p-10 flex flex-col h-full hover:bg-[#1A1A1A] transition-colors relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-primary/0 group-hover:bg-primary/50 transition-colors" />
              <div className="text-sm font-mono text-white/40 mb-2">Pro</div>
              <div className="text-4xl font-mono font-medium mb-4 flex items-baseline">
                Coming Soon
              </div>
              <p className="text-white/50 mb-8 min-h-[48px]">
                For teams and power users
              </p>
              <ul className="space-y-3 text-sm text-white/70 font-mono mb-10 flex-1">
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Everything in Free</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Bank & payment integrations</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Team collaboration & sharing</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Priority support</li>
                <li className="flex items-start gap-3"><span className="text-primary mt-0.5">&#10003;</span> Advanced analytics</li>
              </ul>
              <Link to="/sign-up" className="w-full h-12 rounded-full border border-white/20 text-white font-semibold text-sm hover:bg-white/5 transition-colors mt-auto flex items-center justify-center">
                Join Waitlist
              </Link>
            </div>
          </div>

          <div className="mt-8 text-center text-xs font-mono text-white/40">
            Free during early access. No credit card required.
          </div>
        </SectionReveal>
      </section>

      {/* Bottom CTA */}
      <section className="w-full py-40 px-6 relative border-t border-white/5 bg-[#0A0A0A] flex flex-col items-center justify-center text-center">
        <SectionReveal className="flex flex-col items-center">
        <h2 className="text-5xl md:text-7xl font-semibold tracking-tight mb-12 max-w-4xl relative z-10">
          Take control of your financial stack.
        </h2>

        <Link to="/sign-up" className="h-14 px-8 rounded-full bg-white text-black hover:bg-white/90 font-semibold text-lg transition-transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 relative z-10">
          Start for Free
        </Link>
        </SectionReveal>
      </section>

      {/* Footer */}
      <footer className="w-full bg-[#111111] text-white font-sans mt-auto">
        <div className="px-8 md:px-16 py-6 flex items-center justify-center border-t border-white/[0.06]">
          <span className="font-mono text-[11px] text-white/20">
            &copy; 2026 A4 Systems Inc. All rights reserved.
          </span>
        </div>
      </footer>

    </div>
  );
}
