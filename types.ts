
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  index: number;
  startTime: number;
  isValid: boolean;
}

export interface FVG {
  type: 'bullish' | 'bearish';
  top: number;
  bottom: number;
  index: number;
  startTime: number;
  isValid: boolean;
}

export interface MarketStructure {
  type: 'BOS' | 'ChoCh';
  direction: 'bullish' | 'bearish';
  price: number;
  index: number;
  time: number;
}

export interface AnalysisResult {
  bullScore: number;
  bearScore: number;
  orderBlocks: OrderBlock[];
  fvgs: FVG[];
  structure: MarketStructure[];
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
}

export interface Config {
  swingLength: number;
  obLookback: number;
  minConfluence: number;
  rrRatio: number;
  slBuffer: number;
}

export type DrawingType = 'trendline' | 'horizontal' | 'fib';

export interface Drawing {
  id: string;
  type: DrawingType;
  points: { time: number; price: number }[];
  color: string;
}
