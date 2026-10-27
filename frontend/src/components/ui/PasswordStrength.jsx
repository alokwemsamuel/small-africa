import { passwordScore } from '@/lib/authSchemas';
import { cn } from '@/lib/cn';

const labels = ['Too short', 'Weak', 'Fair', 'Strong', 'Excellent'];

export function PasswordStrength({ password }) {
  const score = passwordScore(password);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors duration-300',
              i <= score ? (score >= 3 ? 'bg-accent-fill' : 'bg-terracotta') : 'bg-line',
            )}
          />
        ))}
      </div>
      <span className="text-muted w-20 text-right text-xs">{password ? labels[score] : ''}</span>
    </div>
  );
}
