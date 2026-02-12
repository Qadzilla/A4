import { Badge, Button } from '@a4/ui';
import { useCallback, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from 'recharts';

const stats = [
  { label: 'AI Messages', used: 0, limit: 100, unit: '' },
  { label: 'Document Storage', used: 0, limit: 1024, unit: 'MB', limitDisplay: '1 GB' },
  { label: 'API Calls', used: 0, limit: 1000, unit: '' },
];

const resourceCategories = [
  {
    category: 'AI',
    items: [
      { name: 'AI Messages', used: '0', limit: '100', unitPrice: '$0.05 / message', cost: '$0.00' },
      { name: 'Document Analysis', used: '0', limit: '50', unitPrice: '$0.10 / doc', cost: '$0.00' },
    ],
  },
  {
    category: 'Storage',
    items: [
      { name: 'Document Storage', used: '0 MB', limit: '1 GB', unitPrice: '$0.50 / GB', cost: '$0.00' },
    ],
  },
  {
    category: 'Integrations',
    items: [
      { name: 'API Calls', used: '0', limit: '1,000', unitPrice: '$0.002 / call', cost: '$0.00' },
      { name: 'Plaid Connections', used: '0', limit: '3', unitPrice: '\u2014', cost: 'Included' },
      { name: 'Stripe Connections', used: '0', limit: '1', unitPrice: '\u2014', cost: 'Included' },
    ],
  },
];

function getDaysUntilReset() {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return endOfMonth.getDate() - now.getDate();
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all duration-300"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatNumber(n: number) {
  return n.toLocaleString();
}

export default function UsagePage() {
  const chartData = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      return {
        date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        messages: 0,
      };
    });
  }, []);

  const [activePoint, setActivePoint] = useState<{ date: string; messages: number } | null>(null);

  const handleMouseMove = useCallback((state: { activePayload?: { payload: { date: string; messages: number } }[] }) => {
    if (state.activePayload?.[0]) {
      setActivePoint(state.activePayload[0].payload);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActivePoint(null);
  }, []);

  const daysUntilReset = getDaysUntilReset();

  return (
    <div className="flex h-full items-start justify-center overflow-y-auto pt-[10vh]">
      <div className="mx-auto w-full max-w-4xl px-6 py-8 animate-fade-in">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Usage</h1>
        </div>

        {/* Plan summary card */}
        <div className="rounded-2xl border border-border/60 bg-card p-5 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Free</Badge>
              </div>
              <div className="text-[14px] text-muted-foreground">
                0 / 100 AI messages &bull; 0 / 1 GB storage
              </div>
              <div className="text-[13px] text-muted-foreground/70">
                Resets in {daysUntilReset} day{daysUntilReset !== 1 ? 's' : ''}
              </div>
            </div>
            <Button className="rounded-full" disabled>
              Upgrade
            </Button>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border/60 bg-card p-5">
              <div className="text-[13px] text-muted-foreground mb-2">{stat.label}</div>
              <div className="text-[18px] font-bold text-foreground mb-3">
                {formatNumber(stat.used)}{stat.unit ? ` ${stat.unit}` : ''}{' '}
                <span className="text-[13px] font-normal text-muted-foreground">
                  / {stat.limitDisplay ?? formatNumber(stat.limit)}
                </span>
              </div>
              <ProgressBar value={stat.used} max={stat.limit} />
            </div>
          ))}
        </div>

        {/* Area chart */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[16px] font-semibold text-foreground">Usage Over Time</h2>
              {activePoint && (
                <span className="text-[13px] text-muted-foreground">
                  {activePoint.date} &mdash; {activePoint.messages} messages
                </span>
              )}
            </div>
            <span className="text-[13px] text-muted-foreground">This Month</span>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card p-5">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart
                data={chartData}
                margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
              >
                <defs>
                  <linearGradient id="usageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  tickLine={false}
                  axisLine={false}
                />
                <Area
                  type="monotone"
                  dataKey="messages"
                  stroke="var(--color-primary)"
                  fill="url(#usageFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resource Usage table */}
        <div>
          <h2 className="text-[16px] font-semibold text-foreground mb-3">Resource Usage</h2>
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="px-5 py-3 text-left font-semibold text-muted-foreground">Resource</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Used</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Limit</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Unit Price</th>
                  <th className="px-5 py-3 text-right font-semibold text-muted-foreground">Cost</th>
                </tr>
              </thead>
              <tbody>
                {resourceCategories.map((cat) => (
                  <>
                    <tr key={cat.category} className="bg-muted/20">
                      <td colSpan={5} className="px-5 py-2.5 text-[13px] font-semibold text-foreground">
                        {cat.category}
                      </td>
                    </tr>
                    {cat.items.map((item) => (
                      <tr key={item.name} className="border-b border-border/30 last:border-0">
                        <td className="px-5 py-2.5 text-foreground">{item.name}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground">{item.used}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground">{item.limit}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground">{item.unitPrice}</td>
                        <td className="px-5 py-2.5 text-right text-muted-foreground">{item.cost}</td>
                      </tr>
                    ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
