
import { Candle, OrderBlock, FVG, MarketStructure, AnalysisResult, Config } from '../types';

export const analyzePriceData = (candles: Candle[], config: Config): AnalysisResult => {
  const orderBlocks: OrderBlock[] = [];
  const fvgs: FVG[] = [];
  const structure: MarketStructure[] = [];

  let bullScore = 0;
  let bearScore = 0;

  // 1. Fair Value Gaps (FVG) Detection
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];

    // Bullish FVG
    if (c2.high < c0.low && (c1.close > c1.open) && (c0.low - c2.high) > (c1.high - c1.low) * 0.3) {
      fvgs.push({
        type: 'bullish',
        top: c0.low,
        bottom: c2.high,
        index: i - 1,
        startTime: c1.time,
        isValid: true
      });
    }

    // Bearish FVG
    if (c2.low > c0.high && (c1.close < c1.open) && (c2.low - c0.high) > (c1.high - c1.low) * 0.3) {
      fvgs.push({
        type: 'bearish',
        top: c2.low,
        bottom: c0.high,
        index: i - 1,
        startTime: c1.time,
        isValid: true
      });
    }
  }

  // 2. Order Blocks (OB) Detection
  for (let i = 1; i < candles.length; i++) {
    const c0 = candles[i];
    const c1 = candles[i - 1];

    const bodySize = Math.abs(c0.close - c0.open);
    const prevRange = c1.high - c1.low;

    // Bullish OB: last bearish candle before bullish impulse
    if (c0.close > c0.open && c1.close < c1.open && bodySize > prevRange * 1.2) {
      orderBlocks.push({
        type: 'bullish',
        top: c1.high,
        bottom: c1.low,
        index: i - 1,
        startTime: c1.time,
        isValid: true
      });
    }

    // Bearish OB: last bullish candle before bearish impulse
    if (c0.close < c0.open && c1.close > c1.open && bodySize > prevRange * 1.2) {
      orderBlocks.push({
        type: 'bearish',
        top: c1.high,
        bottom: c1.low,
        index: i - 1,
        startTime: c1.time,
        isValid: true
      });
    }
  }

  // 3. Market Structure (BOS)
  const findPivots = (type: 'high' | 'low') => {
    const p = [];
    const len = config.swingLength;
    for (let i = len; i < candles.length - len; i++) {
      let isPivot = true;
      for (let j = 1; j <= len; j++) {
        if (type === 'high') {
          if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isPivot = false;
        } else {
          if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isPivot = false;
        }
      }
      if (isPivot) p.push({ val: type === 'high' ? candles[i].high : candles[i].low, idx: i, time: candles[i].time });
    }
    return p;
  };

  const highPivots = findPivots('high');
  const lowPivots = findPivots('low');

  // Simple BOS logic: if price breaks last pivot high/low
  if (highPivots.length >= 2) {
    const last = highPivots[highPivots.length - 1];
    const prev = highPivots[highPivots.length - 2];
    if (last.val > prev.val) {
      structure.push({ type: 'BOS', direction: 'bullish', price: last.val, index: last.idx, time: last.time });
    }
  }
  if (lowPivots.length >= 2) {
    const last = lowPivots[lowPivots.length - 1];
    const prev = lowPivots[lowPivots.length - 2];
    if (last.val < prev.val) {
      structure.push({ type: 'BOS', direction: 'bearish', price: last.val, index: last.idx, time: last.time });
    }
  }

  // 4. Confluence Scoring
  const lastCandle = candles[candles.length - 1];
  
  // Is price in Bullish OB?
  const inBullOB = orderBlocks.some(ob => ob.type === 'bullish' && lastCandle.low <= ob.top && lastCandle.close >= ob.bottom);
  const inBearOB = orderBlocks.some(ob => ob.type === 'bearish' && lastCandle.high >= ob.bottom && lastCandle.close <= ob.top);
  
  // Is price in Bullish FVG?
  const inBullFVG = fvgs.some(f => f.type === 'bullish' && lastCandle.low <= f.top && lastCandle.close >= f.bottom);
  const inBearFVG = fvgs.some(f => f.type === 'bearish' && lastCandle.high >= f.bottom && lastCandle.close <= f.top);

  const bullBOS = structure.some(s => s.direction === 'bullish');
  const bearBOS = structure.some(s => s.direction === 'bearish');

  bullScore = (inBullOB ? 1 : 0) + (inBullFVG ? 1 : 0) + (bullBOS ? 1 : 0);
  bearScore = (inBearOB ? 1 : 0) + (inBearFVG ? 1 : 0) + (bearBOS ? 1 : 0);

  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  if (bullScore >= config.minConfluence) signal = 'BUY';
  else if (bearScore >= config.minConfluence) signal = 'SELL';

  return {
    bullScore,
    bearScore,
    orderBlocks,
    fvgs,
    structure,
    signal
  };
};

export const generateMockData = (count: number): Candle[] => {
  const data: Candle[] = [];
  let currentPrice = 100;
  const now = Date.now();
  
  for (let i = 0; i < count; i++) {
    const open = currentPrice;
    const volatility = 0.5;
    const change = (Math.random() - 0.48) * volatility; // Slight upward bias
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * 0.2;
    const low = Math.min(open, close) - Math.random() * 0.2;
    
    data.push({
      time: now - (count - i) * 15 * 60 * 1000,
      open,
      high,
      low,
      close,
      volume: Math.floor(Math.random() * 1000)
    });
    currentPrice = close;
  }
  return data;
};
