
import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { ChevronDown, Search } from "lucide-react";

interface SymbolSelectorProps {
  symbols: string[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  className?: string;
}

const SymbolSelector: React.FC<SymbolSelectorProps> = ({
  symbols,
  selectedSymbol,
  onSelectSymbol,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when popover opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const filteredSymbols = symbols.filter(symbol =>
    symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={cn(
            "bg-secondary text-secondary-foreground border-trading-grid hover:bg-secondary/90 flex gap-2 items-center",
            className
          )}
        >
          {selectedSymbol}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 bg-trading-bg-dark border-trading-grid">
        <div className="p-2 border-b border-trading-grid">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-trading-text-secondary" />
            <Input
              ref={inputRef}
              placeholder="Search symbols..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 bg-secondary border-trading-grid"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-auto">
          {filteredSymbols.length > 0 ? (
            filteredSymbols.map(symbol => (
              <button
                key={symbol}
                className={cn(
                  "w-full text-left px-3 py-2 hover:bg-blue-900/20",
                  selectedSymbol === symbol && "bg-blue-900/30"
                )}
                onClick={() => {
                  onSelectSymbol(symbol);
                  setIsOpen(false);
                  setSearchTerm('');
                }}
              >
                {symbol}
              </button>
            ))
          ) : (
            <div className="p-2 text-sm text-trading-text-secondary text-center">
              No symbols found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default SymbolSelector;
