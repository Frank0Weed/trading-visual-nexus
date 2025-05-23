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

// Helper to ensure time values are unique and properly sorted in data array
function ensureUniqueTimestamps<T extends {time: Time}>(data: T[]): T[] {
  // Create a map to store unique entries by timestamp
  const uniqueTimeMap = new Map<number, T>();
  
  // Process each data point
  data.forEach(item => {
    const timeValue = Number(item.time);
    // Only keep the latest entry for each timestamp
    uniqueTimeMap.set(timeValue, item);
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
        
        // Ensure the data has unique timestamps and is properly sorted
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
    
    const timeValue = typeof candle.time === 'string'
      ? parseInt(candle.time, 10)
      : Number(candle.time);

    console.log(`useChartData.updateLatestCandle received candle:`, 
      `time=${new Date(timeValue * 1000).toISOString()}(${timeValue}), open=${candle.open}, high=${candle.high}, low=${candle.low}, close=${candle.close}, symbol=${selectedSymbol}, timeframe=${selectedTimeframe}`);
    
    // Check if we've already processed this candle time to prevent duplicates
    if (processedCandleTimesRef.current.has(timeValue)) {
      console.log(`[updateLatestCandle] Skipping duplicate candle for time ${timeValue} (${new Date(timeValue * 1000).toISOString()}) symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
      return;
    }
    
    // Store the latest candle time and mark as processed
    // This ensures that if a full candle comes from WebSocket, it's prioritized.
    latestCandleTimeRef.current = timeValue;
    processedCandleTimesRef.current.add(timeValue);
    console.log(`[updateLatestCandle] Processed new candle time: ${timeValue} (${new Date(timeValue * 1000).toISOString()}). Updated latestCandleTimeRef.current. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
    
    const candlePeriod = Math.floor(timeValue / getTimeframeIntervalSeconds(selectedTimeframe));
    
    // Check if this is a new candle period based on the incoming candle's time
    if (currentCandlePeriodRef.current !== candlePeriod) {
      console.log(`[updateLatestCandle] New candle period detected. Current: ${candlePeriod}, Previous: ${currentCandlePeriodRef.current}. Time: ${new Date(timeValue * 1000).toISOString()}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
      currentCandlePeriodRef.current = candlePeriod;
    }
    
    setCandles(prevCandles => {
      if (!prevCandles) {
        console.warn('[updateLatestCandle] prevCandles is undefined. This should not happen if initial data loaded.');
        return [];
      }
      
      let updatedCandles;
      const formattedCandleTime = timeValue as Time;

      if (chartType === 'line' || chartType === 'area') {
        const lineCandles = prevCandles as LineData<Time>[];
        const candleIndex = lineCandles.findIndex(c => Number(c.time) === timeValue);
        
        const newPoint: LineData<Time> = {
          time: formattedCandleTime,
          value: candle.close
        };
        
        if (candleIndex >= 0) {
          console.log(`[updateLatestCandle] Updating existing ${chartType} chart point at time ${new Date(timeValue * 1000).toISOString()} with value ${candle.close}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          updatedCandles = [...lineCandles];
          updatedCandles[candleIndex] = newPoint;
        } else {
          console.log(`[updateLatestCandle] Adding new ${chartType} chart point at time ${new Date(timeValue * 1000).toISOString()} with value ${candle.close}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          updatedCandles = [...lineCandles, newPoint];
        }
      } else { // Candlestick or Bar
        const candlestickCandles = prevCandles as CandlestickData<Time>[];
        const candleIndex = candlestickCandles.findIndex(c => Number(c.time) === timeValue);

        const newCandleStick: CandlestickData<Time> = {
          time: formattedCandleTime,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        };

        if (candleIndex >= 0) {
          console.log(`[updateLatestCandle] Updating existing ${chartType} candle at time ${new Date(timeValue * 1000).toISOString()} with O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = newCandleStick;
        } else {
          console.log(`[updateLatestCandle] Adding new ${chartType} candle at time ${new Date(timeValue * 1000).toISOString()} with O:${candle.open} H:${candle.high} L:${candle.low} C:${candle.close}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          updatedCandles = [...candlestickCandles, newCandleStick];
        }
      }
      return ensureUniqueTimestamps(updatedCandles as any); // `as any` because ensureUniqueTimestamps is generic
    });
  }, [chartType, selectedTimeframe, selectedSymbol]); // Added selectedSymbol for logging
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    // Rate limit updates to avoid excessive re-renders
    const now = Date.now();
    if (now - updateRateRef.current < 100) { // 100ms update interval
      // console.log(`[updateLatestPrice] Rate limited. Price: ${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
      return;
    }
    updateRateRef.current = now;
    
    if (candles.length === 0) {
      console.log(`[updateLatestPrice] No candles yet, skipping update. Price: ${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
      return;
    }
    
    const currentTimeMs = now;
    const currentTimeSec = Math.floor(currentTimeMs / 1000);
    
    const intervalSeconds = getTimeframeIntervalSeconds(selectedTimeframe);
    const currentPricePeriod = Math.floor(currentTimeSec / intervalSeconds);
    const currentPricePeriodStartTime = currentPricePeriod * intervalSeconds;

    console.log(`[updateLatestPrice] Received price: ${price} at ${new Date(currentTimeMs).toISOString()}. Current period starts: ${new Date(currentPricePeriodStartTime * 1000).toISOString()}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);

    // Scenario 1: The price tick belongs to a new candle period.
    // currentCandlePeriodRef.current should reflect the period of the last *full* candle from WebSocket or initial fetch.
    // latestCandleTimeRef.current is the timestamp of the most recent candle data point (either full or partial).
    
    const isNewCandlePeriodByPriceTick = currentCandlePeriodRef.current !== null && currentPricePeriod > currentCandlePeriodRef.current;

    if (isNewCandlePeriodByPriceTick) {
      // This means a new candle period has started since the last full candle update.
      // We might need to create a new candle.
      console.log(`[updateLatestPrice] New candle period detected by price tick. Current Price Period: ${currentPricePeriod} (${new Date(currentPricePeriodStartTime*1000).toISOString()}), Last Full Candle Period: ${currentCandlePeriodRef.current}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);

      // Avoid creating a duplicate if a full candle for this period start time has already been processed by updateLatestCandle
      if (processedCandleTimesRef.current.has(currentPricePeriodStartTime)) {
        console.log(`[updateLatestPrice] Candle for period start ${new Date(currentPricePeriodStartTime * 1000).toISOString()} already processed by updateLatestCandle. Skipping new candle creation. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
        // We might still want to update this candle's close/high/low if it's the latest one.
      } else {
        // Create a new candle because this is a new period and we haven't received a full candle for it yet.
        console.log(`[updateLatestPrice] Creating new candle for period start ${new Date(currentPricePeriodStartTime * 1000).toISOString()} with price ${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
        
        processedCandleTimesRef.current.add(currentPricePeriodStartTime); // Mark as processed by price tick
        latestCandleTimeRef.current = currentPricePeriodStartTime; // Update latest known time
        // currentCandlePeriodRef.current = currentPricePeriod; // Update current period REF to this new one

        const newCandleTime = currentPricePeriodStartTime as Time;
        
        if (chartType === 'line' || chartType === 'area') {
          setCandles(prevCandles => {
            const lineCandles = prevCandles as LineData<Time>[];
            const newPoint: LineData<Time> = { time: newCandleTime, value: price };
            console.log(`[updateLatestPrice] Adding new ${chartType} point: T:${new Date(newCandleTime as number * 1000).toISOString()} V:${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
            return ensureUniqueTimestamps([...lineCandles, newPoint]);
          });
        } else { // Candlestick or Bar
          setCandles(prevCandles => {
            const candlestickCandles = prevCandles as CandlestickData<Time>[];
            const newCandleStick: CandlestickData<Time> = {
              time: newCandleTime,
              open: price,
              high: price,
              low: price,
              close: price
            };
            console.log(`[updateLatestPrice] Adding new ${chartType} candle: T:${new Date(newCandleTime as number * 1000).toISOString()} O:${price} H:${price} L:${price} C:${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
            return ensureUniqueTimestamps([...candlestickCandles, newCandleStick]);
          });
        }
        // It's important to update currentCandlePeriodRef here to reflect that a new candle for this period has been initiated.
        // This prevents multiple new candles from being created by subsequent price ticks within the same new period before a full candle arrives.
        currentCandlePeriodRef.current = currentPricePeriod; 
        console.log(`[updateLatestPrice] Updated currentCandlePeriodRef.current to ${currentPricePeriod} after creating new candle. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
        lastPriceUpdateTimeRef.current = now; // Record time of this update
        return; // Exit after creating new candle
      }
    }

    // Scenario 2: The price tick updates the most recent candle.
    // This happens if it's not a new period OR if a candle for this period was already processed (e.g. by updateLatestCandle or a previous price tick)
    setCandles(prevCandles => {
      // Ensure prevCandles is not empty before proceeding
      if (!prevCandles || prevCandles.length === 0) {
        console.log(`[updateLatestPrice] prevCandles is empty or undefined, skipping update. Price: ${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
        return prevCandles;
      }

      let lastCandle = prevCandles[prevCandles.length - 1];
      const lastCandleTime = Number(lastCandle.time);
      const lastCandlePeriod = Math.floor(lastCandleTime / intervalSeconds);

      // Check if the last candle in our array corresponds to the current price period
      // This is crucial to ensure we are updating the correct candle.
      if (lastCandlePeriod === currentPricePeriod) {
        if (chartType === 'line' || chartType === 'area') {
          const lineCandles = prevCandles as LineData<Time>[];
          const lastLineCandle = { ...(lineCandles[lineCandles.length - 1] as LineData<Time>) };
          
          if (lastLineCandle.value === price) return lineCandles; // No change
          
          lastLineCandle.value = price;
          console.log(`[updateLatestPrice] Updating last ${chartType} point's value to ${price}. Time: ${new Date(lastCandleTime * 1000).toISOString()}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          return ensureUniqueTimestamps([...lineCandles.slice(0, -1), lastLineCandle]);
        } else { // Candlestick or Bar
          const candlestickCandles = prevCandles as CandlestickData<Time>[];
          const lastCandleStick = { ...(candlestickCandles[candlestickCandles.length - 1] as CandlestickData<Time>) };

          // Only update if close price changes, or high/low needs adjustment
          if (lastCandleStick.close === price && price <= lastCandleStick.high && price >= lastCandleStick.low) {
            return candlestickCandles; // No significant change
          }

          lastCandleStick.high = Math.max(lastCandleStick.high, price);
          lastCandleStick.low = Math.min(lastCandleStick.low, price);
          lastCandleStick.close = price;
          console.log(`[updateLatestPrice] Updating last ${chartType} candle. Time: ${new Date(lastCandleTime*1000).toISOString()}. New H:${lastCandleStick.high} L:${lastCandleStick.low} C:${lastCandleStick.close}. Price: ${price}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
          return ensureUniqueTimestamps([...candlestickCandles.slice(0, -1), lastCandleStick]);
        }
      } else {
         // This case means the last candle in `candles` array is from a previous period,
         // and `isNewCandlePeriodByPriceTick` was false (implying currentPricePeriod <= currentCandlePeriodRef.current).
         // This could happen if `currentCandlePeriodRef` got updated by a premature `updateLatestCandle` call for a future period,
         // or if price ticks are arriving for an older period than the one `currentCandlePeriodRef` suggests.
         // For now, we'll log this situation. Ideally, `updateLatestPrice` should only affect the *latest* candle or create a *new* one at the end.
         console.warn(`[updateLatestPrice] Price tick for period ${currentPricePeriod} (${new Date(currentPricePeriodStartTime*1000).toISOString()}) does not match last candle's period ${lastCandlePeriod} (${new Date(lastCandleTime*1000).toISOString()}). No update performed by price tick. currentCandlePeriodRef: ${currentCandlePeriodRef.current}. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
         return prevCandles;
      }
    });
    lastPriceUpdateTimeRef.current = now; // Record time of this update
  }, [chartType, selectedTimeframe, selectedSymbol]);
  
  // Update candle when latestCandle prop changes
  useEffect(() => {
    if (latestCandle) {
      // The console log for received candle is now inside updateLatestCandle itself.
      // console.log(`[useChartData effect] Received latestCandle prop. Time: ${new Date(Number(latestCandle.time) * 1000).toISOString()}. Triggering updateLatestCandle. Symbol=${selectedSymbol} timeframe=${selectedTimeframe}`);
      updateLatestCandle(latestCandle);
    }
  }, [latestCandle, updateLatestCandle, selectedSymbol, selectedTimeframe]); // Added selectedSymbol and selectedTimeframe for context if needed in logs

  return {
    candles,
    isLoading,
    updateLatestCandle,
    updateLatestPrice
  };
};
