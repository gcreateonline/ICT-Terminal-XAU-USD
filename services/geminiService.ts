
import { GoogleGenAI } from "@google/genai";
import { AnalysisResult, Candle } from "../types";

export interface AIAnalysisResult {
  text: string;
  sources?: { title: string; uri: string }[];
  isError?: boolean;
}

const getBasePrompt = (analysis: AnalysisResult, lastCandles: Candle[]) => `
    Act as a professional ICT (Inner Circle Trader) and SMC (Smart Money Concepts) analyst. 
    Analyze the following technical setup:
    
    Setup Data:
    - Current Signal: ${analysis.signal}
    - Bullish Score: ${analysis.bullScore}/3
    - Bearish Score: ${analysis.bearScore}/3
    - Order Blocks Detected: ${analysis.orderBlocks.length}
    - Fair Value Gaps Detected: ${analysis.fvgs.length}
    - Market Structure: ${analysis.structure.map(s => `${s.type} ${s.direction} at ${s.price.toFixed(2)}`).join(', ') || 'Ranging/Consolidation'}
    
    Price Context:
    - Current Price: ${lastCandles[lastCandles.length - 1]?.close.toFixed(2)}
    - Recent Range: ${lastCandles[0]?.low.toFixed(2)} to ${lastCandles[lastCandles.length - 1]?.high.toFixed(2)}
`;

const handleApiError = (error: any, modelName: string): AIAnalysisResult => {
  console.error(`${modelName} Analysis failed:`, error);
  const errorMessage = error?.message || "";
  
  if (errorMessage.includes("429") || errorMessage.includes("quota") || errorMessage.includes("RESOURCE_EXHAUSTED")) {
    return { 
      text: "Daily search grounding quota exceeded for this API Key. Please try 'Deep Thinking' or 'Fast Scan' modes instead, which utilize different resource pools.",
      isError: true 
    };
  }
  
  return { 
    text: "An unexpected error occurred while communicating with Gemini. Please verify your connection or try again later.",
    isError: true 
  };
};

export const getFastAnalysis = async (analysis: AnalysisResult, lastCandles: Candle[]): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `${getBasePrompt(analysis, lastCandles)}
    Provide a 2-sentence lightning-fast summary of the current technical outlook. Focus only on the most immediate threat or opportunity.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-lite-latest',
      contents: prompt,
    });
    return { text: response.text || "No response generated." };
  } catch (error) {
    return handleApiError(error, "Fast");
  }
};

export const getSearchAnalysis = async (analysis: AnalysisResult, lastCandles: Candle[]): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `${getBasePrompt(analysis, lastCandles)}
    Search for recent financial news or economic events that might impact USD or Gold (XAUUSD) markets today. 
    Correlate the technical ICT patterns above with current market sentiment. 
    Are there high-impact news events (CPI, NFP, FOMC) that could invalidate these levels?`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
      ?.map((chunk: any) => chunk.web)
      .filter((web: any) => web?.uri && web?.title)
      .map((web: any) => ({ title: web.title, uri: web.uri })) || [];

    return { 
      text: response.text || "No insights found.",
      sources 
    };
  } catch (error) {
    return handleApiError(error, "Search Grounding");
  }
};

export const getDeepThinkingAnalysis = async (analysis: AnalysisResult, lastCandles: Candle[]): Promise<AIAnalysisResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `${getBasePrompt(analysis, lastCandles)}
    Perform a deep institutional narrative analysis.
    1. Identify the 'Draw on Liquidity' (DOL) - where is the market likely headed next?
    2. Analyze the 'Market Maker Models' (MMXM) current phase.
    3. Evaluate the quality of the FVGs and OBs detected. Are they high-probability or 'SMT' traps?
    4. Provide a step-by-step trade execution plan if a high-probability entry exists.
    
    Think extensively before providing your conclusion.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 32768 }
      },
    });
    return { text: response.text || "Deep thinking failed to produce a result." };
  } catch (error) {
    return handleApiError(error, "Deep Thinking");
  }
};
