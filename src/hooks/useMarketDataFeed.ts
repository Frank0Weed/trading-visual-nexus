
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
}

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  const [lastMessageTime, setLastMessageTime] = useState<number>(Date.now());
  
  const subscribedSymbolsRef = useRef<string>('');
  const subscribedTimeframeRef = useRef<string>('');
  const isInitializedRef = useRef<boolean>(false);
  
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
    
    // Subscribe to live price updates using the correct message format
    sendMessage(JSON.stringify({
      type: 'subscribe_prices',
      symbols: symbols
    }));
    
    // Subscribe to candle updates if timeframe is available
    if (currentTimeframe) {
      console.log(`Subscribing to candles for timeframe: ${currentTimeframe}`);
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: currentTimeframe
      }));
    }
    
    subscribedSymbolsRef.current = symbolsKey;
    subscribedTimeframeRef.current = currentTimeframe || '';
    isInitializedRef.current = true;
  }, [readyState, symbols, currentTimeframe, sendMessage]);

  // Handle WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const message = JSON.parse(lastMessage.data);
      setLastMessageTime(Date.now());
      
      console.log('Received WebSocket message:', message);
      
      // Handle live price updates with the new format
      if (message.type === 'price_update') {
        const { symbol, data } = message;
        
        if (symbol && data && data.bid && data.ask) {
          const { time, bid, ask, spread } = data;
          
          setPrices(prev => ({
            ...prev,
            [symbol]: {
              symbol,
              time: time || Date.now() / 1000,
              bid: parseFloat(bid),
              ask: parseFloat(ask),
              spread: parseFloat(spread) || Math.abs(parseFloat(ask) - parseFloat(bid))
            }
          }));
          
          console.log(`Price update for ${symbol}: bid=${bid}, ask=${ask}, spread=${spread}`);
        }
      }
      
      // Also handle the old format for backwards compatibility
      if (message.type === 'price_tick') {
        const { symbol, bid, ask, time, spread } = message;
        
        if (symbol && bid && ask) {
          setPrices(prev => ({
            ...prev,
            [symbol]: {
              symbol,
              time: time || Date.now() / 1000,
              bid: parseFloat(bid),
              ask: parseFloat(ask),
              spread: parseFloat(spread) || Math.abs(parseFloat(ask) - parseFloat(bid))
            }
          }));
        }
      }
      
      // Handle candle updates
      if (message.type === 'candle_update') {
        const { symbol, timeframe, candle } = message;
        
        if (!candle || typeof candle !== 'object') return;
        
        const parsedCandle: CandleData = {
          time: typeof candle.time === 'string' ? parseInt(candle.time, 10) : Number(candle.time),
          open: parseFloat(candle.open) || 0,
          high: parseFloat(candle.high) || 0,
          low: parseFloat(candle.low) || 0,
          close: parseFloat(candle.close) || 0,
          tick_volume: parseInt(candle.tick_volume) || 0,
          spread: parseFloat(candle.spread) || 0,
          real_volume: parseInt(candle.real_volume) || 0,
          volume: parseInt(candle.volume || candle.tick_volume) || 0
        };
        
        console.log(`Live candle update for ${symbol} ${timeframe}:`, parsedCandle);
        
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
      }

      // Handle heartbeat/pong
      if (message.type === 'pong') {
        console.log('Received heartbeat response');
      }

    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  }, [lastMessage]);

  // Subscribe when connection opens
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      subscribeToData();
    }
  }, [readyState, subscribeToData]);

  // Handle timeframe changes
  useEffect(() => {
    if (readyState === ReadyState.OPEN && currentTimeframe && isInitializedRef.current) {
      const timeframeChanged = currentTimeframe !== subscribedTimeframeRef.current;
      
      if (timeframeChanged) {
        console.log(`Timeframe changed to ${currentTimeframe}, resubscribing...`);
        
        if (subscribedTimeframeRef.current) {
          sendMessage(JSON.stringify({
            type: 'unsubscribe_candles',
            symbols: symbols
          }));
        }
        
        sendMessage(JSON.stringify({
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: currentTimeframe
        }));
        
        subscribedTimeframeRef.current = currentTimeframe;
      }
    }
  }, [currentTimeframe, readyState, symbols, sendMessage]);

  // Heartbeat to maintain connection
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
    lastMessageTime
  };
};
