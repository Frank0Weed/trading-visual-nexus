
import { useState, useEffect } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  fetchSymbols, 
  fetchTimeframes, 
  fetchLivePrice,
  TimeFrame,
  PriceData
} from '../services/apiService';

interface UseMarketInitializationResult {
  symbols: string[];
  timeframes: TimeFrame[];
  initialPrices: Record<string, PriceData>;
  isLoading: boolean;
}

export const useMarketInitialization = (): UseMarketInitializationResult => {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<TimeFrame[]>([]);
  const [initialPrices, setInitialPrices] = useState<Record<string, PriceData>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load initial data
  useEffect(() => {
    const initializeData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch available symbols
        const symbolsData = await fetchSymbols();
        setSymbols(symbolsData);
        
        // Fetch available timeframes
        const timeframesData = await fetchTimeframes();
        setTimeframes(timeframesData);
        
        // Fetch initial prices for all symbols
        const prices: Record<string, PriceData> = {};
        for (const symbol of symbolsData) {
          try {
            const price = await fetchLivePrice(symbol);
            prices[symbol] = price;
          } catch (error) {
            console.error(`Error fetching price for ${symbol}:`, error);
          }
        }
        setInitialPrices(prices);

        setIsLoading(false);
      } catch (error) {
        console.error('Error initializing data:', error);
        toast.error('Failed to load trading data');
        setIsLoading(false);
      }
    };

    initializeData();
  }, []);

  return {
    symbols,
    timeframes,
    initialPrices,
    isLoading
  };
};
