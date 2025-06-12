
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  fetchCandles,
  CandleData,
  TimeFrame
} from '../services/apiService';
import { CandlestickData, LineData, Time } from 'lightweight-charts';
import { ChartType } from '@/components/Chart';
import { DataCache } from '@/services/dataCache';

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

// Extended types for volume support
interface ExtendedCandlestickData extends CandlestickData<Time> {
  customValues?: {
    tick_volume?: number;
    volume?: number;
  };
}

interface ExtendedLineData extends LineData<Time> {
  customValues?: {
    tick_volume?: number;
    volume?: number;
  };
}

// Optimized formatting with memoization
const formatCandleData = (candles: CandleData[], chartType: ChartType): ExtendedCandlestickData[] | ExtendedLineData[] => {
  if (chartType === 'line' || chartType === 'area') {
    return candles.map(candle => {
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : Number(candle.time);
        
      const tickVolume = candle.tick_volume || candle.volume || 0;
        
      return {
        time: timeValue as Time,
        value: candle.close,
        customValues: {
          tick_volume: tickVolume,
          volume: tickVolume
        }
      } as ExtendedLineData;
    });
  } else {
    return candles.map(candle => {
      const timeValue = typeof candle.time === 'string' 
        ? new Date(candle.time).getTime() / 1000
        : Number(candle.time);
        
      const tickVolume = candle.tick_volume || candle.volume || 0;
        
      return {
        time: timeValue as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        customValues: {
          tick_volume: tickVolume,
          volume: tickVolume
        }
      } as ExtendedCandlestickData;
    });
  }
};

// Optimized unique timestamps function with better performance
function ensureUniqueTimestamps<T extends {time: Time}>(data: T[]): T[] {
  if (data.length === 0) return data;
  
  const uniqueTimeMap = new Map<number, T>();
  
  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const numericTime = Number(item.time);
    uniqueTimeMap.set(numericTime, {
      ...item,
      time: numericTime as Time
    });
  }
  
  return Array.from(uniqueTimeMap.values())
    .sort((a, b) => Number(a.time) - Number(b.time));
}

export const useChartData = ({ 
  selectedSymbol, 
  selectedTimeframe, 
  chartType,
  latestCandle
}: UseChartDataProps): ChartDataResult => {
  const [candles, setCandles] = useState<ExtendedCandlestickData[] | ExtendedLineData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Optimized refs
  const lastUpdateTimeRef = useRef<number>(0);
  const processedCandleTimesRef = useRef<Set<number>>(new Set());
  const lastSymbolTimeframeRef = useRef<string>('');
  const dataVersionRef = useRef<number>(0);
  const dataCacheRef = useRef<DataCache>(new DataCache());

  // Memoize cache key using static method
  const cacheKey = useMemo(() => 
    DataCache.candleKey(selectedSymbol, selectedTimeframe, 500), 
    [selectedSymbol, selectedTimeframe]
  );

  // Optimized candle fetching with caching
  useEffect(() => {
    const symbolTimeframeKey = `${selectedSymbol}-${selectedTimeframe}`;
    
    if (symbolTimeframeKey === lastSymbolTimeframeRef.current) return;
    
    const loadCandles = async () => {
      try {
        setIsLoading(true);
        
        // Check cache first
        const cachedData = dataCacheRef.current.get<ExtendedCandlestickData[] | ExtendedLineData[]>(cacheKey);
        if (cachedData && cachedData.length > 0) {
          console.log(`Using cached candles for ${selectedSymbol} ${selectedTimeframe}`);
          setCandles(cachedData);
          setIsLoading(false);
          dataVersionRef.current++;
          return;
        }
        
        console.log(`Fetching candles for ${selectedSymbol} ${selectedTimeframe}`);
        const data = await fetchCandles(selectedSymbol, selectedTimeframe, 500);
        
        let formattedData = formatCandleData(data, chartType);
        
        if (chartType === 'line' || chartType === 'area') {
          formattedData = ensureUniqueTimestamps<ExtendedLineData>(formattedData as ExtendedLineData[]);
        } else {
          formattedData = ensureUniqueTimestamps<ExtendedCandlestickData>(formattedData as ExtendedCandlestickData[]);
        }
        
        // Cache the formatted data
        dataCacheRef.current.set(cacheKey, formattedData, 60000); // Cache for 1 minute
        
        setCandles(formattedData);
        processedCandleTimesRef.current = new Set();
        lastSymbolTimeframeRef.current = symbolTimeframeKey;
        dataVersionRef.current++;
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
  }, [selectedSymbol, selectedTimeframe, chartType, cacheKey]);

  // Optimized candle update with better performance
  const updateLatestCandle = useCallback((candle: CandleData) => {
    if (!candle) return;
    
    const timeValue = typeof candle.time === 'string'
      ? parseInt(candle.time, 10)
      : Number(candle.time);
    
    // Prevent processing the same candle multiple times
    if (processedCandleTimesRef.current.has(timeValue)) {
      return;
    }
    
    const tickVolume = candle.tick_volume || candle.volume || 0;
    
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const newCandles = [...(prevCandles as ExtendedLineData[])];
        let candleIndex = -1;
        
        // Optimized search from the end (most likely position)
        for (let i = newCandles.length - 1; i >= Math.max(0, newCandles.length - 10); i--) {
          if (Number(newCandles[i].time) === timeValue) {
            candleIndex = i;
            break;
          }
        }
        
        const lineCandle: ExtendedLineData = {
          time: timeValue as Time,
          value: candle.close,
          customValues: {
            tick_volume: tickVolume,
            volume: tickVolume
          }
        };
        
        if (candleIndex >= 0) {
          newCandles[candleIndex] = lineCandle;
        } else {
          newCandles.push(lineCandle);
        }
        
        // Only sort if we added a new candle (performance optimization)
        if (candleIndex < 0) {
          return ensureUniqueTimestamps(newCandles);
        }
        
        return newCandles;
      });
    } else {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const newCandles = [...(prevCandles as ExtendedCandlestickData[])];
        let candleIndex = -1;
        
        // Optimized search from the end (most likely position)
        for (let i = newCandles.length - 1; i >= Math.max(0, newCandles.length - 10); i--) {
          if (Number(newCandles[i].time) === timeValue) {
            candleIndex = i;
            break;
          }
        }
        
        const candlestickData: ExtendedCandlestickData = {
          time: timeValue as Time,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          customValues: {
            tick_volume: tickVolume,
            volume: tickVolume
          }
        };
        
        if (candleIndex >= 0) {
          newCandles[candleIndex] = candlestickData;
        } else {
          newCandles.push(candlestickData);
        }
        
        // Only sort if we added a new candle (performance optimization)
        if (candleIndex < 0) {
          return ensureUniqueTimestamps(newCandles);
        }
        
        return newCandles;
      });
    }
    
    processedCandleTimesRef.current.add(timeValue);
  }, [chartType]);
  
  // Optimized price update with better throttling
  const updateLatestPrice = useCallback((price: number) => {
    if (candles.length === 0) return;
    
    const now = Date.now();
    if (now - lastUpdateTimeRef.current < 100) return; // 100ms throttle
    lastUpdateTimeRef.current = now;
    
    if (chartType === 'line' || chartType === 'area') {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const newCandles = [...(prevCandles as ExtendedLineData[])];
        const lastCandle = { ...newCandles[newCandles.length - 1] };
        
        if (lastCandle.value === price) return prevCandles;
        lastCandle.value = price;
        
        newCandles[newCandles.length - 1] = lastCandle;
        return newCandles;
      });
    } else {
      setCandles(prevCandles => {
        if (!prevCandles || prevCandles.length === 0) return prevCandles;
        
        const newCandles = [...(prevCandles as ExtendedCandlestickData[])];
        const lastCandle = { ...newCandles[newCandles.length - 1] };
        
        if (lastCandle.close === price) return prevCandles;
        
        lastCandle.high = Math.max(lastCandle.high, price);
        lastCandle.low = Math.min(lastCandle.low, price);
        lastCandle.close = price;
        
        // Preserve volume data
        const volumeValue = Number(lastCandle.customValues?.tick_volume) || Number(lastCandle.customValues?.volume) || 0;
        lastCandle.customValues = {
          ...lastCandle.customValues,
          volume: volumeValue,
          tick_volume: volumeValue
        };
        
        newCandles[newCandles.length - 1] = lastCandle;
        return newCandles;
      });
    }
  }, [chartType, candles.length]);
  
  // Optimized latest candle processing
  useEffect(() => {
    if (!latestCandle) return;
    
    const timeValue = typeof latestCandle.time === 'string'
      ? parseInt(latestCandle.time, 10) 
      : Number(latestCandle.time);
      
    if (!processedCandleTimesRef.current.has(timeValue)) {
      updateLatestCandle(latestCandle);
    }
  }, [latestCandle, updateLatestCandle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processedCandleTimesRef.current.clear();
      if (dataCacheRef.current) {
        dataCacheRef.current.destroy();
      }
    };
  }, []);

  return {
    candles: candles as CandlestickData<Time>[] | LineData<Time>[],
    isLoading,
    updateLatestCandle,
    updateLatestPrice
  };
};
