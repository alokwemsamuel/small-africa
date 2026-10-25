import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'error' | 'success' | 'info';

const tones: Record<Tone, string> = {
  error: 'border-danger/60 bg-danger/10 text-ivory',
  success: 'border-palm bg-palm/30 text-ivory',
  info: 'border-gold/50 bg-gold/10 text-ivory',
};
const marks: Record<Tone, string> = { error: '!', success: '✓', info: 'i' };

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-sm border px-4 py-3 text-sm leading-relaxed', tones[tone], className)}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          tone === 'error'
            ? 'bg-danger text-obsidian'
            : tone === 'success'
              ? 'bg-palm text-ivory'
              : 'bg-gold text-obsidian',
        )}
      >
        {marks[tone]}
      </span>
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}
