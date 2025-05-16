
import { useState, useEffect } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { getWebSocketUrl, PriceData } from '../services/apiService';

interface UseMarketDataFeedProps {
  symbols: string[];
}

interface MarketDataFeedResult {
  prices: Record<string, PriceData>;
  connectionStatus: string;
  readyState: ReadyState;
  sendMessage: (message: string) => void;
}

export const useMarketDataFeed = ({ symbols }: UseMarketDataFeedProps): MarketDataFeedResult => {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  
  const { sendMessage, lastMessage, readyState } = useWebSocket(getWebSocketUrl(), {
    shouldReconnect: () => true,
    reconnectAttempts: 10,
    reconnectInterval: 3000,
  });

  // WebSocket connection status
  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

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
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    }
  }, [lastMessage]);

  // Subscribe to symbol updates via WebSocket
  useEffect(() => {
    if (readyState === ReadyState.OPEN && symbols.length > 0) {
      // Subscribe to all symbols
      sendMessage(JSON.stringify({
        type: 'subscribe',
        symbols: symbols
      }));
    }
  }, [readyState, sendMessage, symbols]);

  return { 
    prices, 
    connectionStatus, 
    readyState,
    sendMessage 
  };
};
