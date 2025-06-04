
import { useState, useEffect, useCallback, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getWebSocketUrl, PriceData, CandleData } from '../services/apiService';
import { toast } from '@/components/ui/sonner';

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
  newCandleEvents: Record<string, Record<string, number>>; // symbol -> timeframe -> timestamp
}

// Helper function to calculate candle start time for a given timestamp and timeframe
const getCandleStartTime = (timestamp: number, timeframe: string): number => {
  const timeframeMinutes: Record<string, number> = {
    'M1': 1,
    'M5': 5,
    'M15': 15,
    'M30': 30,
    'H1': 60,
    'H4': 240,
    'D1': 1440,
    'W1': 10080,
    'MN1': 43200
  };

  const minutes = timeframeMinutes[timeframe] || 1;
  const milliseconds = minutes * 60 * 1000;
  
  // Convert timestamp to milliseconds, align to candle boundary, convert back to seconds
  const timestampMs = timestamp * 1000;
  const alignedMs = Math.floor(timestampMs / milliseconds) * milliseconds;
  return alignedMs / 1000;
};

// Improved helper to detect if this is a NEW candle period
const isNewCandlePeriod = (currentTime: number, previousStartTime: number | undefined, timeframe: string): boolean => {
  if (!previousStartTime) return true; // First candle is always "new"
  
  const currentCandleStart = getCandleStartTime(currentTime, timeframe);
  
  // New candle period if the start time has changed
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
  // Track the candle START times for accurate new candle detection
  const lastCandleStartTimesRef = useRef<Record<string, Record<string, number>>>({});
  
  // Add refs to prevent duplicate processing
  const lastPriceUpdateRef = useRef<Record<string, { time: number; bid: number; ask: number }>>({});
  const lastCandleUpdateRef = useRef<Record<string, Record<string, { time: number; close: number }>>>({});
  
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

  const subscribeToData = useCallback(() => {
    if (readyState !== ReadyState.OPEN || symbols.length === 0) return;
    
    const symbolsKey = symbols.sort().join(',');
    const needsSubscription = symbolsKey !== subscribedSymbolsRef.current || 
                             currentTimeframe !== subscribedTimeframeRef.current ||
                             !isInitializedRef.current;
    
    if (!needsSubscription) return;
    
    console.log('Subscribing to live data for symbols:', symbols);
    
    // Subscribe to live price updates
    sendMessage(JSON.stringify({
      type: 'subscribe_prices',
      symbols: symbols
    }));
    
    // Subscribe to all timeframes for new candle detection
    const allTimeframes = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1', 'MN1'];
    
    allTimeframes.forEach(timeframe => {
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: timeframe
      }));
    });
    
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Handle WebSocket messages with improved duplicate prevention
  const handleMessage = useCallback((message: any) => {
    if (!message) return;
    
    try {
      const parsedMessage = JSON.parse(message.data);
      setLastMessageTime(Date.now());
      
      // Handle live price updates with duplicate prevention
      if (parsedMessage.type === 'price_update') {
        const { symbol, data } = parsedMessage;
        
        if (symbol && data && data.bid && data.ask) {
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
            setPrices(prev => ({
              ...prev,
              [symbol]: {
                symbol,
                time: timeNum,
                bid: bidNum,
                ask: askNum,
                spread: parseFloat(spread) || Math.abs(askNum - bidNum)
              }
            }));
            
            // Update last price reference
            lastPriceUpdateRef.current[symbol] = { time: timeNum, bid: bidNum, ask: askNum };
          }
        }
      }
      
      // Handle old format for backwards compatibility with duplicate prevention
      if (parsedMessage.type === 'price_tick') {
        const { symbol, bid, ask, time, spread } = parsedMessage;
        
        if (symbol && bid && ask) {
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
            setPrices(prev => ({
              ...prev,
              [symbol]: {
                symbol,
                time: timeNum,
                bid: bidNum,
                ask: askNum,
                spread: parseFloat(spread) || Math.abs(askNum - bidNum)
              }
            }));
            
            lastPriceUpdateRef.current[symbol] = { time: timeNum, bid: bidNum, ask: askNum };
          }
        }
      }
      
      // Handle candle updates with improved new candle detection and duplicate prevention
      if (parsedMessage.type === 'candle_update') {
        const { symbol, timeframe } = parsedMessage;
        
        // Use 'data' field from WebSocket message
        const candleData = parsedMessage.data || parsedMessage.candle;
        
        if (!candleData || typeof candleData !== 'object') {
          return;
        }
        
        // Convert candle time to number and ensure it's valid
        const candleTime = typeof candleData.time === 'string' ? parseInt(candleData.time, 10) : Number(candleData.time);
        
        if (isNaN(candleTime) || candleTime <= 0) {
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
          return; // Skip duplicate candle updates
        }
        
        // Calculate the candle start time for this period
        const candleStartTime = getCandleStartTime(candleTime, timeframe);
        
        // Use tick_volume as primary volume source and ensure it's preserved
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
          volume: tickVolume // Use tick_volume as primary volume
        };
        
        // Initialize tracking for this symbol/timeframe if needed
        if (!lastCandleStartTimesRef.current[symbol]) {
          lastCandleStartTimesRef.current[symbol] = {};
        }
        
        const lastCandleStartTime = lastCandleStartTimesRef.current[symbol][timeframe];
        
        // Check if this is a NEW candle period
        if (isNewCandlePeriod(candleTime, lastCandleStartTime, timeframe)) {
          // Update new candle events with the new candle start time
          setNewCandleEvents(prev => ({
            ...prev,
            [symbol]: {
              ...prev[symbol],
              [timeframe]: candleStartTime
            }
          }));
          
          // Update the tracking with new candle start time
          lastCandleStartTimesRef.current[symbol][timeframe] = candleStartTime;
          
          // Toast notification for current timeframe only
          if (timeframe === currentTimeframe) {
            toast.info(`🕯️ New ${timeframe} candle opened for ${symbol}`, {
              duration: 3000,
            });
          }
        }
        
        // Update latest candles state - always update with proper volume
        setLatestCandles(prev => {
          const symbolCandles = prev[symbol] || {};
          return {
            ...prev,
            [symbol]: {
              ...symbolCandles,
              [timeframe]: parsedCandle
            }
          };
        });
        
        // Update last candle reference
        lastCandleUpdateRef.current[symbol][timeframe] = { time: candleTime, close: closePrice };
      }

      // Handle server-side new candle notifications
      if (parsedMessage.type === 'new_candle_open') {
        const { symbol, timeframe, time } = parsedMessage;
        
        setNewCandleEvents(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            [timeframe]: time
          }
        }));
        
        if (timeframe === currentTimeframe) {
          toast.success(`🕯️ New ${timeframe} candle opened for ${symbol}`, {
            duration: 3000,
          });
        }
      }

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [currentTimeframe]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      handleMessage(lastMessage);
    }
  }, [lastMessage, handleMessage]);

  // Subscribe when connection opens - stable dependency array
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      subscribeToData();
    }
  }, [readyState, subscribeToData]);

  // Heartbeat to maintain connection - reduce frequency
  useEffect(() => {
    if (readyState !== ReadyState.OPEN) return;
    
    const heartbeatInterval = setInterval(() => {
      sendMessage(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      
      const now = Date.now();
      if (now - lastMessageTime > 30000) {
        console.warn('No messages received in 30 seconds');
      }
    }, 15000);
    
    return () => clearInterval(heartbeatInterval);
  }, [readyState, sendMessage, lastMessageTime]);

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
