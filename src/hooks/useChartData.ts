
import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  fetchCandles,
  CandleData,
  TimeFrame
} from '../services/apiService';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import { ChartType } from '@/components/Chart';

interface UseChartDataProps {
  selectedSymbol: string;
  selectedTimeframe: string;
  chartType: ChartType;
  latestCandle?: CandleData;
}

interface ChartDataResult {
  candles: CandlestickData<Time>[] | LineData<Time>[];
  isLoading: boolean;
  updateLatestCandle: (candle: CandleData) => void;
  updateLatestPrice: (price: number) => void;
}

// Helper function to get interval in seconds based on timeframe
const getTimeframeIntervalSeconds = (timeframe: string): number => {
  switch(timeframe) {
    case 'M1': return 60;
    case 'M5': return 300;
    case 'M15': return 900;
    case 'M30': return 1800;
    case 'H1': return 3600;
    case 'H4': return 14400;
    case 'D1': return 86400;
    case 'W1': return 604800;
    default: return 60; // Default to M1
  }
};

// Helper function to format candle data to match Chart component requirements
const formatCandleData = (candles: CandleData[], chartType: ChartType): CandlestickData<Time>[] | LineData<Time>[] => {
  if (chartType === 'line' || chartType === 'area') {
    // Return as LineData array for line or area charts
    return candles.map(candle => {
      // Convert time to UTC timestamp in seconds if it's a string
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : candle.time;
        
      return {
        time: timeValue as Time,
        value: candle.close,
      };
    }) as LineData<Time>[];
  } else {
    // Return as CandlestickData array for candlestick or bar charts
    return candles.map(candle => {
      // Convert time to UTC timestamp in seconds if it's a string
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : candle.time;
        
      return {
        time: timeValue as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      };
    }) as CandlestickData<Time>[];
  }
};

export const useChartData = ({ 
  selectedSymbol, 
  selectedTimeframe, 
  chartType,
  latestCandle
}: UseChartDataProps): ChartDataResult => {
  const [candles, setCandles] = useState<CandlestickData<Time>[] | LineData<Time>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Use ref to track the current candle period
  const currentCandlePeriodRef = useRef<number | null>(null);
  const updateRateRef = useRef<number>(0);

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        
        // Format the data to match Chart component requirements
        const formattedData = formatCandleData(data, chartType);
        setCandles(formattedData);
        
        // Initialize the current candle period
        if (data.length > 0) {
          const lastCandle = data[data.length - 1];
          const timeValue = typeof lastCandle.time === 'string' 
            ? new Date(lastCandle.time).getTime() / 1000
            : lastCandle.time;
            
          currentCandlePeriodRef.current = Math.floor(timeValue / getTimeframeIntervalSeconds(selectedTimeframe));
          console.log(`Initial candle period set to: ${currentCandlePeriodRef.current} for ${selectedTimeframe}`);
        }
        
        setIsLoading(false);
      } catch (error) {
        console.error(`Error fetching candles for ${selectedSymbol} ${selectedTimeframe}:`, error);
        toast.error(`Failed to load ${selectedSymbol} chart data`);
        setIsLoading(false);
      }
    };

    if (selectedSymbol && selectedTimeframe) {
      loadCandles();
    }
  }, [selectedSymbol, selectedTimeframe, chartType]);

  // Update the latest candle when new data arrives
  const updateLatestCandle = useCallback((candle: CandleData) => {
    if (!candle) return;
    
    const timeValue = typeof candle.time === 'string'
      ? new Date(candle.time).getTime() / 1000
      : candle.time;
    
    const candlePeriod = Math.floor(timeValue / getTimeframeIntervalSeconds(selectedTimeframe));
    
    // Check if this is a new candle period
    const isNewCandlePeriod = currentCandlePeriodRef.current !== candlePeriod;
    
    if (isNewCandlePeriod) {
      console.log(`New candle period detected: ${candlePeriod} (previous: ${currentCandlePeriodRef.current})`);
      currentCandlePeriodRef.current = candlePeriod;
    }
    
    setCandles(prevCandles => {
      if (!prevCandles || prevCandles.length === 0) return prevCandles;
      
      if (chartType === 'line' || chartType === 'area') {
        // Type cast the array to ensure TypeScript knows it's LineData
        const lineCandles = prevCandles as LineData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = lineCandles.findIndex(c => Number(c.time) === timeValue);
        
        const lineCandle: LineData<Time> = {
          time: timeValue as Time,
          value: candle.close
        };
        
        if (candleIndex >= 0) {
          // Update existing candle
          const updatedCandles = [...lineCandles];
          updatedCandles[candleIndex] = lineCandle;
          return updatedCandles;
        } else if (isNewCandlePeriod) {
          // Add new candle
          console.log(`Adding new line candle at time: ${new Date(timeValue * 1000).toLocaleTimeString()}`);
          return [...lineCandles, lineCandle].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
        
        return lineCandles;
      } else {
        // Type cast the array to ensure TypeScript knows it's CandlestickData
        const candlestickCandles = prevCandles as CandlestickData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = candlestickCandles.findIndex(c => Number(c.time) === timeValue);
        
        const candlestickData: CandlestickData<Time> = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };
        
        if (candleIndex >= 0) {
          // Update existing candle
          const updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = candlestickData;
          return updatedCandles;
        } else if (isNewCandlePeriod) {
          // Add new candle
          console.log(`Adding new candlestick at time: ${new Date(timeValue * 1000).toLocaleTimeString()}`);
          return [...candlestickCandles, candlestickData].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        }
        
        return candlestickCandles;
      }
    });
  }, [chartType, selectedTimeframe]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    if (candles.length === 0) return;
    
    // Rate limit updates to avoid excessive re-renders
    const now = Date.now();
    if (now - updateRateRef.current < 200) return;
    updateRateRef.current = now;
    
    // Get current time in seconds
    const currentTime = Math.floor(now / 1000);
    
    // Calculate the current candle period
    const intervalSeconds = getTimeframeIntervalSeconds(selectedTimeframe);
    const currentPeriod = Math.floor(currentTime / intervalSeconds);
    
    // Check if we've moved to a new candle period
    const isNewPeriod = currentCandlePeriodRef.current !== null && currentPeriod > currentCandlePeriodRef.current;
    
    if (isNewPeriod) {
      console.log(`New period detected in updateLatestPrice: ${currentPeriod} (previous: ${currentCandlePeriodRef.current})`);
      
      // Calculate the time for the new candle
      const newCandleTime = currentPeriod * intervalSeconds;
      
      // Create a new candle
      if (chartType === 'line' || chartType === 'area') {
        setCandles(prevCandles => {
          const lineCandles = prevCandles as LineData<Time>[];
          
          // Create new candle
          const newCandle: LineData<Time> = {
            time: newCandleTime as Time,
            value: price
          };
          
          console.log(`Creating new line candle for period ${currentPeriod} at time ${new Date(newCandleTime * 1000).toLocaleTimeString()}`);
          
          // Add the new candle
          return [...lineCandles, newCandle].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        });
      } else {
        setCandles(prevCandles => {
          const candlestickCandles = prevCandles as CandlestickData<Time>[];
          
          // Create new candle
          const newCandle: CandlestickData<Time> = {
            time: newCandleTime as Time,
            open: price,
            high: price,
            low: price,
            close: price
          };
          
          console.log(`Creating new candlestick for period ${currentPeriod} at time ${new Date(newCandleTime * 1000).toLocaleTimeString()}`);
          
          // Add the new candle
          return [...candlestickCandles, newCandle].sort((a, b) => 
            Number(a.time) - Number(b.time)
          );
        });
      }
      
      // Update the current period reference
      currentCandlePeriodRef.current = currentPeriod;
    } else {
      // Just update the latest existing candle
      if (chartType === 'line' || chartType === 'area') {
        setCandles(prevCandles => {
          if (!prevCandles || prevCandles.length === 0) return prevCandles as LineData<Time>[];
          
          // Type cast to ensure TypeScript knows it's LineData
          const lineCandles = prevCandles as LineData<Time>[];
          const lastCandle = { ...lineCandles[lineCandles.length - 1] };
          
          // Only update if the price has actually changed
          if (lastCandle.value === price) return lineCandles;
          
          lastCandle.value = price;
          
          return [
            ...lineCandles.slice(0, -1),
            lastCandle
          ];
        });
      } else {
        setCandles(prevCandles => {
          if (!prevCandles || prevCandles.length === 0) return prevCandles as CandlestickData<Time>[];
          
          // Type cast to ensure TypeScript knows it's CandlestickData
          const candlestickCandles = prevCandles as CandlestickData<Time>[];
          const lastCandle = { ...candlestickCandles[candlestickCandles.length - 1] };
          
          // Only update if the price has actually changed
          if (lastCandle.close === price) return candlestickCandles;
          
          lastCandle.close = price;
          lastCandle.high = Math.max(lastCandle.high, price);
          lastCandle.low = Math.min(lastCandle.low, price);
          
          return [
            ...candlestickCandles.slice(0, -1),
            lastCandle
          ];
        });
      }
    }
  }, [chartType, selectedTimeframe, candles.length]);
  
  // Update candle when latestCandle prop changes
  useEffect(() => {
    if (latestCandle) {
      console.log('Updating chart with new candle from prop:', latestCandle);
      updateLatestCandle(latestCandle);
    }
  }, [latestCandle, updateLatestCandle]);

  return {
    candles,
    isLoading,
    updateLatestCandle,
    updateLatestPrice
  };
};
