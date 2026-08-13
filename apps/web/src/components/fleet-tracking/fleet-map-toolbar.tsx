'use client';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Crosshair,
  Eye,
  EyeOff,
  Focus,
  Layers,
  LocateFixed,
  Moon,
  Navigation,
  Orbit,
  RotateCcw,
  Satellite,
  Car,
} from 'lucide-react';

export type FleetMapStyleOption = 'streets' | 'dark' | 'satellite' | 'navigation';

interface Props {
  mapStyle: FleetMapStyleOption;
  clusters: boolean;
  traffic: boolean;
  labels: boolean;
  follow: boolean;
  canFollow: boolean;
  onMapStyleChange: (style: FleetMapStyleOption) => void;
  onClustersChange: (value: boolean) => void;
  onTrafficChange: (value: boolean) => void;
  onLabelsChange: (value: boolean) => void;
  onFollowChange: (value: boolean) => void;
  onResetView: () => void;
  onLocateMe: () => void;
  onFitSelected: () => void;
  selectedCount: number;
}

export function FleetMapToolbar({
  mapStyle,
  clusters,
  traffic,
  labels,
  follow,
  canFollow,
  onMapStyleChange,
  onClustersChange,
  onTrafficChange,
  onLabelsChange,
  onFollowChange,
  onResetView,
  onLocateMe,
  onFitSelected,
  selectedCount,
}: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div
        className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-6rem)] flex-wrap gap-1 rounded-lg border border-border/70 bg-surface/95 p-1 shadow-sm backdrop-blur-sm"
        role="toolbar"
        aria-label="Map operations"
      >
        <Tool
          label="Streets"
          active={mapStyle === 'streets'}
          onClick={() => onMapStyleChange('streets')}
          icon={Layers}
        />
        <Tool
          label="Dark"
          active={mapStyle === 'dark'}
          onClick={() => onMapStyleChange('dark')}
          icon={Moon}
        />
        <Tool
          label="Satellite"
          active={mapStyle === 'satellite'}
          onClick={() => onMapStyleChange('satellite')}
          icon={Satellite}
        />
        <Tool
          label="Navigation"
          active={mapStyle === 'navigation'}
          onClick={() => onMapStyleChange('navigation')}
          icon={Navigation}
        />
        <span className="mx-0.5 w-px self-stretch bg-border/70" aria-hidden />
        <Tool
          label={clusters ? 'Clusters on' : 'Clusters off'}
          active={clusters}
          onClick={() => onClustersChange(!clusters)}
          icon={Orbit}
        />
        <Tool
          label={traffic ? 'Traffic on' : 'Traffic off'}
          active={traffic}
          onClick={() => onTrafficChange(!traffic)}
          icon={Car}
        />
        <Tool
          label={labels ? 'Map labels on' : 'Map labels off'}
          active={labels}
          onClick={() => onLabelsChange(!labels)}
          icon={labels ? Eye : EyeOff}
        />
        <Tool
          label="Follow vehicle"
          active={follow}
          disabled={!canFollow}
          onClick={() => onFollowChange(!follow)}
          icon={Crosshair}
        />
        <Tool label="Reset view" onClick={onResetView} icon={RotateCcw} />
        <Tool label="Locate me" onClick={onLocateMe} icon={LocateFixed} />
        <Tool
          label={
            selectedCount > 0
              ? `Fit selected (${selectedCount})`
              : 'Fit selected'
          }
          disabled={selectedCount === 0}
          onClick={onFitSelected}
          icon={Focus}
        />
      </div>
    </TooltipProvider>
  );
}

function Tool({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={active ? 'secondary' : 'ghost'}
          className={cn('h-8 w-8', active && 'ring-1 ring-brand/30')}
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}
