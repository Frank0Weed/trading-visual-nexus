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
  AreaChart,
  Layers,
  List
} from 'lucide-react';
import { 
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import availableIndicators, { IndicatorCategory } from '@/utils/indicators';

interface ChartToolbarProps {
  chartType: ChartType;
  onChartTypeChange: (type: ChartType) => void;
  timeframe: string;
  timeframes: TimeFrame[];
  onTimeframeChange: (timeframe: string) => void;
  className?: string;
  activeIndicators?: string[];
  onIndicatorToggle?: (indicatorId: string) => void;
}

const ChartToolbar: React.FC<ChartToolbarProps> = ({
  chartType,
  onChartTypeChange,
  timeframe,
  timeframes,
  onTimeframeChange,
  className,
  activeIndicators = [],
  onIndicatorToggle
}) => {
  // Group indicators by category - removed 'breadth' category
  const indicatorsByCategory: Record<IndicatorCategory, typeof availableIndicators> = {
    momentum: {},
    trend: {},
    volume: {},
    volatility: {}
  };
  
  Object.entries(availableIndicators).forEach(([id, indicator]) => {
    indicatorsByCategory[indicator.category][id] = indicator;
  });

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

      {/* Indicators Popover */}
      {onIndicatorToggle && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 px-3">
              <Layers className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Indicators</span>
              {activeIndicators.length > 0 && (
                <span className="ml-1 bg-primary text-primary-foreground rounded-full text-xs w-4 h-4 flex items-center justify-center">
                  {activeIndicators.length}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="start">
            <Tabs defaultValue="momentum">
              <div className="border-b px-3 py-2">
                <h3 className="text-sm font-medium">Technical Indicators</h3>
              </div>
              <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
                <TabsTrigger 
                  value="momentum" 
                  className="rounded-none border-b-2 border-transparent px-3 py-1.5 data-[state=active]:border-primary"
                >
                  Momentum
                </TabsTrigger>
                <TabsTrigger 
                  value="trend"
                  className="rounded-none border-b-2 border-transparent px-3 py-1.5 data-[state=active]:border-primary"
                >
                  Trend
                </TabsTrigger>
                <TabsTrigger 
                  value="volatility"
                  className="rounded-none border-b-2 border-transparent px-3 py-1.5 data-[state=active]:border-primary"
                >
                  Volatility
                </TabsTrigger>
              </TabsList>
              
              {/* Momentum Indicators */}
              <TabsContent value="momentum" className="p-3">
                <div className="space-y-2">
                  {Object.entries(indicatorsByCategory.momentum).map(([id, indicator]) => (
                    <div key={id} className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">{indicator.name}</h4>
                        <p className="text-xs text-muted-foreground">{indicator.description}</p>
                      </div>
                      <Button 
                        variant={activeIndicators.includes(id) ? "default" : "outline"}
                        size="sm"
                        onClick={() => onIndicatorToggle(id)}
                      >
                        {activeIndicators.includes(id) ? "Remove" : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              {/* Trend Indicators */}
              <TabsContent value="trend" className="p-3">
                <div className="space-y-2">
                  {Object.entries(indicatorsByCategory.trend).map(([id, indicator]) => (
                    <div key={id} className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">{indicator.name}</h4>
                        <p className="text-xs text-muted-foreground">{indicator.description}</p>
                      </div>
                      <Button 
                        variant={activeIndicators.includes(id) ? "default" : "outline"}
                        size="sm"
                        onClick={() => onIndicatorToggle(id)}
                      >
                        {activeIndicators.includes(id) ? "Remove" : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
              
              {/* Volatility Indicators */}
              <TabsContent value="volatility" className="p-3">
                <div className="space-y-2">
                  {Object.entries(indicatorsByCategory.volatility).map(([id, indicator]) => (
                    <div key={id} className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">{indicator.name}</h4>
                        <p className="text-xs text-muted-foreground">{indicator.description}</p>
                      </div>
                      <Button 
                        variant={activeIndicators.includes(id) ? "default" : "outline"}
                        size="sm"
                        onClick={() => onIndicatorToggle(id)}
                      >
                        {activeIndicators.includes(id) ? "Remove" : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default ChartToolbar;
