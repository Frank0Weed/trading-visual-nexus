
import React, { useState, useCallback, useEffect } from 'react';
import { ReadyState } from 'react-use-websocket';

import { ChartType } from './Chart';
import PriceTicker from './PriceTicker';
import ChartToolbar from './ChartToolbar';
import TradingHeader from './trading/TradingHeader';
import ChartContainer from './trading/ChartContainer';

import { useMarketInitialization } from '../hooks/useMarketInitialization';
import { useMarketDataFeed } from '../hooks/useMarketDataFeed';
import { useChartData } from '../hooks/useChartData';
import { toast } from '@/components/ui/sonner';

const TradingPlatform: React.FC = () => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M1');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);
  const [lastConnectionCheck, setLastConnectionCheck] = useState<number>(Date.now());
  const [lastTimeframeChange, setLastTimeframeChange] = useState<number>(Date.now());

  // Initialize market data (only for symbols/timeframes, no prices)
  const { 
    symbols, 
    timeframes, 
    isLoading: isInitializing 
  } = useMarketInitialization();

  // Get live market data via WebSocket (prices + candles)
  const { 
    prices, 
    latestCandles,
    connectionStatus, 
    readyState,
    lastMessageTime
  } = useMarketDataFeed({ 
    symbols,
    currentTimeframe: selectedTimeframe
  });

  const latestCandle = latestCandles[selectedSymbol]?.[selectedTimeframe];

  // Fetch and format chart data
  const { 
    candles, 
    isLoading: isLoadingChart,
    updateLatestPrice
  } = useChartData({ 
    selectedSymbol, 
    selectedTimeframe, 
    chartType,
    latestCandle
  });

  // Monitor connection health
  useEffect(() => {
    const CHECK_INTERVAL = 30000;
    const connectionMonitor = setInterval(() => {
      const now = Date.now();
      if (now - lastMessageTime > 60000 && readyState !== ReadyState.CONNECTING) {
        if (now - lastConnectionCheck > CHECK_INTERVAL) {
          toast.warning("No market data received recently. Check your connection.");
          setLastConnectionCheck(now);
        }
      }
    }, CHECK_INTERVAL);
    
    return () => clearInterval(connectionMonitor);
  }, [lastMessageTime, readyState, lastConnectionCheck]);

  // Event handlers
  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  const handleTimeframeChange = useCallback((timeframe: string) => {
    const now = Date.now();
    if (timeframe !== selectedTimeframe && now - lastTimeframeChange > 1000) {
      console.log(`Changing timeframe from ${selectedTimeframe} to ${timeframe}`);
      setSelectedTimeframe(timeframe);
      setLastTimeframeChange(now);
    }
  }, [selectedTimeframe, lastTimeframeChange]);

  const handleChartTypeChange = useCallback((type: ChartType) => {
    setChartType(type);
  }, []);

  const handleIndicatorToggle = useCallback((indicatorId: string) => {
    setActiveIndicators(prev => {
      if (prev.includes(indicatorId)) {
        return prev.filter(id => id !== indicatorId);
      } else {
        return [...prev, indicatorId];
      }
    });
  }, []);

  // Use live WebSocket prices (no API fallback)
  const isLoading = isInitializing || isLoadingChart;
  const latestPrice = prices[selectedSymbol];

  return (
    <div className="flex flex-col h-full">
      <TradingHeader
        connectionStatus={connectionStatus}
        readyState={readyState}
        symbols={symbols}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSymbolSelect}
      />

      <PriceTicker
        prices={prices}
        onSymbolSelect={handleSymbolSelect}
        selectedSymbol={selectedSymbol}
      />

      <ChartToolbar
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        timeframe={selectedTimeframe}
        timeframes={timeframes}
        onTimeframeChange={handleTimeframeChange}
        activeIndicators={activeIndicators}
        onIndicatorToggle={handleIndicatorToggle}
      />

      <ChartContainer
        isLoading={isLoading}
        candles={candles}
        symbol={selectedSymbol}
        timeframe={selectedTimeframe}
        chartType={chartType}
        activeIndicators={activeIndicators}
        latestPrice={latestPrice}
        updateLatestPrice={updateLatestPrice}
      />
    </div>
  );
};

export default TradingPlatform;
