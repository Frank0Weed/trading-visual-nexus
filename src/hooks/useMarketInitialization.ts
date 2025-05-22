
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
      setIsLoading(true);
      let symbolsData: string[] = [];
      let timeframesData: TimeFrame[] = [];

      try {
        // Fetch available symbols
        symbolsData = await fetchSymbols();
        setSymbols(symbolsData);
      } catch (error: any) {
        console.error('Error fetching symbols:', error);
        toast.error(`Failed to load market symbols: ${error.message}`, { duration: 5000 });
        // Depending on requirements, you might want to stop further execution if symbols fail to load
      }

      try {
        // Fetch available timeframes
        timeframesData = await fetchTimeframes();
        setTimeframes(timeframesData);
      } catch (error: any) {
        console.error('Error fetching timeframes:', error);
        toast.error(`Failed to load market timeframes: ${error.message}`, { duration: 5000 });
        // Depending on requirements, you might want to stop further execution if timeframes fail to load
      }
      
      // Fetch initial prices for all symbols, even if some symbols/timeframes failed,
      // as long as symbolsData has some content.
      if (symbolsData.length > 0) {
        const prices: Record<string, PriceData> = {};
        // Using Promise.allSettled to fetch all prices and not fail completely if one symbol's price fails
        const pricePromises = symbolsData.map(symbol => 
          fetchLivePrice(symbol)
            .then(price => ({ symbol, price, status: 'fulfilled' }))
            .catch(error => ({ symbol, error, status: 'rejected' }))
        );

        const results = await Promise.allSettled(pricePromises);
        
        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.status === 'fulfilled') {
            prices[result.value.symbol] = result.value.price;
          } else if (result.status === 'fulfilled' && result.value.status === 'rejected') {
            const errorDetails = result.value.error as any;
            console.error(`Error fetching price for ${result.value.symbol}:`, errorDetails);
            toast.error(`Failed to load price for ${result.value.symbol}: ${errorDetails.message}`, { duration: 3000 });
          } else if (result.status === 'rejected') {
            // This case should ideally not be hit if the inner catch works correctly
            console.error(`Unexpected error in Promise.allSettled for prices:`, result.reason);
            toast.error(`An unexpected error occurred while fetching some prices.`, { duration: 3000 });
          }
        });
        setInitialPrices(prices);
      } else {
        toast.warn("No symbols loaded, skipping price fetch.", { duration: 3000 });
      }

      setIsLoading(false);
      // Removed the overarching try-catch as individual operations are now handled.
      // If a global "Failed to load trading data" is still desired, it can be added back
      // based on whether critical data (e.g., symbols) failed to load.
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
