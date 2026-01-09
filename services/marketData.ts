
import { Candle } from '../types';

const BINANCE_REST_URL = 'https://api.binance.com/api/v3/klines';
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws';

export const fetchBinanceKlines = async (symbol: string, interval: string, limit: number = 150): Promise<Candle[]> => {
  try {
    const response = await fetch(`${BINANCE_REST_URL}?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    
    return data.map((d: any) => ({
      time: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5])
    }));
  } catch (error) {
    console.error('Error fetching market data:', error);
    return [];
  }
};

export const subscribeToBinanceKlines = (symbol: string, interval: string, onUpdate: (candle: Candle) => void) => {
  const ws = new WebSocket(`${BINANCE_WS_URL}/${symbol.toLowerCase()}@kline_${interval}`);
  
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    const k = msg.k;
    if (k) {
      onUpdate({
        time: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v)
      });
    }
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
};
