import type { ComponentType } from 'react';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
  CornerUpLeft,
  CornerUpRight,
  MapPin,
  Merge,
  Undo2,
  type LucideProps,
} from 'lucide-react-native';

import type { OsrmManeuver } from '../osrm/instructions';
import { navChrome } from '../theme/navChrome';

type Props = {
  maneuver: OsrmManeuver;
  size?: number;
  color?: string;
};

type ArrowKind =
  | 'straight'
  | 'left'
  | 'right'
  | 'slightLeft'
  | 'slightRight'
  | 'sharpLeft'
  | 'sharpRight'
  | 'uturn'
  | 'roundabout'
  | 'arrive'
  | 'merge';

const KIND_ICON: Record<ArrowKind, ComponentType<LucideProps>> = {
  straight: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  slightLeft: ArrowUpLeft,
  slightRight: ArrowUpRight,
  sharpLeft: CornerUpLeft,
  sharpRight: CornerUpRight,
  uturn: Undo2,
  roundabout: CircleDot,
  arrive: MapPin,
  merge: Merge,
};

/** Lucide pictogram for the next maneuver. */
export function ManeuverIcon({
  maneuver,
  size = 28,
  color = navChrome.colors.bannerFg,
}: Props) {
  const kind = kindForManeuver(maneuver);
  const Icon = KIND_ICON[kind];
  return <Icon size={size} color={color} strokeWidth={2.75} />;
}

function kindForManeuver(maneuver: OsrmManeuver): ArrowKind {
  const { type, modifier } = maneuver;
  if (type === 'arrive') return 'arrive';
  if (type === 'roundabout' || type === 'rotary' || type.includes('roundabout')) {
    return 'roundabout';
  }
  if (type === 'merge') return 'merge';
  if (type === 'depart' || type === 'continue' || type === 'new name') {
    if (modifier?.includes('left')) return 'slightLeft';
    if (modifier?.includes('right')) return 'slightRight';
    return 'straight';
  }
  if (modifier?.includes('uturn')) return 'uturn';
  if (modifier?.includes('sharp left')) return 'sharpLeft';
  if (modifier?.includes('sharp right')) return 'sharpRight';
  if (modifier?.includes('slight left')) return 'slightLeft';
  if (modifier?.includes('slight right')) return 'slightRight';
  if (modifier?.includes('left')) return 'left';
  if (modifier?.includes('right')) return 'right';
  if (type === 'fork') {
    if (modifier?.includes('left')) return 'slightLeft';
    if (modifier?.includes('right')) return 'slightRight';
    return 'straight';
  }
  return 'straight';
}
