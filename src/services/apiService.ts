
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

// API functions
export const fetchSymbols = async (): Promise<string[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/symbols`);
    const data = await response.json();
    return data.symbols || [];
  } catch (error) {
    console.error('Failed to fetch symbols:', error);
    throw error;
  }
};

export const fetchTimeframes = async (): Promise<TimeFrame[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/timeframes`);
    const data = await response.json();
    return data.timeframes.map((tf: string) => ({
      name: tf,
      label: tf
    }));
  } catch (error) {
    console.error('Failed to fetch timeframes:', error);
    throw error;
  }
};

export const fetchLivePrice = async (symbol: string): Promise<PriceData> => {
  try {
    const response = await fetch(`${API_BASE_URL}/price/${symbol}`);
    return await response.json();
  } catch (error) {
    console.error(`Failed to fetch price for ${symbol}:`, error);
    throw error;
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
    
    // Log the URL to debug the API call
    console.log(`Fetching candles from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`API Error (${response.status}): ${text}`);
      throw new Error(`API returned ${response.status}: ${text}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Failed to fetch candles for ${symbol} ${timeframe}:`, error);
    // Don't use mock data, just throw the error
    throw error;
  }
};

export const getWebSocketUrl = (): string => WS_URL;
