/**
 * Technical indicators calculation utilities
 */
import { CandlestickData, Time } from 'lightweight-charts';

// Base types
export type IndicatorCategory = 'momentum' | 'trend' | 'volume' | 'volatility' | 'breadth';

export interface Indicator {
  id: string;
  name: string;
  category: IndicatorCategory;
  description: string;
  calculate: (candles: CandlestickData<Time>[], params?: any) => any[];
  params: Record<string, any>;
  defaultParams: Record<string, any>;
  color?: string;
  display?: 'main' | 'secondary'; // Whether to display on main chart or in separate pane
  visible?: boolean;
}

// Helper functions
const calculateSMA = (data: number[], period: number): number[] => {
  const result: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(NaN); // Not enough data yet
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += data[i - j];
    }
    result.push(sum / period);
  }
  
  return result;
};

const calculateEMA = (data: number[], period: number): number[] => {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);
  
  // SMA for first EMA value
  let smaValue = 0;
  for (let i = 0; i < period; i++) {
    smaValue += data[i];
  }
  smaValue /= period;
  
  result.push(smaValue);
  
  // Calculate EMA
  for (let i = period; i < data.length; i++) {
    const emaValue = (data[i] - result[result.length - 1]) * multiplier + result[result.length - 1];
    result.push(emaValue);
  }
  
  // Pad the beginning of the array with NaN
  const padding = Array(period - 1).fill(NaN);
  
  return [...padding, ...result];
};

const calculateRSI = (data: number[], period: number): number[] => {
  const result: number[] = [];
  const changes: number[] = [];
  
  // Calculate price changes
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i] - data[i - 1]);
  }
  
  const gains: number[] = changes.map(change => change > 0 ? change : 0);
  const losses: number[] = changes.map(change => change < 0 ? Math.abs(change) : 0);
  
  // Calculate average gains and losses
  const avgGains: number[] = [];
  const avgLosses: number[] = [];
  
  // First average
  let sumGain = 0;
  let sumLoss = 0;
  
  for (let i = 0; i < period; i++) {
    sumGain += gains[i];
    sumLoss += losses[i];
  }
  
  avgGains.push(sumGain / period);
  avgLosses.push(sumLoss / period);
  
  // Rest of the averages
  for (let i = period; i < changes.length; i++) {
    const avgGain = (avgGains[avgGains.length - 1] * (period - 1) + gains[i]) / period;
    const avgLoss = (avgLosses[avgLosses.length - 1] * (period - 1) + losses[i]) / period;
    
    avgGains.push(avgGain);
    avgLosses.push(avgLoss);
  }
  
  // Calculate RS and RSI
  for (let i = 0; i < avgGains.length; i++) {
    const rs = avgGains[i] / (avgLosses[i] === 0 ? 0.001 : avgLosses[i]); // Avoid division by zero
    const rsi = 100 - (100 / (1 + rs));
    result.push(rsi);
  }
  
  // Pad the beginning of the array with NaN
  const padding = Array(period).fill(NaN);
  
  return [...padding, ...result];
};

const calculateMACD = (data: number[], fastPeriod: number, slowPeriod: number, signalPeriod: number): { macd: number[], signal: number[], histogram: number[] } => {
  const fastEMA = calculateEMA(data, fastPeriod);
  const slowEMA = calculateEMA(data, slowPeriod);
  
  // Calculate MACD line (fast EMA - slow EMA)
  const macdLine: number[] = fastEMA.map((fastValue, index) => {
    const slowValue = slowEMA[index];
    if (isNaN(fastValue) || isNaN(slowValue)) return NaN;
    return fastValue - slowValue;
  });
  
  // Calculate Signal line (EMA of MACD line)
  const validMacd = macdLine.filter(value => !isNaN(value));
  const signalEMA = calculateEMA(validMacd, signalPeriod);
  
  // Pad signal line to match MACD length
  const signalPadding = macdLine.length - signalEMA.length;
  const signal = Array(signalPadding).fill(NaN).concat(signalEMA);
  
  // Calculate histogram (MACD - Signal)
  const histogram = macdLine.map((macd, index) => {
    const signalValue = signal[index];
    if (isNaN(macd) || isNaN(signalValue)) return NaN;
    return macd - signalValue;
  });
  
  return { macd: macdLine, signal, histogram };
};

const calculateBollingerBands = (data: number[], period: number, multiplier: number): { upper: number[], middle: number[], lower: number[] } => {
  const sma = calculateSMA(data, period);
  const upper: number[] = [];
  const lower: number[] = [];
  
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(NaN);
      lower.push(NaN);
      continue;
    }
    
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += Math.pow(data[i - j] - sma[i], 2);
    }
    const stdDev = Math.sqrt(sum / period);
    
    upper.push(sma[i] + (multiplier * stdDev));
    lower.push(sma[i] - (multiplier * stdDev));
  }
  
  return { upper, middle: sma, lower };
};

const calculateADX = (candles: CandlestickData<Time>[], period: number): { adx: number[], plusDI: number[], minusDI: number[] } => {
  const smoothPeriod = 14;
  const trueRanges: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  
  // Calculate True Range and Directional Movement
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high as number;
    const low = candles[i].low as number;
    const prevHigh = candles[i - 1].high as number;
    const prevLow = candles[i - 1].low as number;
    const prevClose = candles[i - 1].close as number;
    
    // True Range
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    const tr = Math.max(tr1, tr2, tr3);
    trueRanges.push(tr);
    
    // +DM and -DM
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    if (upMove > downMove && upMove > 0) {
      plusDMs.push(upMove);
      minusDMs.push(0);
    } else if (downMove > upMove && downMove > 0) {
      plusDMs.push(0);
      minusDMs.push(downMove);
    } else {
      plusDMs.push(0);
      minusDMs.push(0);
    }
  }
  
  // Smooth TR, +DM, and -DM using Wilder's smoothing method
  const smoothedTR = [trueRanges.slice(0, period).reduce((sum, val) => sum + val, 0)];
  const smoothedPlusDM = [plusDMs.slice(0, period).reduce((sum, val) => sum + val, 0)];
  const smoothedMinusDM = [minusDMs.slice(0, period).reduce((sum, val) => sum + val, 0)];
  
  for (let i = 1; i < trueRanges.length - period + 1; i++) {
    smoothedTR.push(smoothedTR[i - 1] - (smoothedTR[i - 1] / period) + trueRanges[i + period - 1]);
    smoothedPlusDM.push(smoothedPlusDM[i - 1] - (smoothedPlusDM[i - 1] / period) + plusDMs[i + period - 1]);
    smoothedMinusDM.push(smoothedMinusDM[i - 1] - (smoothedMinusDM[i - 1] / period) + minusDMs[i + period - 1]);
  }
  
  // Calculate +DI and -DI
  const plusDI = smoothedPlusDM.map((plusDM, i) => (plusDM / smoothedTR[i]) * 100);
  const minusDI = smoothedMinusDM.map((minusDM, i) => (minusDM / smoothedTR[i]) * 100);
  
  // Calculate DX
  const dx = plusDI.map((pdi, i) => {
    const mdi = minusDI[i];
    return Math.abs(pdi - mdi) / (pdi + mdi) * 100;
  });
  
  // Calculate ADX (smoothed DX)
  const adx = [dx.slice(0, smoothPeriod).reduce((sum, val) => sum + val, 0) / smoothPeriod];
  
  for (let i = 1; i < dx.length - smoothPeriod + 1; i++) {
    adx.push((adx[i - 1] * (smoothPeriod - 1) + dx[i + smoothPeriod - 1]) / smoothPeriod);
  }
  
  // Pad results with NaN for entries where ADX is not calculated
  const padding = Array(candles.length - adx.length).fill(NaN);
  return {
    adx: [...padding, ...adx],
    plusDI: [...padding, ...plusDI],
    minusDI: [...padding, ...minusDI]
  };
};

// Define available indicators
export const availableIndicators: Record<string, Indicator> = {
  // Momentum Indicators
  macd: {
    id: 'macd',
    name: 'MACD',
    category: 'momentum',
    description: 'Moving Average Convergence Divergence',
    params: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    },
    defaultParams: {
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9
    },
    calculate: (candles, params = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }) => {
      const { fastPeriod, slowPeriod, signalPeriod } = params;
      const closes = candles.map(candle => candle.close as number);
      return calculateMACD(closes, fastPeriod, slowPeriod, signalPeriod);
    },
    display: 'secondary',
    visible: false
  },
  rsi: {
    id: 'rsi',
    name: 'RSI',
    category: 'momentum',
    description: 'Relative Strength Index',
    params: {
      period: 14
    },
    defaultParams: {
      period: 14
    },
    calculate: (candles, params = { period: 14 }) => {
      const { period } = params;
      const closes = candles.map(candle => candle.close as number);
      return calculateRSI(closes, period);
    },
    color: '#6B8E23',
    display: 'secondary',
    visible: false
  },
  adx: {
    id: 'adx',
    name: 'ADX',
    category: 'momentum',
    description: 'Average Directional Index',
    params: {
      period: 14
    },
    defaultParams: {
      period: 14
    },
    calculate: (candles, params = { period: 14 }) => {
      const { period } = params;
      return calculateADX(candles, period);
    },
    color: '#B05B3B',
    display: 'secondary',
    visible: false
  },
  
  // Trend Indicators
  sma: {
    id: 'sma',
    name: 'SMA',
    category: 'trend',
    description: 'Simple Moving Average',
    params: {
      period: 20
    },
    defaultParams: {
      period: 20
    },
    calculate: (candles, params = { period: 20 }) => {
      const { period } = params;
      const closes = candles.map(candle => candle.close as number);
      return calculateSMA(closes, period);
    },
    color: '#2962FF',
    display: 'main',
    visible: false
  },
  ema: {
    id: 'ema',
    name: 'EMA',
    category: 'trend',
    description: 'Exponential Moving Average',
    params: {
      period: 20
    },
    defaultParams: {
      period: 20
    },
    calculate: (candles, params = { period: 20 }) => {
      const { period } = params;
      const closes = candles.map(candle => candle.close as number);
      return calculateEMA(closes, period);
    },
    color: '#FF6B6B',
    display: 'main',
    visible: false
  },
  
  // Volatility Indicators
  bollingerBands: {
    id: 'bollingerBands',
    name: 'Bollinger Bands',
    category: 'volatility',
    description: 'Bollinger Bands',
    params: {
      period: 20,
      multiplier: 2
    },
    defaultParams: {
      period: 20,
      multiplier: 2
    },
    calculate: (candles, params = { period: 20, multiplier: 2 }) => {
      const { period, multiplier } = params;
      const closes = candles.map(candle => candle.close as number);
      return calculateBollingerBands(closes, period, multiplier);
    },
    color: '#7E57C2',
    display: 'main',
    visible: false
  },
};

export default availableIndicators;
