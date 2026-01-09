
import { Candle, OrderBlock, FVG, MarketStructure, AnalysisResult, Config } from '../types';

export const analyzePriceData = (candles: Candle[], config: Config): AnalysisResult => {
  const orderBlocks: OrderBlock[] = [];
  const fvgs: FVG[] = [];
  const structure: MarketStructure[] = [];

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

  // 3. Market Structure & Liquidity Sweeps
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

  const lastCandle = candles[candles.length - 1];
  
  // Liquidity Sweep Detection
  let bullSweep = false;
  let bearSweep = false;
  
  if (lowPivots.length > 0) {
    const lastLow = lowPivots[lowPivots.length - 1].val;
    if (lastCandle.low < lastLow && lastCandle.close > lastLow) {
      bullSweep = true;
    }
  }
  if (highPivots.length > 0) {
    const lastHigh = highPivots[highPivots.length - 1].val;
    if (lastCandle.high > lastHigh && lastCandle.close < lastHigh) {
      bearSweep = true;
    }
  }

  // BOS Logic
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
  const currentBullOB = orderBlocks.find(ob => ob.type === 'bullish' && lastCandle.low <= ob.top && lastCandle.close >= ob.bottom);
  const currentBearOB = orderBlocks.find(ob => ob.type === 'bearish' && lastCandle.high >= ob.bottom && lastCandle.close <= ob.top);
  
  const inBullOB = !!currentBullOB;
  const inBearOB = !!currentBearOB;
  
  const inBullFVG = fvgs.some(f => f.type === 'bullish' && lastCandle.low <= f.top && lastCandle.close >= f.bottom);
  const inBearFVG = fvgs.some(f => f.type === 'bearish' && lastCandle.high >= f.bottom && lastCandle.close <= f.top);

  const bullBOS = structure.some(s => s.direction === 'bullish');
  const bearBOS = structure.some(s => s.direction === 'bearish');

  const confluences = {
    bullish: { ob: inBullOB, fvg: inBullFVG, bos: bullBOS, sweep: bullSweep },
    bearish: { ob: inBearOB, fvg: inBearFVG, bos: bearBOS, sweep: bearSweep }
  };

  const bullScore = Object.values(confluences.bullish).filter(Boolean).length;
  const bearScore = Object.values(confluences.bearish).filter(Boolean).length;

  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let entryPrice: number | undefined;
  let slPrice: number | undefined;
  let tpPrice: number | undefined;
  let rrRatio: number | undefined;
  let pnlEstimate: number | undefined;

  if (bullScore >= config.minConfluence) {
    signal = 'BUY';
    entryPrice = lastCandle.close;
    const baseSL = currentBullOB ? currentBullOB.bottom : lastCandle.low;
    slPrice = baseSL * (1 - config.slBuffer / 100);
    const risk = Math.abs(entryPrice - slPrice);
    tpPrice = entryPrice + (risk * config.rrRatio);
    rrRatio = config.rrRatio;
    pnlEstimate = ((tpPrice - entryPrice) / entryPrice) * 100;
  } else if (bearScore >= config.minConfluence) {
    signal = 'SELL';
    entryPrice = lastCandle.close;
    const baseSL = currentBearOB ? currentBearOB.top : lastCandle.high;
    slPrice = baseSL * (1 + config.slBuffer / 100);
    const risk = Math.abs(slPrice - entryPrice);
    tpPrice = entryPrice - (risk * config.rrRatio);
    rrRatio = config.rrRatio;
    pnlEstimate = ((entryPrice - tpPrice) / entryPrice) * 100;
  }

  return {
    bullScore,
    bearScore,
    confluences,
    orderBlocks,
    fvgs,
    structure,
    signal,
    entryPrice,
    slPrice,
    tpPrice,
    rrRatio,
    pnlEstimate
  };
};
