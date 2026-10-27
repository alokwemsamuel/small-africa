import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { useTheme } from '@/app/theme/context';

const OPTIONS = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

function ThemeIcon({ value, className }) {
  const common = {
    className: cn('size-[18px]', className),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (value === 'dark')
    return (
      <svg {...common}>
        <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
      </svg>
    );
  if (value === 'light')
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    );
  return (
    <svg {...common}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}

/** Icon button with a small Dark / Light / System menu (site header, admin top bar). */
export function ThemeMenu({ className }) {
  const { preference, resolved, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const itemRefs = useRef([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    itemRefs.current[OPTIONS.findIndex((o) => o.value === preference)]?.focus();
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !buttonRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, preference]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onMenuKey = (e) => {
    const i = itemRefs.current.findIndex((el) => el === document.activeElement);
    const move = (n) => itemRefs.current[(n + OPTIONS.length) % OPTIONS.length]?.focus();
    const actions = {
      ArrowDown: () => move(i + 1),
      ArrowUp: () => move(i - 1),
      Home: () => move(0),
      End: () => move(OPTIONS.length - 1),
      Escape: () => close(),
    };
    if (e.key === 'Tab') {
      close(false);
    } else if (actions[e.key]) {
      e.preventDefault();
      actions[e.key]();
    }
  };

  const current = OPTIONS.find((o) => o.value === preference);
  return (
    <div className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        className="border-accent/40 text-accent hover:border-accent hover:text-accent-hover grid size-10 place-items-center rounded-full border transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Appearance: ${current.label}${preference === 'system' ? ` (currently ${resolved})` : ''}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <ThemeIcon value={preference} />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Appearance"
          tabIndex={-1}
          onKeyDown={onMenuKey}
          className="border-line bg-surface-raised absolute right-0 z-50 mt-2 w-44 rounded-md border p-1.5 shadow-xl shadow-black/20"
        >
          {OPTIONS.map((o, i) => (
            <button
              key={o.value}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={preference === o.value}
              tabIndex={-1}
              onClick={() => {
                setPreference(o.value);
                close();
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-left text-sm transition-colors',
                preference === o.value ? 'text-accent' : 'text-secondary hover:text-primary',
                'hover:bg-line focus-visible:bg-line focus-visible:outline-none',
              )}
            >
              <ThemeIcon value={o.value} />
              <span className="flex-1">{o.label}</span>
              {preference === o.value && <span aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Inline three-way control (mobile menu, account page, admin settings, style guide). */
export function ThemeSegmented({ className, legend = 'Appearance' }) {
  const { preference, setPreference } = useTheme();
  const name = useId();
  return (
    <fieldset className={className}>
      <legend className="eyebrow text-muted mb-3">{legend}</legend>
      <div className="border-line bg-surface-inset inline-flex rounded-full border p-1">
        {OPTIONS.map((o) => (
          <label
            key={o.value}
            className={cn(
              'relative flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-4 text-sm transition-colors',
              'has-[:focus-visible]:outline-focus has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2',
              preference === o.value ? 'bg-accent-fill text-on-accent' : 'text-secondary hover:text-primary',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={preference === o.value}
              onChange={() => setPreference(o.value)}
              className="sr-only"
            />
            <ThemeIcon value={o.value} className="size-4" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
