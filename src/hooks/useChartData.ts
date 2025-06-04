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

// Helper function to format candle data to match Chart component requirements - with proper volume
const formatCandleData = (candles: CandleData[], chartType: ChartType): CandlestickData<Time>[] | LineData<Time>[] => {
  if (chartType === 'line' || chartType === 'area') {
    return candles.map(candle => {
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : Number(candle.time);
        
      return {
        time: timeValue as Time,
        value: candle.close,
        // Preserve volume data
        tick_volume: candle.tick_volume || candle.volume || 0,
        volume: candle.tick_volume || candle.volume || 0
      };
    }) as LineData<Time>[];
  } else {
    return candles.map(candle => {
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : Number(candle.time);
        
      return {
        time: timeValue as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        // Preserve volume data for candlestick charts
        tick_volume: candle.tick_volume || candle.volume || 0,
        volume: candle.tick_volume || candle.volume || 0
      };
    }) as CandlestickData<Time>[];
  }
};

// Helper to ensure time values are unique and properly sorted with volume preserved
function ensureUniqueTimestamps<T extends {time: Time}>(data: T[]): T[] {
  const uniqueTimeMap = new Map<number, T>();
  
  data.forEach(item => {
    const numericTime = Number(item.time);
    uniqueTimeMap.set(numericTime, {
      ...item,
      time: numericTime as Time
    });
  });
  
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
  
  // Use refs to prevent unnecessary updates
  const lastUpdateTimeRef = useRef<number>(0);
  const processedCandleTimesRef = useRef<Set<number>>(new Set());
  const lastSymbolTimeframeRef = useRef<string>('');

  // Fetch candles when symbol or timeframe changes
  useEffect(() => {
    const symbolTimeframeKey = `${selectedSymbol}-${selectedTimeframe}`;
    
    // Only fetch if symbol or timeframe actually changed
    if (symbolTimeframeKey === lastSymbolTimeframeRef.current) return;
    
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        
        // Ensure volume data is preserved when formatting
        let formattedData = formatCandleData(data, chartType);
        
        if (chartType === 'line' || chartType === 'area') {
          formattedData = ensureUniqueTimestamps<LineData<Time>>(formattedData as LineData<Time>[]);
        } else {
          formattedData = ensureUniqueTimestamps<CandlestickData<Time>>(formattedData as CandlestickData<Time>[]);
        }
        
        // Log volume data to verify it's being included
        console.log('Formatted first candle with volume:', formattedData[0]);
        
        setCandles(formattedData);
        processedCandleTimesRef.current = new Set();
        lastSymbolTimeframeRef.current = symbolTimeframeKey;
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
      ? parseInt(candle.time, 10)
      : Number(candle.time);
    
    // Prevent processing the same candle multiple times
    if (processedCandleTimesRef.current.has(timeValue)) {
      return;
    }
    
    console.log(`Processing new candle: time=${new Date(timeValue * 1000).toLocaleTimeString()}, open=${candle.open}, close=${candle.close}, volume=${candle.tick_volume || 0}`);
    
    setCandles(prevCandles => {
      if (!prevCandles || prevCandles.length === 0) return prevCandles;
      
      if (chartType === 'line' || chartType === 'area') {
        const lineCandles = [...prevCandles] as LineData<Time>[];
        const candleIndex = lineCandles.findIndex(c => Number(c.time) === timeValue);
        
        const lineCandle: LineData<Time> = {
          time: timeValue as Time,
          value: candle.close,
          // Preserve volume data
          tick_volume: candle.tick_volume || candle.volume || 0,
          volume: candle.tick_volume || candle.volume || 0
        };
        
        let updatedCandles: LineData<Time>[];
        
        if (candleIndex >= 0) {
          updatedCandles = [...lineCandles];
          updatedCandles[candleIndex] = lineCandle;
        } else {
          updatedCandles = [...lineCandles, lineCandle];
        }
        
        return ensureUniqueTimestamps(updatedCandles);
      } else {
        const candlestickCandles = [...prevCandles] as CandlestickData<Time>[];
        const candleIndex = candlestickCandles.findIndex(c => Number(c.time) === timeValue);
        
        const candlestickData: CandlestickData<Time> = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          // Preserve volume data
          tick_volume: candle.tick_volume || candle.volume || 0,
          volume: candle.tick_volume || candle.volume || 0
        };
        
        let updatedCandles: CandlestickData<Time>[];
        
        if (candleIndex >= 0) {
          updatedCandles = [...candlestickCandles];
          updatedCandles[candleIndex] = candlestickData;
        } else {
          updatedCandles = [...candlestickCandles, candlestickData];
        }
        
        return ensureUniqueTimestamps(updatedCandles);
      }
    });
    
    // Mark this candle as processed
    processedCandleTimesRef.current.add(timeValue);
  }, [chartType]);
  
  // Update just the latest price (for real-time updates)
  const updateLatestPrice = useCallback((price: number) => {
    if (candles.length === 0) return;
    
    // Rate limit updates
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 200) return;
    lastUpdateTimeRef.current = now;
    
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const lineCandles = [...prevCandles] as LineData<Time>[];
        const lastCandle = { ...lineCandles[lineCandles.length - 1] };
        
        if (lastCandle.value === price) return lineCandles;
        
        lastCandle.value = price;
        
        return [
          ...lineCandles.slice(0, -1),
          lastCandle
        ];
      });
    } else {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const candlestickCandles = [...prevCandles] as CandlestickData<Time>[];
        const lastCandle = { ...candlestickCandles[candlestickCandles.length - 1] };
        
        if (lastCandle.close === price) return candlestickCandles;
        
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        lastCandle.close = price;
        // Preserve volume data
        lastCandle.volume = lastCandle.volume || lastCandle.tick_volume || 0;
        
        return [
          ...candlestickCandles.slice(0, -1),
          lastCandle
        ];
      });
    }
  }, [chartType, candles.length]);
  
  // Update candle when latestCandle prop changes - with debouncing
  useEffect(() => {
    if (!latestCandle) return;
    
    const timeValue = typeof latestCandle.time === 'string'
      ? parseInt(latestCandle.time, 10) 
      : Number(latestCandle.time);
      
    // Only process if this is a new candle time
    if (!processedCandleTimesRef.current.has(timeValue)) {
      console.log('Processing latestCandle prop:', 
        `time=${new Date(timeValue * 1000).toLocaleTimeString()}, open=${latestCandle.open}, close=${latestCandle.close}, volume=${latestCandle.tick_volume || 0}`);
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
