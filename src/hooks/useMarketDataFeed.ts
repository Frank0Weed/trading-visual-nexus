
import { useState, useEffect, useCallback } from 'react';
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
}

export const useMarketDataFeed = ({ symbols, currentTimeframe }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [latestCandles, setLatestCandles] = useState<Record<string, Record<string, CandleData>>>({});
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
    onOpen: () => {
      console.log('WebSocket connection established');
    },
    onError: () => {
      toast.error('WebSocket connection error');
    }
  });

  // WebSocket connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  // Subscribe to symbol updates via WebSocket
  const subscribeToSymbols = useCallback(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0) {
      console.log('Subscribing to symbols:', symbols);
      // Subscribe to all symbols
      sendMessage(JSON.stringify({
        type: 'subscribe',
        symbols: symbols
      }));
      
      // If we have a current timeframe, subscribe to candle updates too
      if (currentTimeframe) {
        console.log(`Subscribing to candles for timeframe: ${currentTimeframe}`);
        sendMessage(JSON.stringify({
          type: 'subscribe_candles',
          symbols: symbols,
          timeframe: currentTimeframe
        }));
      }
    }
  }, [readyState, sendMessage, symbols, currentTimeframe]);

  // Handle WebSocket messages
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        
        // Handle price updates
        if (data.type === 'price_update') {
          setPrices(prev => ({
            ...prev,
            [data.symbol]: data.data
          }));
        }
        
        // Handle new candle data
        if (data.type === 'candle_update') {
          const { symbol, timeframe, candle } = data;
          
          setLatestCandles(prev => {
            // Initialize nested structure if needed
            if (!prev[symbol]) {
              prev[symbol] = {};
            }
            
            return {
              ...prev,
              [symbol]: {
                ...prev[symbol],
                [timeframe]: candle
              }
            };
          });
          
          console.log(`Received new candle for ${symbol} ${timeframe}:`, candle);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage]);

  // Initial subscription
  useEffect(() => {
    subscribeToSymbols();
  }, [subscribeToSymbols]);

  // Resubscribe when timeframe changes
  useEffect(() => {
    if (currentTimeframe && readyState === ReadyState.OPEN) {
      console.log(`Timeframe changed to ${currentTimeframe}, resubscribing...`);
      
      // Unsubscribe from old candle feeds first
      sendMessage(JSON.stringify({
        type: 'unsubscribe_candles',
        symbols: symbols
      }));
      
      // Subscribe to new timeframe
      sendMessage(JSON.stringify({
        type: 'subscribe_candles',
        symbols: symbols,
        timeframe: currentTimeframe
      }));
    }
  }, [currentTimeframe, symbols, sendMessage, readyState]);

  return { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    sendMessage 
  };
};
