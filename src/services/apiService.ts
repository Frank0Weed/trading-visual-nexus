
import { format } from 'date-fns';

// API base URL
const API_BASE_URL = 'http://localhost:3000/api/v1';
const WS_URL = 'ws://localhost:3000';

// Types
export interface Symbol {
  name: string;
}

export interface TimeFrame {
  name: string;
  label: string;
}

export interface PriceData {
  symbol: string;
  time: number;
  bid: number;
  ask: number;
  spread: number;
}

export interface CandleData {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  tick_volume: number;
  spread: number;
  real_volume?: number;
}

// Mock data generation for development (when API is not available)
export const generateMockCandles = (
  symbol: string,
  timeframe: string,
  count: number = 100
): CandleData[] => {
  const candles: CandleData[] = [];
  const now = new Date();
  let basePrice = symbol.includes('XAU') ? 2000 : 1.2;
  const volatility = symbol.includes('XAU') ? 20 : 0.01;

  // Adjust the time increment based on timeframe
  const getTimeIncrement = () => {
    switch (timeframe) {
      case '1m': return 60 * 1000;
      case '5m': return 5 * 60 * 1000;
      case '15m': return 15 * 60 * 1000;
      case '1h': return 60 * 60 * 1000;
      case '4h': return 4 * 60 * 60 * 1000;
      case '1d': return 24 * 60 * 60 * 1000;
      default: return 60 * 1000;
    }
  };

  const timeIncrement = getTimeIncrement();

  for (let i = count - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - (i * timeIncrement));
    const change = (Math.random() - 0.5) * volatility;
    const open = basePrice;
    const close = basePrice + change;
    const high = Math.max(open, close) + (Math.random() * volatility * 0.5);
    const low = Math.min(open, close) - (Math.random() * volatility * 0.5);
    
    candles.push({
      time: Math.floor(time.getTime() / 1000),
      open,
      high,
      low,
      close,
      tick_volume: Math.floor(Math.random() * 1000) + 100,
      spread: symbol.includes('XAU') ? 0.5 : 0.0002,
      real_volume: Math.floor(Math.random() * 10000) + 1000
    });
    
    basePrice = close; // Use the close as the next open
  }
  
  return candles;
};

// API functions
export const fetchSymbols = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/symbols`);
    const data = await response.json();
    return data.symbols;
  } catch (error) {
    console.error('Failed to fetch symbols:', error);
    // Return mock symbols
    return ["EURUSD", "GBPUSD", "USDJPY", "XAUUSD", "BTCUSD", "US30", "US500"];
  }
};

export const fetchTimeframes = async (): Promise<TimeFrame[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/timeframes`);
    const data = await response.json();
    return data.timeframes.map((tf: string) => ({
      name: tf,
      label: tf.toUpperCase()
    }));
  } catch (error) {
    console.error('Failed to fetch timeframes:', error);
    // Return mock timeframes
    return [
      { name: "1m", label: "1M" },
      { name: "5m", label: "5M" },
      { name: "15m", label: "15M" },
      { name: "1h", label: "1H" },
      { name: "4h", label: "4H" },
      { name: "1d", label: "1D" }
    ];
  }
};

export const fetchLivePrice = async (symbol: string): Promise<PriceData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/price/${symbol}`);
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
    // Return mock price
    const basePrice = symbol.includes('XAU') ? 2000 : 1.2;
    const spread = symbol.includes('XAU') ? 0.5 : 0.0002;
    return {
      symbol,
      time: Math.floor(Date.now() / 1000),
      bid: basePrice,
      ask: basePrice + spread,
      spread
    };
  }
};

export const fetchCandles = async (
  symbol: string,
  timeframe: string,
  limit: number = 100,
  start?: Date,
  end?: Date
): Promise<CandleData[]> => {
  try {
    let url = `${API_BASE_URL}/candles/${symbol}/${timeframe}?limit=${limit}`;
    
    if (start) {
      url += `&start=${format(start, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")}`;
    }
    
    if (end) {
      url += `&end=${format(end, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")}`;
    }
    
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch candles for ${symbol} ${timeframe}:`, error);
    // Return mock candles
    return generateMockCandles(symbol, timeframe, limit);
  }
};

export const getWebSocketUrl = (): string => WS_URL;
