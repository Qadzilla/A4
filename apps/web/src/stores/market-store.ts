import type { RealtimeQuote, RealtimeTrade } from '@a4/shared-types';
import { create } from 'zustand';

interface MarketState {
  quotes: Record<string, RealtimeQuote>;
  trades: Record<string, RealtimeTrade>;
  updateQuote: (symbol: string, quote: RealtimeQuote) => void;
  updateTrade: (symbol: string, trade: RealtimeTrade) => void;
  clear: () => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  quotes: {},
  trades: {},
  updateQuote: (symbol, quote) =>
    set((state) => ({
      quotes: { ...state.quotes, [symbol]: quote },
    })),
  updateTrade: (symbol, trade) =>
    set((state) => ({
      trades: { ...state.trades, [symbol]: trade },
    })),
  clear: () => set({ quotes: {}, trades: {} }),
}));
