import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react-native';

import { navChrome } from '../theme/navChrome';

type Props = LucideProps & {
  icon: ComponentType<LucideProps>;
  /** @default navChrome.colors.fabIcon */
  color?: string;
  /** @default 22 */
  size?: number;
};

/** Shared Lucide styling for map chrome controls. */
export function NavIcon({
  icon: Icon,
  color = navChrome.colors.fabIcon,
  size = 22,
  strokeWidth = 2.25,
  ...rest
}: Props) {
  return (
    <Icon color={color} size={size} strokeWidth={strokeWidth} {...rest} />
  );
}
