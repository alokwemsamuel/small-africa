import { formatNaira } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { LoyaltySummary, TierKey } from './api';

/**
 * The gold Interest Account membership card. Like a real metal card it looks the same in the
 * Dark and Light themes: obsidian with a foil edge in the tier's metal. All text pairs are
 * AA or better on the card colour (#15110D).
 */
const METAL: Record<TierKey, { foil: string; text: string; label: string }> = {
  bronze: { foil: 'from-[#8A5A36] via-[#D29A6A] to-[#8A5A36]', text: 'text-[#E3B48C]', label: 'Bronze' },
  silver: { foil: 'from-[#8E949B] via-[#E4E7EB] to-[#8E949B]', text: 'text-[#D9DDE2]', label: 'Silver' },
  gold: { foil: 'from-[#9C7A2C] via-[#F1D27A] to-[#9C7A2C]', text: 'text-[#E6C97A]', label: 'Gold' },
  black_diamond: {
    foil: 'from-[#5D6168] via-[#F5F5F7] to-[#5D6168]',
    text: 'text-[#F0F0F2]',
    label: 'Black Diamond',
  },
};

export function MembershipCard({ account, className }: { account: LoyaltySummary; className?: string }) {
  const metal = METAL[account.tier.key];
  const next = account.stampCard.next
    ? `${account.stampCard.next.remaining} more ${account.stampCard.next.remaining === 1 ? 'visit' : 'visits'} to a ${account.stampCard.next.reward.toLowerCase()}`
    : account.points.nextReward
      ? `${account.points.nextReward.remaining.toLocaleString('en-NG')} points to ${account.points.nextReward.name}`
      : 'Every reward is within reach';
  const since = account.member.since ? new Date(account.member.since.replace(' ', 'T')).getFullYear() : null;

  return (
    <div
      className={cn(
        'rounded-[22px] bg-gradient-to-br p-[2px] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]',
        metal.foil,
        className,
      )}
    >
      <section
        aria-label={`${metal.label} membership card for ${account.member.name}`}
        className="relative isolate flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-[20px] bg-[#15110D] p-5 text-[#F4E9D4] sm:p-7"
      >
        <img
          src={`${import.meta.env.BASE_URL}brand/pattern.svg`}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 size-full object-cover opacity-[0.07]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-1/2 -right-1/4 -z-10 size-[120%] rounded-full bg-[radial-gradient(closest-side,rgba(230,201,122,0.16),transparent)]"
        />
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}brand/small-africa-mark-gold.svg`}
              alt=""
              className="size-10 sm:size-12"
            />
            <div>
              <p className="font-serif text-lg leading-none tracking-[0.2em] sm:text-xl">SMALL AFRICA</p>
              <p className="mt-1 text-[10px] tracking-[0.25em] text-[#CDBFA8] uppercase sm:text-xs">
                Interest Account
              </p>
            </div>
          </div>
          <p
            className={cn(
              'text-right text-xs font-semibold tracking-[0.2em] uppercase sm:text-sm',
              metal.text,
            )}
          >
            {metal.label}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] tracking-[0.2em] text-[#CDBFA8] uppercase sm:text-xs">Dining credit</p>
            <p className="font-serif text-2xl sm:text-4xl">{formatNaira(account.wallet.balanceKobo)}</p>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.2em] text-[#CDBFA8] uppercase sm:text-xs">Points</p>
            <p className="font-serif text-2xl sm:text-4xl">
              {account.points.balance.toLocaleString('en-NG')}
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-[0.12em] uppercase sm:text-base">
              {account.member.name}
            </p>
            <p className="truncate text-xs text-[#CDBFA8] sm:text-sm">{next}</p>
          </div>
          {since && (
            <p className="shrink-0 text-[10px] tracking-[0.2em] text-[#CDBFA8] uppercase sm:text-xs">
              Since {since}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
