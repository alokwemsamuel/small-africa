import { cn } from '@/lib/cn';

export interface DietaryInfo {
  spiceLevel: number;
  isVegetarian: boolean;
  isGlutenFree: boolean;
  containsNuts: boolean;
  containsPork: boolean;
  isAlcoholic: boolean;
}

function Tag({ children, strong, title }: { children: React.ReactNode; strong?: boolean; title?: string }) {
  return (
    <li
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] leading-none font-semibold',
        strong ? 'border-accent text-accent' : 'border-line text-secondary',
      )}
    >
      {children}
    </li>
  );
}

/**
 * Dietary and allergen tags. "Contains pork" and "Contains nuts" are always shown when they
 * apply (strong style) because guests filter on them. Every tag is plain text, never colour alone.
 */
export function DietaryTags({
  info,
  className,
  compact,
}: {
  info: DietaryInfo;
  className?: string;
  compact?: boolean;
}) {
  const spice = Math.max(0, Math.min(3, info.spiceLevel));
  return (
    <ul className={cn('flex flex-wrap gap-1.5', className)} aria-label="Dietary information">
      {info.containsPork && (
        <Tag strong title="This dish contains pork">
          Contains pork
        </Tag>
      )}
      {info.containsNuts && (
        <Tag strong title="This dish contains nuts or peanuts">
          Contains nuts
        </Tag>
      )}
      {info.isVegetarian && <Tag>Vegetarian</Tag>}
      {info.isGlutenFree && <Tag>{compact ? 'GF' : 'Gluten-free'}</Tag>}
      {spice > 0 && (
        <Tag title={`Spice level ${spice} of 3`}>
          <span className="text-terracotta light:text-[#9a3a22] tracking-[0.15em]" aria-hidden="true">
            {'●'.repeat(spice)}
          </span>
          <span className="sr-only">Spice level {spice} of 3</span>
          {!compact && <span aria-hidden="true">{['', 'Mild', 'Medium', 'Hot'][spice]}</span>}
        </Tag>
      )}
      {info.isAlcoholic && <Tag strong>18+ only</Tag>}
    </ul>
  );
}
