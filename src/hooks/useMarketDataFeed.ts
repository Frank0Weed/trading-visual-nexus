import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getWebSocketUrl, PriceData, CandleData } from '../services/apiService';
import { toast } from '@/components/ui/sonner';
import { wsOptimizer } from '@/utils/wsOptimization';
import { dataCache } from '@/services/dataCache';
import { CandleTimeValidator } from '@/utils/candleTimeValidator';

interface UseMarketDataFeedProps {
  symbols: string[];
  currentTimeframe?: string;
}

interface MarketDataFeedResult {
  prices: Record<string, PriceData>;
  latestCandles: Record<string, Record<string, CandleData>>;
  connectionStatus: string;
  readyState: ReadyState;
  sendMessage: (message: string) => void;
  lastMessageTime: number;
  newCandleEvents: Record<string, Record<string, number>>;
}

// Optimized candle start time calculation with caching
const candleStartTimeCache = new Map<string, number>();

const getCandleStartTime = (timestamp: number, timeframe: string): number => {
  const cacheKey = `${timestamp}-${timeframe}`;
  
  if (candleStartTimeCache.has(cacheKey)) {
    return candleStartTimeCache.get(cacheKey)!;
  }

  const timeframeMinutes: Record<string, number> = {
    'M1': 1, 'M5': 5, 'M15': 15, 'M30': 30,
    'H1': 60, 'H4': 240, 'D1': 1440, 'W1': 10080, 
    'MN1': 43200, 'MN': 43200  // Added MN1 and MN alias
  };

  const minutes = timeframeMinutes[timeframe] || 1;
  const milliseconds = minutes * 60 * 1000;
  const timestampMs = timestamp * 1000;
  const alignedMs = Math.floor(timestampMs / milliseconds) * milliseconds;
  const result = alignedMs / 1000;
  
  candleStartTimeCache.set(cacheKey, result);
  
  // Limit cache size
  if (candleStartTimeCache.size > 1000) {
    const firstKey = candleStartTimeCache.keys().next().value;
    candleStartTimeCache.delete(firstKey);
  }
  
  return result;
};

const isNewCandlePeriod = (currentTime: number, previousStartTime: number | undefined, timeframe: string): boolean => {
  if (!previousStartTime) return true;
  const currentCandleStart = getCandleStartTime(currentTime, timeframe);
  return currentCandleStart !== previousStartTime;
};

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [newCandleEvents, setNewCandleEvents] = useState<Record<string, Record<string, number>>>({});
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  
  const subscribedSymbolsRef = useRef<string>('');
  const subscribedTimeframeRef = useRef<string>('');
  const isInitializedRef = useRef<boolean>(false);
  const lastCandleStartTimesRef = useRef<Record<string, Record<string, number>>>({});
  const processedCandleTimesRef = useRef<Set<number>>(new Set());
  
  // Optimized refs with better memory management
  const lastPriceUpdateRef = useRef<Record<string, { time: number; bid: number; ask: number }>>({});
  const lastCandleUpdateRef = useRef<Record<string, Record<string, { time: number; close: number }>>>({});
  
  // Performance optimization refs
  const messageQueueRef = useRef<any[]>([]);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established');
      toast.success('Market data connection established');
      isInitializedRef.current = false;
    },
    onError: () => {
      console.error('WebSocket connection error');
      toast.error('Market data connection error');
    },
    onClose: () => {
      console.warn('WebSocket connection closed');
      toast.warning('Market data connection closed, attempting to reconnect...');
      isInitializedRef.current = false;
    }
  });

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Optimized subscription with caching
  const subscribeToData = useCallback(() => {
    if (readyState !== ReadyState.OPEN || symbols.length === 0) return;
    
    const symbolsKey = symbols.sort().join(',');
    const needsSubscription = symbolsKey !== subscribedSymbolsRef.current || 
                             currentTimeframe !== subscribedTimeframeRef.current ||
                             !isInitializedRef.current;
    
    if (!needsSubscription) return;
    
    console.log('Subscribing to live data for symbols:', symbols);
    
    // Use cached subscription data if available
    const subscriptionKey = `subscription:${symbolsKey}:${currentTimeframe}`;
    
    if (!dataCache.has(subscriptionKey)) {
      sendMessage(JSON.stringify({
        type: 'subscribe_prices',
        symbols: symbols
      }));
      
      // Subscribe to all supported timeframes including new ones
      const allTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1', 'MN'];
      
      allTimeframes.forEach(timeframe => {
        sendMessage(JSON.stringify({
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: timeframe
        }));
      });
      
      dataCache.set(subscriptionKey, true, 300000); // Cache for 5 minutes
    }
    
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Add candle validators for each timeframe including new ones
  const candleValidators = useMemo(() => {
    const validators: Record<string, CandleTimeValidator> = {};
    const timeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1', 'MN'];
    
    timeframes.forEach(tf => {
      validators[tf] = new CandleTimeValidator(tf, {
        fillMissing: false, // Don't auto-fill in live feed
        maxDelay: 120 // 2 minutes max delay for live data
      });
    });
    
    return validators;
  }, []);

  // Optimized message processing with batching
  const processMessageBatch = useCallback(() => {
    if (messageQueueRef.current.length === 0) return;
    
    const messages = [...messageQueueRef.current];
    messageQueueRef.current = [];
    
    // Group messages by type for batch processing
    const priceUpdates: any[] = [];
    const candleUpdates: any[] = [];
    const newCandleNotifications: any[] = [];
    
    messages.forEach(msg => {
      try {
        const parsedMessage = JSON.parse(msg.data);
        
        if (parsedMessage.type === 'price_update' || parsedMessage.type === 'price_tick') {
          priceUpdates.push(parsedMessage);
        } else if (parsedMessage.type === 'candle_update') {
          candleUpdates.push(parsedMessage);
        } else if (parsedMessage.type === 'new_candle_open') {
          newCandleNotifications.push(parsedMessage);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    });
    
    // Process price updates in batch
    if (priceUpdates.length > 0) {
      const latestPriceBySymbol = new Map<string, any>();
      
      priceUpdates.forEach(msg => {
        const symbol = msg.symbol || msg.data?.symbol;
        if (symbol) {
          latestPriceBySymbol.set(symbol, msg);
        }
      });
      
      // Apply only the latest price for each symbol
      const priceUpdateBatch: Record<string, PriceData> = {};
      
      latestPriceBySymbol.forEach((msg, symbol) => {
        const data = msg.data || msg;
        const { time, bid, ask, spread } = data;
        const bidNum = parseFloat(bid);
        const askNum = parseFloat(ask);
        const timeNum = time || Date.now() / 1000;
        
        // Check for duplicates
        const lastUpdate = lastPriceUpdateRef.current[symbol];
        const isDuplicate = lastUpdate && 
          lastUpdate.time === timeNum && 
          lastUpdate.bid === bidNum && 
          lastUpdate.ask === askNum;
        
        if (!isDuplicate) {
          priceUpdateBatch[symbol] = {
            symbol,
            time: timeNum,
            bid: bidNum,
            ask: askNum,
            spread: parseFloat(spread) || Math.abs(askNum - bidNum)
          };
          
          lastPriceUpdateRef.current[symbol] = { time: timeNum, bid: bidNum, ask: askNum };
        }
      });
      
      if (Object.keys(priceUpdateBatch).length > 0) {
        setPrices(prev => ({ ...prev, ...priceUpdateBatch }));
      }
    }
    
    // Process candle updates in batch
    if (candleUpdates.length > 0) {
      const candleUpdateBatch: Record<string, Record<string, CandleData>> = {};
      const newCandleEventBatch: Record<string, Record<string, number>> = {};
      
      candleUpdates.forEach(msg => {
        const { symbol, timeframe, data: candleData } = msg;
        
        if (!candleData || typeof candleData !== 'object') return;
        
        const candleTime = typeof candleData.time === 'string' ? parseInt(candleData.time, 10) : Number(candleData.time);
        if (isNaN(candleTime) || candleTime <= 0) return;
        
        // Validate candle timing
        const validator = candleValidators[timeframe];
        if (validator) {
          const lastCandleTime = lastCandleStartTimesRef.current[symbol]?.[timeframe];
          
          if (lastCandleTime) {
            const shouldCreate = validator.shouldCreateCandle(lastCandleTime, candleTime);
            if (!shouldCreate) {
              console.log(`Rejecting early candle for ${symbol} ${timeframe}. Time: ${candleTime}, Last: ${lastCandleTime}`);
              return;
            }
          }
        }
        
        const closePrice = parseFloat(candleData.close) || 0;
        
        // Check for duplicate candle updates
        if (!lastCandleUpdateRef.current[symbol]) {
          lastCandleUpdateRef.current[symbol] = {};
        }
        
        const lastCandle = lastCandleUpdateRef.current[symbol][timeframe];
        const isDuplicateCandle = lastCandle && 
          lastCandle.time === candleTime && 
          lastCandle.close === closePrice;
        
        if (isDuplicateCandle) return;
        
        const candleStartTime = getCandleStartTime(candleTime, timeframe);
        const tickVolume = parseInt(candleData.tick_volume) || parseInt(candleData.volume) || 0;
        
        const parsedCandle: CandleData = {
          time: candleTime,
          open: parseFloat(candleData.open) || 0,
          high: parseFloat(candleData.high) || 0,
          low: parseFloat(candleData.low) || 0,
          close: closePrice,
          tick_volume: tickVolume,
          spread: parseFloat(candleData.spread) || 0,
          real_volume: parseInt(candleData.real_volume) || 0,
          volume: tickVolume
        };
        
        // Initialize tracking for this symbol/timeframe if needed
        if (!lastCandleStartTimesRef.current[symbol]) {
          lastCandleStartTimesRef.current[symbol] = {};
        }
        
        const lastCandleStartTime = lastCandleStartTimesRef.current[symbol][timeframe];
        
        // Check if this is a NEW candle period
        if (isNewCandlePeriod(candleTime, lastCandleStartTime, timeframe)) {
          if (!newCandleEventBatch[symbol]) {
            newCandleEventBatch[symbol] = {};
          }
          newCandleEventBatch[symbol][timeframe] = candleStartTime;
          lastCandleStartTimesRef.current[symbol][timeframe] = candleStartTime;
        }
        
        // Prepare candle update
        if (!candleUpdateBatch[symbol]) {
          candleUpdateBatch[symbol] = {};
        }
        candleUpdateBatch[symbol][timeframe] = parsedCandle;
        
        lastCandleUpdateRef.current[symbol][timeframe] = { time: candleTime, close: closePrice };
      });
      
      // Apply all candle updates at once
      if (Object.keys(candleUpdateBatch).length > 0) {
        setLatestCandles(prev => {
          const newState = { ...prev };
          Object.entries(candleUpdateBatch).forEach(([symbol, symbolCandles]) => {
            newState[symbol] = { ...newState[symbol], ...symbolCandles };
          });
          return newState;
        });
      }
      
      // Apply new candle events
      if (Object.keys(newCandleEventBatch).length > 0) {
        setNewCandleEvents(prev => {
          const newState = { ...prev };
          Object.entries(newCandleEventBatch).forEach(([symbol, symbolEvents]) => {
            newState[symbol] = { ...newState[symbol], ...symbolEvents };
          });
          return newState;
        });
        
        // Show notifications for current timeframe
        Object.entries(newCandleEventBatch).forEach(([symbol, symbolEvents]) => {
          Object.keys(symbolEvents).forEach(timeframe => {
            if (timeframe === currentTimeframe) {
              toast.info(`🕯️ New ${timeframe} candle opened for ${symbol}`, { duration: 3000 });
            }
          });
        });
      }
    }
    
    // Process new candle notifications
    newCandleNotifications.forEach(msg => {
      const { symbol, timeframe, time } = msg;
      
      setNewCandleEvents(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          [timeframe]: time
        }
      }));
      
      if (timeframe === currentTimeframe) {
        toast.success(`🕯️ New ${timeframe} candle opened for ${symbol}`, { duration: 3000 });
      }
    });
    
  }, [currentTimeframe, candleValidators]);

  // Optimized message handling with queueing
  const handleMessage = useCallback((message: any) => {
    if (!message) return;
    
    setLastMessageTime(Date.now());
    
    // Add message to queue
    messageQueueRef.current.push(message);
    
    // Schedule batch processing
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    processingTimeoutRef.current = setTimeout(() => {
      processMessageBatch();
    }, 16); // ~60fps
    
  }, [processMessageBatch]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  // Subscribe when connection opens
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      subscribeToData();
    }
  }, [readyState, subscribeToData]);

  // Optimized heartbeat with reduced frequency
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    
    const heartbeatInterval = setInterval(() => {
      sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
      const now = Date.now();
      if (now - lastMessageTime > 30000) {
        console.warn('No messages received in 30 seconds');
      }
    }, 30000); // Reduced to every 30 seconds
    
    return () => clearInterval(heartbeatInterval);
  }, [readyState, sendMessage, lastMessageTime]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      wsOptimizer.cleanup();
    };
  }, []);

  return { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    sendMessage,
    lastMessageTime,
    newCandleEvents
  };
};
