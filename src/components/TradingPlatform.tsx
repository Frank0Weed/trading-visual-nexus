
import React, { useState, useCallback } from 'react';
import { ReadyState } from 'react-use-websocket';

import { ChartType } from './Chart';
import PriceTicker from './PriceTicker';
import ChartToolbar from './ChartToolbar';
import TradingHeader from './trading/TradingHeader';
import ChartContainer from './trading/ChartContainer';

import { useMarketInitialization } from '../hooks/useMarketInitialization';
import { useMarketDataFeed } from '../hooks/useMarketDataFeed';
import { useChartData } from '../hooks/useChartData';

const TradingPlatform: React.FC = () => {
  // State for user selections
  const [selectedSymbol, setSelectedSymbol] = useState<string>('XAUUSD');
  const [selectedTimeframe, setSelectedTimeframe] = useState<string>('M1');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [activeIndicators, setActiveIndicators] = useState<string[]>([]);

  // Initialize market data
  const { 
    symbols, 
    timeframes, 
    initialPrices, 
    isLoading: isInitializing 
  } = useMarketInitialization();

  // Subscribe to live market data via WebSocket
  const { 
    prices, 
    connectionStatus, 
    readyState 
  } = useMarketDataFeed({ 
    symbols 
  });

  // Fetch and format chart data
  const { 
    candles, 
    isLoading: isLoadingChart 
  } = useChartData({ 
    selectedSymbol, 
    selectedTimeframe, 
    chartType 
  });

  // Event handlers
  const handleSymbolSelect = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
  }, []);

  const handleTimeframeChange = useCallback((timeframe: string) => {
    setSelectedTimeframe(timeframe);
  }, []);

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

  // Combine initial prices with live updates
  const currentPrices = { ...initialPrices, ...prices };
  const isLoading = isInitializing || isLoadingChart;
  const latestPrice = currentPrices[selectedSymbol];

  return (
    <div className="flex flex-col h-full">
      {/* Header with connection status */}
      <TradingHeader
        connectionStatus={connectionStatus}
        readyState={readyState}
        symbols={symbols}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={handleSymbolSelect}
      />

      {/* Price ticker */}
      <PriceTicker
        prices={currentPrices}
        onSymbolSelect={handleSymbolSelect}
        selectedSymbol={selectedSymbol}
      />

      {/* Chart toolbar */}
      <ChartToolbar
        chartType={chartType}
        onChartTypeChange={handleChartTypeChange}
        timeframe={selectedTimeframe}
        timeframes={timeframes}
        onTimeframeChange={handleTimeframeChange}
        activeIndicators={activeIndicators}
        onIndicatorToggle={handleIndicatorToggle}
      />

      {/* Main chart */}
      <ChartContainer
        isLoading={isLoading}
        candles={candles}
        symbol={selectedSymbol}
        timeframe={selectedTimeframe}
        chartType={chartType}
        activeIndicators={activeIndicators}
        latestPrice={latestPrice}
      />
    </div>
  );
};

export default TradingPlatform;
