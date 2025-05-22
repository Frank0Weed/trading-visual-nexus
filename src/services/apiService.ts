
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
  volume?: number; // Added volume field to support both formats
}

// API functions
export const fetchSymbols = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/symbols`);
    const data = await response.json();
    return data.symbols || [];
  } catch (error: any) {
    console.error('Failed to fetch symbols:', error);
    throw new Error(`Failed to fetch symbols: ${error.message}`);
  }
};

export const fetchTimeframes = async (): Promise<TimeFrame[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/timeframes`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    
    // Map timeframes to more descriptive labels
    return data.timeframes.map((tf: string) => {
      let label = tf;
      
      // Create human-readable labels
      switch (tf) {
        case 'M1':
          label = '1 Min';
          break;
        case 'M5':
          label = '5 Min';
          break;
        case 'M15':
          label = '15 Min';
          break;
        case 'M30':
          label = '30 Min';
          break;
        case 'H1':
          label = '1 Hour';
          break;
        case 'D1':
          label = 'Daily';
          break;
        case 'W1':
          label = 'Weekly';
          break;
        case 'MN1':
          label = 'Monthly';
          break;
        default:
          label = tf;
      }
      
      return {
        name: tf,
        label: label
      };
    });
  } catch (error: any) {
    console.error('Failed to fetch timeframes:', error);
    // If it's already a custom error from !response.ok, rethrow it, otherwise wrap it.
    if (error.message.startsWith('API Error')) {
        throw error;
    }
    throw new Error(`Failed to fetch timeframes: ${error.message}`);
  }
};

export const fetchLivePrice = async (symbol: string): Promise<PriceData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/price/${symbol}`);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}) for ${symbol}: ${errorText}`);
    }
    return await response.json();
  } catch (error: any) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
    if (error.message.startsWith('API Error')) {
        throw error;
    }
    throw new Error(`Failed to fetch live price for ${symbol}: ${error.message}`);
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
    // Always use the OHLCV endpoint as it seems to be working
    let url = `${API_BASE_URL}/ohlcv/${symbol}/${timeframe}?limit=${limit}`;
    
    if (start) {
      url += `&start=${format(start, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")}`;
    }
    
    if (end) {
      url += `&end=${format(end, "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")}`;
    }
    
    // Log the URL to debug the API call
    console.log(`Fetching candles for ${symbol} ${timeframe}`);
    console.log(`Fetching candles from OHLCV endpoint: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`API Error (${response.status}): ${text}`);
      throw new Error(`API returned ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    
    // Check if the response contains a candles property (API returns an object with a candles array)
    const candlesArray = data.candles || data;
    
    if (!Array.isArray(candlesArray)) {
      console.error('API did not return an array:', data);
      throw new Error('API did not return an array');
    }
    
    console.log(`Received ${candlesArray.length} candles`, candlesArray.length > 0 ? candlesArray[0] : 'no data');
    
    // Map the data to ensure it has volume field
    return candlesArray.map((candle: any) => ({
      ...candle,
      volume: candle.volume || candle.tick_volume || candle.real_volume || 0
    }));
  } catch (error: any) {
    console.error(`Failed to fetch candles for ${symbol} ${timeframe}:`, error);
    // If it's already a custom error from !response.ok, rethrow it, otherwise wrap it.
    if (error.message.startsWith('API returned') || error.message.startsWith('API did not return an array')) {
        throw error;
    }
    throw new Error(`Failed to fetch candles for ${symbol} / ${timeframe}: ${error.message}`);
  }
};

export const getWebSocketUrl = (): string => WS_URL;
