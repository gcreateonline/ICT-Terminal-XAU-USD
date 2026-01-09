
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, AnalysisResult, Config, Drawing, DrawingType } from './types';
import { analyzePriceData } from './services/technicalAnalysis';
import { getFastAnalysis, getSearchAnalysis, getDeepThinkingAnalysis, AIAnalysisResult } from './services/geminiService';
import { fetchBinanceKlines, subscribeToBinanceKlines } from './services/marketData';
import Chart from './components/Chart';

const SUPPORTED_SYMBOLS = [
  { symbol: 'BTCUSDT', name: 'Bitcoin', icon: 'fa-brands fa-bitcoin text-orange-500', short: 'BTC' },
  { symbol: 'ETHUSDT', name: 'Ethereum', icon: 'fa-brands fa-ethereum text-blue-400', short: 'ETH' },
  { symbol: 'PAXGUSDT', name: 'Gold', icon: 'fa-solid fa-coins text-yellow-500', short: 'XAU' },
  { symbol: 'SOLUSDT', name: 'Solana', icon: 'fa-solid fa-s text-purple-400', short: 'SOL' },
  { symbol: 'BNBUSDT', name: 'Binance Coin', icon: 'fa-solid fa-b text-yellow-500', short: 'BNB' },
  { symbol: 'XRPUSDT', name: 'Ripple', icon: 'fa-solid fa-x text-slate-300', short: 'XRP' },
  { symbol: 'ADAUSDT', name: 'Cardano', icon: 'fa-solid fa-a text-blue-600', short: 'ADA' },
  { symbol: 'DOGEUSDT', name: 'Dogecoin', icon: 'fa-solid fa-dog text-yellow-600', short: 'DOGE' },
];

const App: React.FC = () => {
  const [data, setData] = useState<Candle[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [aiResult, setAiResult] = useState<AIAnalysisResult | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [activeAiMode, setActiveAiMode] = useState<'fast' | 'search' | 'deep' | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [currentSymbol, setCurrentSymbol] = useState('BTCUSDT');
  
  // Drawing Tools State
  const [activeTool, setActiveTool] = useState<DrawingType | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  
  const [config, setConfig] = useState<Config>({
    swingLength: 5,
    obLookback: 10,
    minConfluence: 2,
    rrRatio: 2.0,
    slBuffer: 0.1
  });

  const dataRef = useRef<Candle[]>([]);
  const currentInterval = '15m';

  // Persistence: Load Drawings
  useEffect(() => {
    const saved = localStorage.getItem('ict_drawings');
    if (saved) {
      try {
        setDrawings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse drawings', e);
      }
    }
  }, []);

  // Persistence: Save Drawings
  useEffect(() => {
    localStorage.setItem('ict_drawings', JSON.stringify(drawings));
  }, [drawings]);

  // Initial Load & Symbol Switching
  useEffect(() => {
    let isMounted = true;
    setIsLive(false);
    
    const loadData = async () => {
      const historical = await fetchBinanceKlines(currentSymbol, currentInterval, 150);
      if (isMounted && historical.length > 0) {
        dataRef.current = historical;
        setData(historical);
        const result = analyzePriceData(historical, config);
        setAnalysis(result);
        setIsLive(true);
      }
    };
    loadData();

    // Subscribe to Live Updates
    const unsubscribe = subscribeToBinanceKlines(currentSymbol, currentInterval, (newCandle) => {
      if (!isMounted) return;
      const updatedData = [...dataRef.current];
      const lastIdx = updatedData.length - 1;

      if (updatedData[lastIdx] && updatedData[lastIdx].time === newCandle.time) {
        updatedData[lastIdx] = newCandle;
      } else {
        updatedData.push(newCandle);
        if (updatedData.length > 200) updatedData.shift();
      }
      
      dataRef.current = updatedData;
      setData([...updatedData]);
      
      const result = analyzePriceData(updatedData, config);
      setAnalysis(result);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [currentSymbol, config]);

  const handleRefresh = useCallback(async () => {
    setIsLive(false);
    const historical = await fetchBinanceKlines(currentSymbol, currentInterval, 150);
    if (historical.length > 0) {
      dataRef.current = historical;
      setData(historical);
      const result = analyzePriceData(historical, config);
      setAnalysis(result);
      setIsLive(true);
    }
    setAiResult(null);
    setActiveAiMode(null);
  }, [currentSymbol, config]);

  const runAiAnalysis = async (mode: 'fast' | 'search' | 'deep') => {
    if (!analysis || data.length === 0) return;
    setIsLoadingAi(true);
    setActiveAiMode(mode);
    setAiResult(null);

    let result: AIAnalysisResult;
    const recentContext = data.slice(-50);

    if (mode === 'fast') {
      result = await getFastAnalysis(analysis, recentContext);
    } else if (mode === 'search') {
      result = await getSearchAnalysis(analysis, recentContext);
    } else {
      result = await getDeepThinkingAnalysis(analysis, recentContext);
    }

    setAiResult(result);
    setIsLoadingAi(false);
  };

  const updateConfig = (key: keyof Config, val: number) => {
    const newConfig = { ...config, [key]: val };
    setConfig(newConfig);
  };

  const clearDrawings = () => {
    if (window.confirm('Clear all drawings?')) {
      setDrawings([]);
    }
  };

  const getSymbolDisplayName = (symbol: string) => {
    if (symbol === 'PAXGUSDT') return 'XAU/USD';
    return symbol.replace('USDT', '/USD');
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 overflow-hidden text-slate-200">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 border-r border-slate-800 bg-slate-900 p-4 flex flex-col gap-6 overflow-y-auto">
        <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
          <div className="bg-blue-600 p-2 rounded-lg shadow-lg shadow-blue-900/40">
            <i className="fa-solid fa-tower-broadcast text-xl animate-pulse"></i>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">ICT Terminal</h1>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`}></span>
              <span className="text-[10px] text-slate-500 font-bold uppercase">{isLive ? 'Real-Time Data Active' : 'Connecting...'}</span>
            </div>
          </div>
        </div>

        {/* Pair Selector Section */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Select Pair</h2>
          <div className="relative group">
            <select 
              value={currentSymbol}
              onChange={(e) => setCurrentSymbol(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm font-bold text-white appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
            >
              {SUPPORTED_SYMBOLS.map(pair => (
                <option key={pair.symbol} value={pair.symbol}>
                  {pair.name} ({getSymbolDisplayName(pair.symbol)})
                </option>
              ))}
            </select>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500 group-hover:text-slate-300 transition-colors">
              <i className="fa-solid fa-chevron-down text-xs"></i>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_SYMBOLS.slice(0, 6).map(pair => (
              <button
                key={pair.symbol}
                onClick={() => setCurrentSymbol(pair.symbol)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-bold transition-all ${
                  currentSymbol === pair.symbol 
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                  : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600'
                }`}
              >
                <i className={`${pair.icon}`}></i>
                {pair.short}
              </button>
            ))}
          </div>
        </section>

        {/* Drawing Tools Section */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Drawing Tools</h2>
          <div className="grid grid-cols-4 gap-2">
            <button 
              onClick={() => setActiveTool(activeTool === 'trendline' ? null : 'trendline')}
              className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all ${activeTool === 'trendline' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400'}`}
              title="Trendline"
            >
              <i className="fa-solid fa-minus rotate-[-45deg]"></i>
            </button>
            <button 
              onClick={() => setActiveTool(activeTool === 'horizontal' ? null : 'horizontal')}
              className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all ${activeTool === 'horizontal' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400'}`}
              title="Horizontal Line"
            >
              <i className="fa-solid fa-grip-lines"></i>
            </button>
            <button 
              onClick={() => setActiveTool(activeTool === 'fib' ? null : 'fib')}
              className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all ${activeTool === 'fib' ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-400'}`}
              title="Fibonacci Retracement"
            >
              <i className="fa-solid fa-align-justify"></i>
            </button>
            <button 
              onClick={clearDrawings}
              className="p-2 rounded-lg border border-slate-700 bg-slate-800 hover:bg-rose-900/40 hover:border-rose-500 flex flex-col items-center justify-center transition-all text-slate-400 hover:text-rose-400"
              title="Clear All"
            >
              <i className="fa-solid fa-trash-can"></i>
            </button>
          </div>
          {activeTool && (
            <div className="text-[10px] text-blue-400 font-bold uppercase flex items-center gap-2 animate-pulse">
              <i className="fa-solid fa-pencil"></i> Active Tool: {activeTool}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Configuration</h2>
            <button onClick={handleRefresh} className="text-slate-400 hover:text-white transition-colors">
              <i className={`fa-solid fa-rotate ${!isLive ? 'animate-spin' : ''}`}></i>
            </button>
          </div>
          
          <div className="space-y-3 bg-slate-800/30 p-3 rounded-xl border border-slate-800">
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-1 uppercase">
                <span>Swing Length</span>
                <span className="text-blue-400 font-mono">{config.swingLength}</span>
              </div>
              <input 
                type="range" min="2" max="10" step="1"
                value={config.swingLength}
                onChange={(e) => updateConfig('swingLength', parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-slate-400 mb-1 uppercase">
                <span>Min Confluence</span>
                <span className="text-blue-400 font-mono">{config.minConfluence}</span>
              </div>
              <input 
                type="range" min="1" max="3" step="1"
                value={config.minConfluence}
                onChange={(e) => updateConfig('minConfluence', parseInt(e.target.value))}
                className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        </section>

        {analysis && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Live Confluence</h2>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/50 p-3 rounded-xl border border-emerald-500/20 shadow-inner">
                <div className="text-[10px] text-emerald-400 mb-1 uppercase font-bold">Bullish</div>
                <div className="text-2xl font-bold text-emerald-500">{analysis.bullScore}/3</div>
              </div>
              <div className="bg-slate-800/50 p-3 rounded-xl border border-rose-500/20 shadow-inner">
                <div className="text-[10px] text-rose-400 mb-1 uppercase font-bold">Bearish</div>
                <div className="text-2xl font-bold text-rose-500">{analysis.bearScore}/3</div>
              </div>
            </div>

            <div className={`p-4 rounded-xl border-2 text-center transition-all shadow-lg ${
              analysis.signal === 'BUY' ? 'border-emerald-500 bg-emerald-500/10' : 
              analysis.signal === 'SELL' ? 'border-rose-500 bg-rose-500/10' : 
              'border-slate-700 bg-slate-800 text-slate-300'
            }`}>
              <div className="text-[10px] font-bold uppercase mb-1 opacity-60">Market Signal</div>
              <div className="text-xl font-black tracking-tighter">{analysis.signal}</div>
            </div>
          </section>
        )}

        <section className="mt-auto space-y-3 border-t border-slate-800 pt-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <i className="fa-solid fa-sparkles text-indigo-400"></i> AI Analysis Suite
          </h2>
          
          <button 
            onClick={() => runAiAnalysis('fast')}
            disabled={isLoadingAi || !isLive}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 border border-slate-700 transition-all active:scale-95 shadow-md"
          >
            <i className="fa-solid fa-bolt text-yellow-400"></i> Fast Scan
          </button>
          
          <button 
            onClick={() => runAiAnalysis('search')}
            disabled={isLoadingAi || !isLive}
            className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 border border-slate-700 transition-all active:scale-95 shadow-md"
          >
            <i className="fa-brands fa-google text-blue-400"></i> Market Search
          </button>
          
          <button 
            onClick={() => runAiAnalysis('deep')}
            disabled={isLoadingAi || !isLive}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
          >
            <i className="fa-solid fa-brain"></i> Deep Thinking
          </button>
        </section>
      </div>

      {/* Main Terminal Area */}
      <div className="flex-grow flex flex-col relative">
        <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100 tracking-wider uppercase">
                {currentSymbol === 'PAXGUSDT' ? 'XAUUSD' : currentSymbol}
              </span>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-blue-400 font-mono border border-slate-700 uppercase">{currentInterval}</span>
            </div>
            <div className="flex gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Current Price</span>
                <span className={`text-sm font-mono transition-colors duration-300 ${
                  data.length > 1 && data[data.length-1].close > data[data.length-2].close ? 'text-emerald-400' : 'text-rose-400'
                }`}>
                  {data.length > 0 ? data[data.length-1].close.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter">Volume</span>
                <span className="text-sm font-mono text-slate-400">
                  {data.length > 0 ? data[data.length-1].volume.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>
          </div>
          
          {isLoadingAi && (
            <div className="flex items-center gap-2 text-indigo-400 text-[10px] font-bold">
              <i className="fa-solid fa-circle-notch animate-spin"></i>
              GEMINI PROCESSING...
            </div>
          )}

          <div className="flex gap-2">
             <div className="bg-slate-800 rounded-md flex overflow-hidden border border-slate-700 shadow-sm">
               <button className="px-3 py-1.5 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors border-r border-slate-700"><i className="fa-solid fa-chart-area"></i></button>
               <button className="px-3 py-1.5 bg-blue-600 text-white"><i className="fa-solid fa-chart-line"></i></button>
             </div>
          </div>
        </header>

        <main className="flex-grow relative bg-[#0B0F19]">
          <Chart 
            data={data} 
            analysis={analysis || { bullScore: 0, bearScore: 0, orderBlocks: [], fvgs: [], structure: [], signal: 'NEUTRAL' }} 
            activeTool={activeTool}
            drawings={drawings}
            onDrawingsChange={setDrawings}
            onToolUsed={() => setActiveTool(null)}
          />
          
          {/* Legend Overlay */}
          <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
            <div className="flex items-center gap-2 text-[10px] bg-slate-900/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-800 shadow-xl">
              <div className="w-2.5 h-1 bg-blue-500 opacity-60 rounded-full"></div>
              <span className="text-slate-300 font-medium">Fair Value Gap (FVG)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] bg-slate-900/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-800 shadow-xl">
              <div className="w-2.5 h-1 bg-emerald-500 opacity-60 rounded-full"></div>
              <span className="text-slate-300 font-medium">Order Block (OB)</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] bg-slate-900/90 backdrop-blur px-2.5 py-1.5 rounded-lg border border-slate-800 shadow-xl">
              <div className="w-2.5 h-0.5 border-t border-dashed border-emerald-500 w-4"></div>
              <span className="text-slate-300 font-medium">Structure (BOS)</span>
            </div>
          </div>

          {!isLive && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50">
               <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                  <i className="fa-solid fa-circle-notch animate-spin text-3xl text-blue-500"></i>
                  <span className="text-sm font-bold tracking-widest uppercase text-slate-300">Synchronizing {getSymbolDisplayName(currentSymbol)}...</span>
               </div>
            </div>
          )}
        </main>

        {/* AI Insight Panel */}
        {activeAiMode && (
          <div className={`h-[40%] border-t border-slate-800 bg-slate-900/95 backdrop-blur p-6 flex flex-col transition-all duration-300 transform ${activeAiMode ? 'translate-y-0' : 'translate-y-full'}`}>
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${
                  aiResult?.isError ? 'bg-rose-500/20 text-rose-500' :
                  activeAiMode === 'fast' ? 'bg-yellow-500/20 text-yellow-500' :
                  activeAiMode === 'search' ? 'bg-blue-500/20 text-blue-500' :
                  'bg-indigo-500/20 text-indigo-500'
                }`}>
                  <i className={`fa-solid ${
                    aiResult?.isError ? 'fa-triangle-exclamation' :
                    activeAiMode === 'fast' ? 'fa-bolt' :
                    activeAiMode === 'search' ? 'fa-globe' :
                    'fa-brain'
                  }`}></i>
                </div>
                <div>
                  <h3 className={`font-bold text-xs uppercase tracking-widest ${aiResult?.isError ? 'text-rose-400' : 'text-slate-100'}`}>
                    {aiResult?.isError ? 'System Alert / Quota Limit' :
                     activeAiMode === 'fast' ? 'Rapid Technical Snapshot' :
                     activeAiMode === 'search' ? 'Global Market Grounding' :
                     'Deep Institutional Analysis'}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {activeAiMode === 'fast' ? 'gemini-2.5-flash-lite' :
                     activeAiMode === 'search' ? 'gemini-3-flash-preview' :
                     'gemini-3-pro-preview (Thinking Engine Active)'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                 <button onClick={() => runAiAnalysis(activeAiMode)} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-md shadow-sm transition-colors">
                   <i className="fa-solid fa-rotate-right"></i>
                 </button>
                 <button onClick={() => {setAiResult(null); setActiveAiMode(null);}} className="text-slate-500 hover:text-white bg-slate-800 p-1.5 rounded-md shadow-sm transition-colors">
                   <i className="fa-solid fa-xmark"></i>
                 </button>
              </div>
            </div>

            <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
              {!aiResult ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                  <div className="w-16 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 animate-loading-bar"></div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-widest animate-pulse">Analyzing real-time orderflow & sentiment...</span>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className={`p-5 rounded-2xl border shadow-inner ${aiResult.isError ? 'bg-rose-950/20 border-rose-900/50' : 'bg-slate-800/20 border-slate-800/50'}`}>
                    <div className={`prose prose-invert prose-sm max-w-none font-medium leading-relaxed ${aiResult.isError ? 'text-rose-200' : 'text-slate-300'}`}>
                      {aiResult.text.split('\n').map((line, i) => (
                        <p key={i} className="mb-2 last:mb-0">{line}</p>
                      ))}
                    </div>
                  </div>

                  {aiResult.sources && aiResult.sources.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <i className="fa-solid fa-link"></i> External Grounding Data
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {aiResult.sources.map((source, idx) => (
                          <a 
                            key={idx} 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg text-[10px] text-blue-400 font-medium transition-all flex items-center gap-2 group shadow-sm"
                          >
                            <i className="fa-solid fa-earth-americas group-hover:rotate-12 transition-transform text-blue-500"></i>
                            {source.title.length > 45 ? source.title.substring(0, 42) + '...' : source.title}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {aiResult.isError && (
                    <div className="flex gap-4">
                       <button onClick={() => runAiAnalysis('deep')} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-tighter transition-colors">
                          Try Deep Thinking
                       </button>
                       <button onClick={() => runAiAnalysis('fast')} className="text-[10px] font-bold text-yellow-400 hover:text-yellow-300 uppercase tracking-tighter transition-colors">
                          Try Fast Scan
                       </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-loading-bar {
          animation: loading-bar 1.5s infinite linear;
          width: 100%;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
};

export default App;
