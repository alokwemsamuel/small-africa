import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Logo } from '@/components/ui/Logo';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { TextField } from '@/components/ui/TextField';
import { formatNaira } from '@/lib/format';

const COLORS = [
  ['obsidian', '#0E0C0A', 'Main background'],
  ['ebony', '#1A1612', 'Cards on dark'],
  ['gold', '#C9A24B', 'Primary accent'],
  ['gold-light', '#E6C97A', 'Hover, highlights'],
  ['gold-dark', '#7D5E1F', 'Gold text on light'],
  ['ivory', '#F6EFE3', 'Light sections, text'],
  ['sand', '#E7D9C4', 'Muted bg, borders'],
  ['smoke', '#8A8178', 'Secondary text (dark)'],
  ['smoke-dark', '#665D55', 'Secondary text (light)'],
  ['terracotta', '#B4492F', 'Nigerian kitchen'],
  ['crimson', '#A3243B', 'Polish kitchen'],
  ['palm', '#2E4A3B', 'Continental, success'],
] as const;

/**
 * Living style guide: the in-app source of truth for tokens and components
 * (mirrors design/brand and the Figma file). Not linked from public navigation.
 */
export function StyleGuidePage() {
  return (
    <div className="container-luxe flex flex-col gap-20 py-16">
      <header className="flex flex-col items-start gap-8 sm:flex-row sm:items-center">
        <Logo variant="mark" className="w-28" />
        <div>
          <p className="text-gold eyebrow">Design system</p>
          <h1 className="mt-2 text-5xl sm:text-6xl">Style guide</h1>
          <p className="font-script text-gold-light mt-3 text-2xl">Three kitchens. One table.</p>
        </div>
      </header>

      <Section eyebrow="01 — Foundations" title="Colour">
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {COLORS.map(([name, hex, use]) => (
            <li key={name}>
              <div className="border-gold/20 h-24 rounded-sm border" style={{ background: hex }} />
              <p className="mt-2 font-serif text-lg">{name}</p>
              <p className="text-smoke text-xs">
                {hex} · {use}
              </p>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="02 — Foundations" title="Typography">
        <div className="flex flex-col gap-5">
          <p className="font-serif text-6xl leading-none sm:text-7xl">Display: Three kitchens.</p>
          <h2 className="text-5xl">H1: From Lagos to Kraków</h2>
          <h3 className="text-4xl">H2: Signature dishes</h3>
          <h4 className="text-3xl">H3: Private dining</h4>
          <p className="font-serif text-2xl font-bold">H4: Smoky Party Jollof</p>
          <p className="text-sand max-w-2xl text-lg leading-relaxed">
            Body large: slow-cooked over firewood, finished with a whisper of smoke and served with sweet
            plantain.
          </p>
          <p className="text-sand max-w-2xl leading-relaxed">
            Body: every dish is made to order in one of our three kitchens.
          </p>
          <p className="text-gold eyebrow">Overline · Nigerian kitchen</p>
          <p className="text-gold font-semibold">{formatNaira(1850000)}</p>
          <p className="font-script text-gold-light text-3xl">Chef’s Special</p>
        </div>
      </Section>

      <Section eyebrow="03 — Components" title="Buttons & badges">
        <div className="flex flex-wrap items-center gap-4">
          <Button>Reserve a table</Button>
          <Button variant="secondary">Add to order</Button>
          <Button variant="ghost">View menu</Button>
          <Button loading>Saving</Button>
          <Button size="sm">Small</Button>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Badge kitchen="nigerian">Nigerian</Badge>
          <Badge kitchen="polish">Polish</Badge>
          <Badge kitchen="continental">Continental</Badge>
          <Badge>Chef’s pick</Badge>
        </div>
      </Section>

      <Section eyebrow="03 — Components" title="Forms & feedback">
        <div className="grid max-w-3xl gap-6 md:grid-cols-2">
          <TextField label="Email address" placeholder="you@example.com" />
          <TextField label="Email address" defaultValue="ada@" error="Enter a valid email address." />
          <div className="flex flex-col gap-3">
            <TextField label="Password" type="password" defaultValue="Jollof&Pierogi-26" revealable />
            <PasswordStrength password="Jollof&Pierogi-26" />
          </div>
          <Checkbox label="Email me menus, events and member offers" />
        </div>
        <div className="mt-8 grid max-w-3xl gap-4">
          <Alert tone="success" title="Table confirmed">
            Saturday, 8:00 pm · Party of 4 · Code SA-7K3F9Q
          </Alert>
          <Alert tone="info">You’ll earn 95 points on this order.</Alert>
          <Alert tone="error">That email and password combination didn’t work.</Alert>
        </div>
      </Section>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-gold eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-4xl">{title}</h2>
      <div className="gold-rule mt-4 mb-8" />
      {children}
    </section>
  );
}
