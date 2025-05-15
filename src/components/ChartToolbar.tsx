
import React from 'react';
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ChartType } from '@/components/Chart';
import { TimeFrame } from '@/services/apiService';
import { cn } from '@/lib/utils';

interface ChartToolbarProps {
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  timeframe: string;
  timeframes: TimeFrame[];
  onTimeframeChange: (timeframe: string) => void;
  className?: string;
}

const ChartToolbar: React.FC<ChartToolbarProps> = ({
  chartType,
  onChartTypeChange,
  timeframe,
  timeframes,
  onTimeframeChange,
  className
}) => {
  return (
    <div className={cn('flex flex-wrap items-center gap-4 p-2 bg-trading-bg-dark border-b border-trading-grid', className)}>
      <div className="flex items-center">
        <span className="text-sm text-trading-text-secondary mr-2">Chart Type:</span>
        <ToggleGroup type="single" value={chartType} onValueChange={(value: string) => value && onChartTypeChange(value as ChartType)}>
          <ToggleGroupItem value="candlestick" className="h-8 px-3 text-xs">Candles</ToggleGroupItem>
          <ToggleGroupItem value="line" className="h-8 px-3 text-xs">Line</ToggleGroupItem>
          <ToggleGroupItem value="bar" className="h-8 px-3 text-xs">Bar</ToggleGroupItem>
          <ToggleGroupItem value="area" className="h-8 px-3 text-xs">Area</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center">
        <span className="text-sm text-trading-text-secondary mr-2">Timeframe:</span>
        <ToggleGroup type="single" value={timeframe} onValueChange={(value: string) => value && onTimeframeChange(value)}>
          {timeframes.map((tf) => (
            <ToggleGroupItem 
              key={tf.name} 
              value={tf.name}
              className="h-8 px-3 text-xs"
            >
              {tf.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
};

export default ChartToolbar;
