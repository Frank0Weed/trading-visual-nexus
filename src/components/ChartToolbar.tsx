
import React from 'react';
import { Button } from "@/components/ui/button";
import { 
  ToggleGroup, 
  ToggleGroupItem 
} from "@/components/ui/toggle-group";
import { ChartType } from '@/components/Chart';
import { TimeFrame } from '@/services/apiService';
import { cn } from '@/lib/utils';
import { 
  BarChart4,
  LineChart,
  CandlestickChart,
  AreaChart
} from 'lucide-react';

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
          <ToggleGroupItem value="candlestick" className="h-8 px-3 text-xs">
            <CandlestickChart className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Candles</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="line" className="h-8 px-3 text-xs">
            <LineChart className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Line</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="bar" className="h-8 px-3 text-xs">
            <BarChart4 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Bar</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="area" className="h-8 px-3 text-xs">
            <AreaChart className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Area</span>
          </ToggleGroupItem>
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
