
import { CandlestickData, Time } from 'lightweight-charts';

export type IndicatorCategory = 'momentum' | 'trend' | 'volume' | 'volatility' | 'breadth';
export type IndicatorDisplay = 'main' | 'separate' | 'separate-window';

export interface Indicator {
  id: string;
  name: string;
  description: string;
  category: IndicatorCategory;
  defaultParams: any;
  calculate: (candles: CandlestickData<Time>[], params?: any) => any;
  format: (value: any) => string;
  color?: string;
  display?: IndicatorDisplay;
  plotConfig?: {
    type: 'line' | 'histogram' | 'area' | 'bars';
    lineWidth?: number;
    color?: string;
    overlay?: boolean;
    priceScaleId?: string;
    scaleMargins?: {
      top: number;
      bottom: number;
    };
  };
}

// === MOMENTUM INDICATORS ===

// Relative Strength Index (RSI)
const calculateRSI = (candles: CandlestickData<Time>[], params = { period: 14 }): number[] => {
  const { period } = params;
  const prices = candles.map(c => c.close);
  const rsi: number[] = [];
  
  if (prices.length <= period) {
    return Array(prices.length).fill(50); // Default neutral value
  }
  
  let gains = 0;
  let losses = 0;
  
  // Calculate initial averages
  for (let i = 1; i <= period; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Calculate RSI for the first period
  for (let i = 0; i < period; i++) {
    rsi.push(50); // Placeholder for periods without enough data
  }
  
  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));
  }
  
  // Calculate RSI for the rest of the data
  for (let i = period + 1; i < prices.length; i++) {
    const difference = prices[i] - prices[i - 1];
    let currentGain = 0;
    let currentLoss = 0;
    
    if (difference >= 0) {
      currentGain = difference;
    } else {
      currentLoss = -difference;
    }
    
    avgGain = ((avgGain * (period - 1)) + currentGain) / period;
    avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;
    
    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
  }
  
  return rsi;
};

// MACD (Moving Average Convergence Divergence)
const calculateMACD = (candles: CandlestickData<Time>[], params = { 
  fast: 12, slow: 26, signal: 9 
}): { macd: number[], signal: number[], histogram: number[] } => {
  const { fast, slow, signal } = params;
  
  if (candles.length < slow) {
    const emptyResult = Array(candles.length).fill(0);
    return {
      macd: emptyResult,
      signal: emptyResult,
      histogram: emptyResult
    };
  }
  
  const prices = candles.map(c => c.close);
  
  // Calculate EMAs
  const calculateEMA = (data: number[], period: number) => {
    const k = 2 / (period + 1);
    const emaData: number[] = [];
    let ema = data.slice(0, period).reduce((sum, price) => sum + price, 0) / period;
    
    emaData.push(ema);
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] * k) + (ema * (1 - k));
      emaData.push(ema);
    }
    
    // Pad the beginning with the first EMA value to match length
    const padding = Array(period - 1).fill(emaData[0]);
    return [...padding, ...emaData];
  };
  
  const fastEMA = calculateEMA(prices, fast);
  const slowEMA = calculateEMA(prices, slow);
  
  // Calculate MACD line
  const macdLine: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    macdLine.push(fastEMA[i] - slowEMA[i]);
  }
  
  // Calculate signal line (EMA of MACD)
  const signalValues = calculateEMA(macdLine, signal);
  
  // Calculate histogram
  const histogram: number[] = [];
  for (let i = 0; i < macdLine.length; i++) {
    histogram.push(macdLine[i] - signalValues[i]);
  }
  
  return {
    macd: macdLine,
    signal: signalValues,
    histogram
  };
};

// Bollinger Bands
const calculateBollingerBands = (candles: CandlestickData<Time>[], params = { 
  period: 20, stdDev: 2 
}): { upper: number[], middle: number[], lower: number[] } => {
  const { period, stdDev } = params;
  const prices = candles.map(c => c.close);
  
  if (prices.length < period) {
    const emptyResult = Array(candles.length).fill(prices[0] || 0);
    return { 
      upper: emptyResult,
      middle: emptyResult,
      lower: emptyResult
    };
  }
  
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];
  
  // Fill in initial values with first price to maintain array length
  for (let i = 0; i < period - 1; i++) {
    upper.push(prices[i]);
    middle.push(prices[i]);
    lower.push(prices[i]);
  }
  
  for (let i = period - 1; i < prices.length; i++) {
    // Calculate SMA for middle band
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sum += prices[j];
    }
    const sma = sum / period;
    
    // Calculate standard deviation
    let sqSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      sqSum += Math.pow(prices[j] - sma, 2);
    }
    const stdDevValue = Math.sqrt(sqSum / period);
    
    middle.push(sma);
    upper.push(sma + (stdDev * stdDevValue));
    lower.push(sma - (stdDev * stdDevValue));
  }
  
  return { upper, middle, lower };
};

// ADX (Average Directional Index)
const calculateADX = (candles: CandlestickData<Time>[], params = { 
  period: 14 
}): { adx: number[], plusDI: number[], minusDI: number[] } => {
  const { period } = params;
  
  if (candles.length < period + 10) {
    const emptyResult = Array(candles.length).fill(0);
    return {
      adx: emptyResult,
      plusDI: emptyResult,
      minusDI: emptyResult
    };
  }
  
  const result = {
    adx: Array(candles.length).fill(0),
    plusDI: Array(candles.length).fill(0),
    minusDI: Array(candles.length).fill(0)
  };

  // Function to calculate true range
  const calculateTR = (current: CandlestickData<Time>, previous: CandlestickData<Time>): number => {
    const high_low = current.high - current.low;
    const high_close = Math.abs(current.high - previous.close);
    const low_close = Math.abs(current.low - previous.close);
    
    return Math.max(high_low, high_close, low_close);
  };
  
  // Calculate +DM, -DM, TR
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];
  
  for (let i = 1; i < candles.length; i++) {
    const currentCandle = candles[i];
    const previousCandle = candles[i - 1];
    
    const upMove = currentCandle.high - previousCandle.high;
    const downMove = previousCandle.low - currentCandle.low;
    
    // Calculate +DM and -DM
    if (upMove > downMove && upMove > 0) {
      plusDM.push(upMove);
    } else {
      plusDM.push(0);
    }
    
    if (downMove > upMove && downMove > 0) {
      minusDM.push(downMove);
    } else {
      minusDM.push(0);
    }
    
    // Calculate TR
    tr.push(calculateTR(currentCandle, previousCandle));
  }
  
  // Smooth the data for first period
  let smoothedTR = tr.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlusDM = plusDM.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinusDM = minusDM.slice(1, period + 1).reduce((sum, value) => sum + value, 0);
  
  // Calculate +DI and -DI for first period
  const plusDI: number[] = Array(period).fill(0);
  const minusDI: number[] = Array(period).fill(0);
  
  plusDI.push((smoothedPlusDM / smoothedTR) * 100);
  minusDI.push((smoothedMinusDM / smoothedTR) * 100);
  
  // Calculate ADX
  const dx: number[] = Array(period).fill(0);
  dx.push(Math.abs((plusDI[period] - minusDI[period]) / (plusDI[period] + minusDI[period])) * 100);
  
  let adxValue = dx[period];
  const adx: number[] = Array(period).fill(0);
  adx.push(adxValue);
  
  // Calculate for remaining periods
  for (let i = period + 1; i < candles.length; i++) {
    // Update smoothed values
    smoothedTR = smoothedTR - (smoothedTR / period) + tr[i];
    smoothedPlusDM = smoothedPlusDM - (smoothedPlusDM / period) + plusDM[i];
    smoothedMinusDM = smoothedMinusDM - (smoothedMinusDM / period) + minusDM[i];
    
    // Calculate new DI values
    const newPlusDI = (smoothedPlusDM / smoothedTR) * 100;
    const newMinusDI = (smoothedMinusDM / smoothedTR) * 100;
    
    plusDI.push(newPlusDI);
    minusDI.push(newMinusDI);
    
    // Calculate new DX value
    const newDX = Math.abs((newPlusDI - newMinusDI) / (newPlusDI + newMinusDI)) * 100;
    dx.push(newDX);
    
    // Calculate new ADX value
    adxValue = ((adxValue * (period - 1)) + newDX) / period;
    adx.push(adxValue);
  }
  
  return {
    adx,
    plusDI,
    minusDI
  };
};

// Calculate Simple Moving Average
const calculateSMA = (candles: CandlestickData<Time>[], params = { period: 50 }): number[] => {
  const { period } = params;
  const prices = candles.map(c => c.close);
  const sma: number[] = [];
  
  // Fill initial values with NaN for periods without enough data
  for (let i = 0; i < period - 1; i++) {
    sma.push(prices[i]); // Just use the price value for incomplete periods
  }
  
  // Calculate SMA for complete periods
  for (let i = period - 1; i < prices.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }
  
  return sma;
};

// Calculate Exponential Moving Average
const calculateEMA = (candles: CandlestickData<Time>[], params = { period: 20 }): number[] => {
  const { period } = params;
  const prices = candles.map(c => c.close);
  const k = 2 / (period + 1);
  const ema: number[] = [];
  
  // Start with SMA for the first period
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
    ema.push(prices[i]); // Just use price values for incomplete periods
  }
  
  let currentEma = sum / period;
  ema[period - 1] = currentEma; // Replace the last value with the actual SMA
  
  // Calculate EMA for the rest
  for (let i = period; i < prices.length; i++) {
    currentEma = (prices[i] * k) + (currentEma * (1 - k));
    ema.push(currentEma);
  }
  
  return ema;
};

// Volume Weighted Average Price (VWAP)
const calculateVWAP = (candles: CandlestickData<Time> & { volume?: number }[]): (number | null)[] => {
  if (!candles || candles.length === 0) {
    return [];
  }

  const vwapValues: (number | null)[] = [];
  let cumulativeTypicalPriceVolume = 0;
  let cumulativeVolume = 0;
  let currentDay: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    // Ensure candle has time, high, low, close, and volume
    if (candle.time === undefined || candle.high === undefined || candle.low === undefined || candle.close === undefined || candle.volume === undefined || candle.volume === 0) {
      vwapValues.push(vwapValues.length > 0 ? vwapValues[vwapValues.length -1] : null); // Carry forward last value or null
      continue;
    }

    const candleDate = new Date(Number(candle.time) * 1000);
    const dayOfCandle = candleDate.getUTCFullYear() * 10000 + (candleDate.getUTCMonth() + 1) * 100 + candleDate.getUTCDate();

    if (currentDay === null || dayOfCandle !== currentDay) {
      // New session (new day)
      currentDay = dayOfCandle;
      cumulativeTypicalPriceVolume = 0;
      cumulativeVolume = 0;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const typicalPriceVolume = typicalPrice * candle.volume;

    cumulativeTypicalPriceVolume += typicalPriceVolume;
    cumulativeVolume += candle.volume;

    if (cumulativeVolume === 0) {
      vwapValues.push(null); // Avoid division by zero
    } else {
      vwapValues.push(cumulativeTypicalPriceVolume / cumulativeVolume);
    }
  }
  return vwapValues;
};


// Define the indicators object with improved colors
const indicators: Record<string, Indicator> = {
  rsi: {
    id: 'rsi',
    name: 'Relative Strength Index',
    description: 'Momentum oscillator that measures speed and change of price movements',
    category: 'momentum',
    defaultParams: { period: 14 },
    calculate: calculateRSI,
    format: (value: number) => `${value.toFixed(2)}`,
    color: '#9b87f5', // Primary Purple
    display: 'separate-window',
    plotConfig: {
      type: 'line',
      lineWidth: 2,
      color: '#9b87f5', // Primary Purple
      overlay: false,
      priceScaleId: 'rsi',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  macd: {
    id: 'macd',
    name: 'MACD',
    description: 'Trend-following momentum indicator',
    category: 'momentum',
    defaultParams: { fast: 12, slow: 26, signal: 9 },
    color: '#0EA5E9', // Ocean Blue
    display: 'separate-window',
    calculate: (candles: CandlestickData<Time>[], params?: any) => {
      return calculateMACD(candles, params);
    },
    format: (value: any) => {
      if (value.macd !== undefined) return `M:${value.macd.toFixed(2)} S:${value.signal.toFixed(2)} H:${value.histogram.toFixed(2)}`;
      return '';
    },
    plotConfig: {
      type: 'histogram',
      lineWidth: 1,
      color: '#0EA5E9', // Ocean Blue
      overlay: false,
      priceScaleId: 'macd',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  adx: {
    id: 'adx',
    name: 'Average Directional Index',
    description: 'Measures trend strength without direction',
    category: 'trend',
    defaultParams: { period: 14 },
    color: '#F97316', // Bright Orange
    display: 'separate-window',
    calculate: (candles: CandlestickData<Time>[], params?: any) => {
      return calculateADX(candles, params);
    },
    format: (value: any) => {
      if (value.adx !== undefined) return `ADX:${value.adx.toFixed(2)} +DI:${value.plusDI.toFixed(2)} -DI:${value.minusDI.toFixed(2)}`;
      return '';
    },
    plotConfig: {
      type: 'line',
      lineWidth: 1,
      color: '#F97316', // Bright Orange
      overlay: false,
      priceScaleId: 'adx',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  bbands: {
    id: 'bbands',
    name: 'Bollinger Bands',
    description: 'Volatility bands placed above and below a moving average',
    category: 'volatility',
    defaultParams: { period: 20, stdDev: 2 },
    color: '#D946EF', // Magenta Pink
    display: 'main',
    calculate: (candles: CandlestickData<Time>[], params?: any) => {
      return calculateBollingerBands(candles, params);
    },
    format: (value: any) => {
      if (value.upper !== undefined) return `U:${value.upper.toFixed(2)} M:${value.middle.toFixed(2)} L:${value.lower.toFixed(2)}`;
      return '';
    },
    plotConfig: {
      type: 'line',
      lineWidth: 1,
      color: '#D946EF', // Magenta Pink
      overlay: true,
      priceScaleId: 'right',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  sma: {
    id: 'sma',
    name: 'Simple Moving Average',
    description: 'Average of price over a specific period',
    category: 'trend',
    defaultParams: { period: 50 },
    color: '#22C55E', // Green
    display: 'main',
    calculate: calculateSMA,
    format: (value: number) => `${value.toFixed(2)}`,
    plotConfig: {
      type: 'line',
      lineWidth: 1.5,
      color: '#22C55E', // Green
      overlay: true,
      priceScaleId: 'right',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  ema: {
    id: 'ema',
    name: 'Exponential Moving Average',
    description: 'Weighted moving average giving more importance to recent prices',
    category: 'trend',
    defaultParams: { period: 20 },
    color: '#3B82F6', // Blue
    display: 'main',
    calculate: calculateEMA,
    format: (value: number) => `${value.toFixed(2)}`,
    plotConfig: {
      type: 'line',
      lineWidth: 1.5,
      color: '#3B82F6', // Blue
      overlay: true,
      priceScaleId: 'right',
      scaleMargins: {
        top: 0.1,
        bottom: 0.1
      }
    }
  },
  vwap: {
    id: 'vwap',
    name: 'VWAP (Volume Weighted Average Price)',
    description: 'Volume-weighted average price, resets daily.',
    category: 'volume', // Or 'trend'
    defaultParams: {}, // No specific params for daily VWAP
    calculate: calculateVWAP,
    format: (value: number) => value !== null ? `${value.toFixed(2)}` : 'N/A',
    color: '#FF69B4', // Hot Pink, for example
    display: 'main', // Display on the main chart panel
    plotConfig: {
      type: 'line',
      lineWidth: 1.5,
      color: '#FF69B4', 
      overlay: true, // Overlay on the main series
      priceScaleId: 'right', // Use the main price scale
      scaleMargins: { // Default scale margins, adjust if needed
        top: 0.1,
        bottom: 0.1
      }
    }
  }
};

export default indicators;
