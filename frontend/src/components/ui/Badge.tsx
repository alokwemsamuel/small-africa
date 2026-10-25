import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Kitchen = 'nigerian' | 'polish' | 'continental';

const kitchenTone: Record<Kitchen, string> = {
  nigerian: 'bg-terracotta text-ivory',
  polish: 'bg-crimson text-ivory',
  continental: 'bg-palm text-ivory',
};

export function Badge({
  kitchen,
  children,
  className,
}: {
  kitchen?: Kitchen;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'tracking-overline inline-flex items-center rounded-full px-2.5 py-1 text-[0.7rem] font-semibold uppercase',
        kitchen ? kitchenTone[kitchen] : 'border-accent/50 text-accent border',
        className,
      )}
    >
      {children}
    </span>
  );
}
