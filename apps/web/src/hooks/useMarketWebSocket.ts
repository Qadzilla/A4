import { useMarketStore } from '@/stores/market-store';
import type { WsServerMessage } from '@a4/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';

type WsStatus = 'connecting' | 'connected' | 'disconnected';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const WS_URL = `${API_URL.replace(/^http/, 'ws')}/ws`;

const MAX_RECONNECT_DELAY = 30_000;
const BASE_RECONNECT_DELAY = 1_000;

/**
 * Hook to connect to the market data WebSocket.
 * Callers provide a getToken function for auth (from useAuth().getToken).
 * In dev bypass mode, pass `async () => null`.
 */
export function useMarketWebSocket(
  symbols: string[],
  channels: string[] = ['T', 'Q'],
  getToken: () => Promise<string | null> = async () => null,
) {
  const [status, setStatus] = useState<WsStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const symbolsRef = useRef(symbols);
  const channelsRef = useRef(channels);

  const updateQuote = useMarketStore((s) => s.updateQuote);
  const updateTrade = useMarketStore((s) => s.updateTrade);

  // Keep refs in sync
  symbolsRef.current = symbols;
  channelsRef.current = channels;

  const connect = useCallback(async () => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus('connecting');

    const token = await getToken();
    const url = token ? `${WS_URL}?token=${token}` : WS_URL;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;

      // Subscribe to requested symbols
      if (symbolsRef.current.length > 0) {
        ws.send(
          JSON.stringify({
            type: 'subscribe',
            symbols: symbolsRef.current,
            channels: channelsRef.current,
          }),
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsServerMessage;

        if (msg.type === 'trade') {
          updateTrade(msg.symbol, {
            symbol: msg.symbol,
            price: msg.price,
            size: msg.size,
            timestamp: msg.timestamp,
          });
        } else if (msg.type === 'quote') {
          updateQuote(msg.symbol, {
            symbol: msg.symbol,
            bid: msg.bid,
            ask: msg.ask,
            bidSize: msg.bidSize,
            askSize: msg.askSize,
            timestamp: msg.timestamp,
          });
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(
        BASE_RECONNECT_DELAY * 2 ** reconnectAttemptRef.current,
        MAX_RECONNECT_DELAY,
      );
      reconnectAttemptRef.current++;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror, which handles reconnect
    };
  }, [getToken, updateQuote, updateTrade]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (symbols.length === 0) return;

    connect();

    return () => {
      clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, symbols.length]);

  // Handle symbol changes while connected
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || symbols.length === 0) return;

    ws.send(
      JSON.stringify({
        type: 'subscribe',
        symbols,
        channels,
      }),
    );
  }, [symbols, channels]);

  return { status };
}
