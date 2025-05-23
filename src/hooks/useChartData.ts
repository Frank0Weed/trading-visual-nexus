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
        : Number(candle.time);
        
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
        : Number(candle.time);
        
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

// Helper to ensure time values are unique and properly sorted in data array
function ensureUniqueTimestamps<T extends {time: Time}>(data: T[]): T[] {
  // Convert all time values to numbers for consistent comparison
  const dataWithNumericTime = data.map(item => ({
    ...item,
    numericTime: Number(item.time)
  }));
  
  // Create a map to store unique entries by timestamp
  const uniqueTimeMap = new Map<number, T>();
  
  // Process each data point
  dataWithNumericTime.forEach(item => {
    // Only keep the latest entry for each timestamp
    uniqueTimeMap.set(item.numericTime, {
      ...item,
      time: item.numericTime as Time
    });
  });
  
  // Convert map values to array and sort by time
  return Array.from(uniqueTimeMap.values())
    .sort((a, b) => Number(a.time) - Number(b.time));
}

export const useChartData = ({ 
  selectedSymbol, 
  selectedTimeframe, 
  chartType,
  latestCandle
}: UseChartDataProps): ChartDataResult => {
  const [candles, setCandles] = useState<CandlestickData<Time>[] | LineData<Time>[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Use refs to track the current candle period and last update timestamp
  const currentCandlePeriodRef = useRef<number | null>(null);
  const lastPriceUpdateTimeRef = useRef<number>(0);
  const updateRateRef = useRef<number>(0);
  const latestCandleTimeRef = useRef<number | null>(null);
  const processedCandleTimesRef = useRef<Set<number>>(new Set());

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        
        // Format the data to match Chart component requirements
        let formattedData = formatCandleData(data, chartType);
        
        // Ensure the data has unique timestamps and is properly sorted based on chart type
        if (chartType === 'line' || chartType === 'area') {
          formattedData = ensureUniqueTimestamps<LineData<Time>>(formattedData as LineData<Time>[]);
        } else {
          formattedData = ensureUniqueTimestamps<CandlestickData<Time>>(formattedData as CandlestickData<Time>[]);
        }
        
        setCandles(formattedData);
        
        // Reset the processed candle times
        processedCandleTimesRef.current = new Set();
        
        // Initialize the current candle period
        if (formattedData.length > 0) {
          const lastCandle = formattedData[formattedData.length - 1];
          const timeValue = Number(lastCandle.time);
            
          currentCandlePeriodRef.current = Math.floor(timeValue / getTimeframeIntervalSeconds(selectedTimeframe));
          latestCandleTimeRef.current = timeValue;
          console.log(`Initial candle period set to: ${currentCandlePeriodRef.current} for ${selectedTimeframe}, time: ${new Date(timeValue * 1000).toLocaleTimeString()}`);
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
    
    // Reset refs when symbol or timeframe changes
    return () => {
      currentCandlePeriodRef.current = null;
      latestCandleTimeRef.current = null;
      processedCandleTimesRef.current = new Set();
    };
  }, [selectedSymbol, selectedTimeframe, chartType]);

  // Update the latest candle when new data arrives
  const updateLatestCandle = useCallback((candle: CandleData) => {
    if (!candle) return;
    
    console.log(`useChartData.updateLatestCandle received candle:`, 
      `time=${new Date(Number(candle.time) * 1000).toLocaleTimeString()}, open=${candle.open}, close=${candle.close}`);
    
    // Ensure time is a number for consistent comparison
    const timeValue = typeof candle.time === 'string'
      ? parseInt(candle.time, 10)
      : Number(candle.time);
    
    // Check if we've already processed this candle time to prevent duplicates
    if (processedCandleTimesRef.current.has(timeValue)) {
      console.log(`Skipping duplicate candle at time ${new Date(timeValue * 1000).toLocaleTimeString()}`);
      return;
    }
    
    // Store the latest candle time and mark as processed
    latestCandleTimeRef.current = timeValue;
    processedCandleTimesRef.current.add(timeValue);
    
    const candlePeriod = Math.floor(timeValue / getTimeframeIntervalSeconds(selectedTimeframe));
    
    // Check if this is a new candle period
    const isNewCandlePeriod = currentCandlePeriodRef.current !== candlePeriod;
    
    if (isNewCandlePeriod) {
      console.log(`New candle period detected: ${candlePeriod} (previous: ${currentCandlePeriodRef.current}), time: ${new Date(timeValue * 1000).toLocaleTimeString()}`);
      currentCandlePeriodRef.current = candlePeriod;
    }
    
    setCandles(prevCandles => {
      if (!prevCandles || prevCandles.length === 0) return prevCandles;
      
      if (chartType === 'line' || chartType === 'area') {
        // Type cast the array to ensure TypeScript knows it's LineData
        const lineCandles = [...prevCandles] as LineData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = lineCandles.findIndex(c => Number(c.time) === timeValue);
        
        const lineCandle: LineData<Time> = {
          time: timeValue as Time,
          value: candle.close
        };
        
        let updatedCandles: LineData<Time>[];
        
        if (candleIndex >= 0) {
          // Update existing candle
          console.log(`Updating existing line candle at time ${new Date(timeValue * 1000).toLocaleTimeString()} with value ${candle.close}`);
          updatedCandles = [...lineCandles];
          updatedCandles[candleIndex] = lineCandle;
        } else {
          // Add new candle
          console.log(`Adding new line candle at time: ${new Date(timeValue * 1000).toLocaleTimeString()} with value ${candle.close}`);
          updatedCandles = [...lineCandles, lineCandle];
        }
        
        return ensureUniqueTimestamps(updatedCandles);
      } else {
        // Type cast the array to ensure TypeScript knows it's CandlestickData
        const candlestickCandles = [...prevCandles] as CandlestickData<Time>[];
        
        // Find the candle with matching timestamp
        const candleIndex = candlestickCandles.findIndex(c => Number(c.time) === timeValue);
        
        const candlestickData: CandlestickData<Time> = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };
        
        let updatedCandles: CandlestickData<Time>[];
        
        if (candleIndex >= 0) {
          // Update existing candle
          console.log(`Updating existing candlestick at time ${new Date(timeValue * 1000).toLocaleTimeString()}: open=${candle.open}, close=${candle.close}`);
          updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = candlestickData;
        } else {
          // Add new candle
          console.log(`Adding new candlestick at time: ${new Date(timeValue * 1000).toLocaleTimeString()}: open=${candle.open}, close=${candle.close}`);
          updatedCandles = [...candlestickCandles, candlestickData];
        }
        
        return ensureUniqueTimestamps(updatedCandles);
      }
    });
  }, [chartType, selectedTimeframe]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    if (candles.length === 0) return;
    
    // Rate limit updates to avoid excessive re-renders
    const now = Date.now();
    if (now - updateRateRef.current < 100) return;  // More frequent updates (was 200ms)
    updateRateRef.current = now;
    
    // Get current time in seconds
    const currentTimeMs = now;
    const currentTime = Math.floor(currentTimeMs / 1000);
    
    // Calculate the current candle period
    const intervalSeconds = getTimeframeIntervalSeconds(selectedTimeframe);
    const currentPeriod = Math.floor(currentTime / intervalSeconds);
    const currentPeriodStartTime = currentPeriod * intervalSeconds;
    
    // Check if we've moved to a new candle period
    const isNewPeriod = currentCandlePeriodRef.current !== null && currentPeriod > currentCandlePeriodRef.current;
    
    // If we already have a candle for this exact time (from server), don't create a new one
    const hasExistingCandle = latestCandleTimeRef.current === currentPeriodStartTime;
    
    if (isNewPeriod && !hasExistingCandle) {
      console.log(`New period detected in updateLatestPrice: ${currentPeriod} (previous: ${currentCandlePeriodRef.current})`);
      console.log(`Current time: ${new Date(currentTimeMs).toLocaleTimeString()}, New candle start: ${new Date(currentPeriodStartTime * 1000).toLocaleTimeString()}`);
      
      // Check if we've already processed this candle time to prevent duplicates
      if (processedCandleTimesRef.current.has(currentPeriodStartTime)) {
        console.log(`Skipping duplicate candle creation at ${new Date(currentPeriodStartTime * 1000).toLocaleTimeString()}`);
        return;
      }
      
      // Mark this time as processed
      processedCandleTimesRef.current.add(currentPeriodStartTime);
      
      // Create a new candle
      if (chartType === 'line' || chartType === 'area') {
        setCandles(prevCandles => {
          const lineCandles = prevCandles as LineData<Time>[];
          
          // Create new candle
          const newCandle: LineData<Time> = {
            time: currentPeriodStartTime as Time,
            value: price
          };
          
          console.log(`Creating new line candle for period ${currentPeriod} at time ${new Date(currentPeriodStartTime * 1000).toLocaleTimeString()} with value ${price}`);
          
          // Add new candle and ensure sorted, unique timestamps
          const updatedCandles = [...lineCandles, newCandle];
          return ensureUniqueTimestamps(updatedCandles);
        });
      } else {
        setCandles(prevCandles => {
          const candlestickCandles = prevCandles as CandlestickData<Time>[];
          
          // Create new candle with price as both open and close
          const newCandle: CandlestickData<Time> = {
            time: currentPeriodStartTime as Time,
            open: price,
            high: price,
            low: price,
            close: price
          };
          
          console.log(`Creating new candlestick for period ${currentPeriod} at time ${new Date(currentPeriodStartTime * 1000).toLocaleTimeString()}`);
          console.log(`New candle data: open=${price}, high=${price}, low=${price}, close=${price}`);
          
          // Add new candle and ensure sorted, unique timestamps
          const updatedCandles = [...candlestickCandles, newCandle];
          return ensureUniqueTimestamps(updatedCandles);
        });
      }
      
      // Update the current period reference immediately
      currentCandlePeriodRef.current = currentPeriod;
      // Reset the last price update time
      lastPriceUpdateTimeRef.current = now;
    } else {
      // Just update the latest existing candle
      if (chartType === 'line' || chartType === 'area') {
        setCandles(prevCandles => {
          if (!prevCandles || prevCandles.length === 0) return prevCandles;
          
          // Type cast to ensure TypeScript knows it's LineData
          const lineCandles = [...prevCandles] as LineData<Time>[];
          const lastCandle = { ...lineCandles[lineCandles.length - 1] };
          
          // Only update if the price has actually changed
          if (lastCandle.value === price) return lineCandles;
          
          lastCandle.value = price;
          
          // Return updated candles with the last one modified
          const updatedCandles = [
            ...lineCandles.slice(0, -1),
            lastCandle
          ];
          
          return ensureUniqueTimestamps(updatedCandles);
        });
      } else {
        setCandles(prevCandles => {
          if (!prevCandles || prevCandles.length === 0) return prevCandles;
          
          // Type cast to ensure TypeScript knows it's CandlestickData
          const candlestickCandles = [...prevCandles] as CandlestickData<Time>[];
          const lastCandle = { ...candlestickCandles[candlestickCandles.length - 1] };
          
          // Only update if the price has actually changed
          if (lastCandle.close === price) return candlestickCandles;
          
          // Update high/low only if this is the current period candle
          if (Math.floor(Number(lastCandle.time) / intervalSeconds) === currentPeriod) {
            lastCandle.high = Math.max(lastCandle.high, price);
            lastCandle.low = Math.min(lastCandle.low, price);
          }
          
          lastCandle.close = price;
          
          // Return updated candles with the last one modified
          const updatedCandles = [
            ...candlestickCandles.slice(0, -1),
            lastCandle
          ];
          
          return ensureUniqueTimestamps(updatedCandles);
        });
      }
      
      // Update the last price update time
      lastPriceUpdateTimeRef.current = now;
    }
  }, [chartType, selectedTimeframe, candles.length]);
  
  // Update candle when latestCandle prop changes
  useEffect(() => {
    if (latestCandle) {
      console.log('useChartData effect: Updating chart with new candle from prop:', 
        `time=${new Date(Number(latestCandle.time) * 1000).toLocaleTimeString()}, open=${latestCandle.open}, close=${latestCandle.close}`);
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
