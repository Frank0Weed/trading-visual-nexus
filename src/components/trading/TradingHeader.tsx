
import React from 'react';
import { ReadyState } from 'react-use-websocket';
import SymbolSelector from '../SymbolSelector';

interface TradingHeaderProps {
  connectionStatus: string;
  readyState: ReadyState;
  symbols: string[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
}

const TradingHeader: React.FC<TradingHeaderProps> = ({
  connectionStatus,
  readyState,
  symbols,
  selectedSymbol,
  onSelectSymbol
}) => {
  return (
    <div className="flex items-center justify-between p-2 bg-trading-bg-dark border-b border-trading-grid">
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-bold">TradingPro</h1>
        <span 
          className={`text-xs px-2 py-0.5 rounded-full ${
            readyState === ReadyState.OPEN 
              ? 'bg-green-800/30 text-green-400' 
              : 'bg-yellow-800/30 text-yellow-400'
          }`}
        >
          {connectionStatus}
        </span>
      </div>
      <SymbolSelector
        symbols={symbols}
        selectedSymbol={selectedSymbol}
        onSelectSymbol={onSelectSymbol}
        className="h-8 text-sm"
      />
    </div>
  );
};

export default TradingHeader;
