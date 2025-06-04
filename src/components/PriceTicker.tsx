
import React, { useEffect, useState, useRef } from 'react';
import { cn } from '@/lib/utils';
import { PriceData } from '@/services/apiService';

interface PriceTickerProps {
  prices: Record<string, PriceData>;
  onSymbolSelect: (symbol: string) => void;
  selectedSymbol: string;
  className?: string;
}

const PriceTicker: React.FC<PriceTickerProps> = ({
  prices,
  onSymbolSelect,
  selectedSymbol,
  className
}) => {
  const [priceChanges, setPriceChanges] = useState<Record<string, 'up' | 'down' | null>>({});
  const prevPricesRef = useRef<Record<string, PriceData>>({});

  useEffect(() => {
    const changes: Record<string, 'up' | 'down' | null> = {};
    
    Object.keys(prices).forEach(symbol => {
      const currentPrice = prices[symbol];
      const previousPrice = prevPricesRef.current[symbol];
      
      if (previousPrice && currentPrice) {
        if (currentPrice.bid > previousPrice.bid) {
          changes[symbol] = 'up';
        } else if (currentPrice.bid < previousPrice.bid) {
          changes[symbol] = 'down';
        }
      }
    });
    
    // Only update if there are actual changes
    if (Object.keys(changes).length > 0) {
      setPriceChanges(changes);
      
      // Reset changes after animation
      const timeout = setTimeout(() => {
        setPriceChanges({});
      }, 1000);
      
      // Store current prices as previous for next comparison
      prevPricesRef.current = { ...prices };
      
      return () => clearTimeout(timeout);
    } else {
      // Still update the ref even if no visual changes
      prevPricesRef.current = { ...prices };
    }
  }, [prices]);
  
  return (
    <div className={cn('flex overflow-x-auto py-2 bg-trading-bg-dark border-b border-trading-grid', className)}>
      {Object.keys(prices).map(symbol => (
        <div 
          key={symbol}
          onClick={() => onSymbolSelect(symbol)}
          className={cn(
            'flex flex-col px-4 py-2 cursor-pointer transition-colors',
            selectedSymbol === symbol ? 'bg-blue-900/30' : 'hover:bg-blue-900/20'
          )}
        >
          <div className="font-semibold text-sm">{symbol}</div>
          <div className="flex gap-2">
            <span 
              className={cn(
                'text-sm font-mono',
                priceChanges[symbol] === 'up' ? 'text-trading-up' : '',
                priceChanges[symbol] === 'down' ? 'text-trading-down' : '',
              )}
            >
              {prices[symbol]?.bid?.toFixed(symbol.includes('XAU') ? 2 : 5)}
            </span>
            <span className="text-xs text-trading-text-secondary mt-0.5">
              {prices[symbol]?.spread?.toFixed(symbol.includes('XAU') ? 1 : 5)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PriceTicker;
