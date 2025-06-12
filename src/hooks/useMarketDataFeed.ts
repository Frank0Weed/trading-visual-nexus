
import { useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getWebSocketUrl, PriceData, CandleData } from '../services/apiService';
import { toast } from '@/components/ui/sonner';
import { wsOptimizer } from '@/utils/wsOptimization';
import { dataCache } from '@/services/dataCache';

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
    'H1': 60, 'H4': 240, 'D1': 1440, 'W1': 10080, 'MN1': 43200
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
  
  // Performance optimization refs
  const lastPriceUpdateRef = useRef<Record<string, { time: number; bid: number; ask: number }>>({});
  const lastCandleUpdateRef = useRef<Record<string, Record<string, { time: number; close: number }>>>({});
  
  // Message processing refs
  const messageQueueRef = useRef<any[]>([]);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('🔌 WebSocket connection established');
      toast.success('Market data connection established');
      isInitializedRef.current = false;
    },
    onError: (error) => {
      console.error('❌ WebSocket connection error:', error);
      toast.error('Market data connection error');
    },
    onClose: (event) => {
      console.warn('🔌 WebSocket connection closed:', event.code, event.reason);
      toast.warning('Market data connection closed, attempting to reconnect...');
      isInitializedRef.current = false;
    },
    onMessage: (event) => {
      console.log('📨 WebSocket message received:', event.data);
      setLastMessageTime(Date.now());
    }
  });

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Enhanced subscription with better error handling
  const subscribeToData = useCallback(() => {
    if (readyState !== ReadyState.OPEN || symbols.length === 0) {
      console.log('🚫 Cannot subscribe - WebSocket not ready or no symbols');
      return;
    }
    
    const symbolsKey = symbols.sort().join(',');
    const needsSubscription = symbolsKey !== subscribedSymbolsRef.current || 
                             currentTimeframe !== subscribedTimeframeRef.current ||
                             !isInitializedRef.current;
    
    if (!needsSubscription) {
      console.log('✅ Already subscribed to current symbols and timeframe');
      return;
    }
    
    console.log('📡 Subscribing to live data for symbols:', symbols);
    console.log('📡 Current timeframe:', currentTimeframe);
    
    try {
      // Subscribe to price updates
      const priceSubscription = {
        type: 'subscribe_prices',
        symbols: symbols
      };
      console.log('📤 Sending price subscription:', priceSubscription);
      sendMessage(JSON.stringify(priceSubscription));
      
      // Subscribe to candle updates for all timeframes
      const allTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'];
      
      allTimeframes.forEach(timeframe => {
        const candleSubscription = {
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: timeframe
        };
        console.log('📤 Sending candle subscription:', candleSubscription);
        sendMessage(JSON.stringify(candleSubscription));
      });
      
      // Send a test ping to verify connection
      const pingMessage = {
        type: 'ping',
        timestamp: Date.now()
      };
      console.log('📤 Sending ping:', pingMessage);
      sendMessage(JSON.stringify(pingMessage));
      
    } catch (error) {
      console.error('❌ Error sending subscription messages:', error);
      toast.error('Failed to subscribe to market data');
      return;
    }
    
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
    
    console.log('✅ Subscription completed successfully');
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Enhanced message processing with better logging
  const processMessageBatch = useCallback(() => {
    if (messageQueueRef.current.length === 0) return;
    
    const messages = [...messageQueueRef.current];
    messageQueueRef.current = [];
    
    console.log(`🔄 Processing ${messages.length} messages`);
    
    // Group messages by type for batch processing
    const priceUpdates: any[] = [];
    const candleUpdates: any[] = [];
    const newCandleNotifications: any[] = [];
    const pongMessages: any[] = [];
    
    messages.forEach(msg => {
      try {
        const parsedMessage = JSON.parse(msg.data);
        console.log('📋 Parsed message:', parsedMessage);
        
        if (parsedMessage.type === 'price_update' || parsedMessage.type === 'price_tick') {
          priceUpdates.push(parsedMessage);
        } else if (parsedMessage.type === 'candle_update') {
          candleUpdates.push(parsedMessage);
        } else if (parsedMessage.type === 'new_candle_open') {
          newCandleNotifications.push(parsedMessage);
        } else if (parsedMessage.type === 'pong') {
          pongMessages.push(parsedMessage);
        } else {
          console.log('❓ Unknown message type:', parsedMessage.type);
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error, msg.data);
      }
    });
    
    // Process pong messages (connection health)
    if (pongMessages.length > 0) {
      console.log('🏓 Received pong messages:', pongMessages.length);
    }
    
    // Process price updates in batch
    if (priceUpdates.length > 0) {
      console.log('💰 Processing price updates:', priceUpdates.length);
      
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
          console.log(`💹 Price update for ${symbol}:`, priceUpdateBatch[symbol]);
        }
      });
      
      if (Object.keys(priceUpdateBatch).length > 0) {
        setPrices(prev => ({ ...prev, ...priceUpdateBatch }));
      }
    }
    
    // Process candle updates in batch
    if (candleUpdates.length > 0) {
      console.log('🕯️ Processing candle updates:', candleUpdates.length);
      
      const candleUpdateBatch: Record<string, Record<string, CandleData>> = {};
      const newCandleEventBatch: Record<string, Record<string, number>> = {};
      
      candleUpdates.forEach(msg => {
        const { symbol, timeframe, data: candleData } = msg;
        console.log(`🕯️ Candle update for ${symbol} ${timeframe}:`, candleData);
        
        if (!candleData || typeof candleData !== 'object') {
          console.warn('⚠️ Invalid candle data:', candleData);
          return;
        }
        
        const candleTime = typeof candleData.time === 'string' ? parseInt(candleData.time, 10) : Number(candleData.time);
        if (isNaN(candleTime) || candleTime <= 0) {
          console.warn('⚠️ Invalid candle time:', candleData.time);
          return;
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
        
        if (isDuplicateCandle) {
          console.log(`🔄 Duplicate candle for ${symbol} ${timeframe}, skipping`);
          return;
        }
        
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
          console.log(`🆕 New candle period detected for ${symbol} ${timeframe}`);
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
        console.log('🕯️ Applied candle updates:', Object.keys(candleUpdateBatch));
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
      console.log(`🆕 New candle notification for ${symbol} ${timeframe}`);
      
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
    
  }, [currentTimeframe]);

  // Enhanced message handling with queueing
  const handleMessage = useCallback((message: any) => {
    if (!message) return;
    
    console.log('📥 Raw WebSocket message received:', message.data);
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
      console.log('🔗 WebSocket is open, attempting to subscribe...');
      subscribeToData();
    } else {
      console.log('🔗 WebSocket state:', connectionStatus);
    }
  }, [readyState, subscribeToData, connectionStatus]);

  // Enhanced heartbeat with better logging
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    
    console.log('💓 Starting heartbeat interval');
    
    const heartbeatInterval = setInterval(() => {
      console.log('💓 Sending heartbeat ping');
      sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
      const now = Date.now();
      if (now - lastMessageTime > 30000) {
        console.warn('⚠️ No messages received in 30 seconds');
      }
    }, 30000); // Every 30 seconds
    
    return () => {
      console.log('💓 Stopping heartbeat interval');
      clearInterval(heartbeatInterval);
    };
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
