import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { DietaryTags } from '@/components/ui/DietaryTags';
import { Logo } from '@/components/ui/Logo';
import { PasswordStrength } from '@/components/ui/PasswordStrength';
import { TextField } from '@/components/ui/TextField';
import { ThemeSegmented } from '@/features/theme/ThemeSwitcher';
import { formatNaira } from '@/lib/format';

const PALETTE = [
  ['obsidian', '#0E0C0A', 'Dark surface'],
  ['ebony', '#1A1612', 'Dark raised surface'],
  ['gold', '#C9A24B', 'Accent fill (both themes)'],
  ['gold-light', '#E6C97A', 'Accent hover (dark)'],
  ['gold-dark', '#7D5E1F', 'Accent text (light)'],
  ['ivory', '#F6EFE3', 'Light surface / dark text'],
  ['sand', '#E7D9C4', 'Secondary text (dark)'],
  ['smoke', '#8A8178', 'Muted text (dark)'],
  ['smoke-dark', '#665D55', 'Muted text (light)'],
  ['terracotta', '#B4492F', 'Nigerian kitchen'],
  ['crimson', '#A3243B', 'Polish kitchen'],
  ['palm', '#2E4A3B', 'Continental, success (light)'],
];

const TOKENS = [
  ['bg-surface', 'Page background', 'obsidian', 'ivory'],
  ['bg-surface-raised', 'Cards, panels, menus', 'ebony', '#FFFBF5'],
  ['bg-surface-inset', 'Form fields', '#14110E', 'white'],
  ['text-primary', 'Headings, body', 'ivory', 'obsidian'],
  ['text-secondary', 'Supporting copy', 'sand', '#3E3731'],
  ['text-muted', 'Hints, meta', 'smoke', 'smoke-dark'],
  ['text-accent', 'Links, eyebrows, prices', 'gold', 'gold-dark'],
  ['bg-accent-fill', 'Primary buttons', 'gold', 'gold'],
  ['text-on-accent', 'Text on gold', 'obsidian', 'obsidian'],
  ['border-input', 'Field borders (3:1)', '#6F665D', '#8E8479'],
  ['border-line', 'Dividers', 'sand 14%', 'obsidian 12%'],
];

const SAMPLE_DISH = {
  spiceLevel: 0,
  isVegetarian: false,
  isGlutenFree: false,
  containsNuts: false,
  containsPork: true,
  isAlcoholic: false,
};

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
          <p className="text-accent eyebrow">Design system</p>
          <h1 className="mt-2 text-5xl sm:text-6xl">Style guide</h1>
          <p className="font-script text-accent mt-3 text-2xl">Three kitchens. One table.</p>
        </div>
      </header>

      <Section eyebrow="00 — Appearance" title="Dark, Light & System">
        <p className="text-secondary max-w-2xl leading-relaxed">
          Dark is the default. Light uses ivory surfaces with obsidian text and gold-dark accents. System
          follows the device and updates live. The choice is saved on this device and, when signed in, on the
          guest’s profile.
        </p>
        <ThemeSegmented className="mt-6" legend="Try it" />
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <ThemePanel theme="dark" />
          <ThemePanel theme="light" />
        </div>
        <div className="mt-10 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="text-muted mb-3 text-left">
              Semantic tokens: use these, never raw palette colours.
            </caption>
            <thead className="text-muted eyebrow">
              <tr className="border-line border-b">
                <th className="py-3 pr-4 font-semibold">Token</th>
                <th className="py-3 pr-4 font-semibold">Use</th>
                <th className="py-3 pr-4 font-semibold">Dark</th>
                <th className="py-3 font-semibold">Light</th>
              </tr>
            </thead>
            <tbody className="text-secondary">
              {TOKENS.map(([token, use, dark, light]) => (
                <tr key={token} className="border-line border-b">
                  <td className="text-primary py-2.5 pr-4 font-mono text-xs">{token}</td>
                  <td className="py-2.5 pr-4">{use}</td>
                  <td className="py-2.5 pr-4">{dark}</td>
                  <td className="py-2.5">{light}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section eyebrow="01 — Foundations" title="Brand palette">
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {PALETTE.map(([name, hex, use]) => (
            <li key={name}>
              <div className="border-line h-24 rounded-sm border" style={{ background: hex }} />
              <p className="mt-2 font-serif text-lg">{name}</p>
              <p className="text-muted text-xs">
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
          <p className="text-secondary max-w-2xl text-lg leading-relaxed">
            Body large: slow-cooked over firewood, finished with a whisper of smoke and served with sweet
            plantain.
          </p>
          <p className="text-secondary max-w-2xl leading-relaxed">
            Body: every dish is made to order in one of our three kitchens.
          </p>
          <p className="text-accent eyebrow">Eyebrow · Nigerian kitchen</p>
          <p className="text-accent font-semibold">{formatNaira(1850000)}</p>
          <p className="font-script text-accent text-3xl">Chef’s Special</p>
        </div>
      </Section>

      <Section eyebrow="03 — Components" title="Buttons, badges & tags">
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
        <DietaryTags
          className="mt-6"
          info={{
            spiceLevel: 2,
            isVegetarian: true,
            isGlutenFree: true,
            containsNuts: true,
            containsPork: true,
            isAlcoholic: true,
          }}
        />
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

/** A fixed-theme preview: tokens resolve from the nearest [data-theme] ancestor. */
function ThemePanel({ theme }) {
  return (
    <div data-theme={theme} className="bg-surface text-primary border-line rounded-md border p-6 sm:p-8">
      <div className="flex items-center justify-between gap-4">
        <Logo className="h-10" />
        <span className="eyebrow text-muted">{theme === 'dark' ? 'Dark' : 'Light'}</span>
      </div>
      <div className="bg-surface-raised border-line mt-6 rounded-md border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge kitchen="polish">Polish</Badge>
            <h3 className="mt-3 text-2xl">Kotlet Schabowy</h3>
          </div>
          <p className="text-accent font-semibold">{formatNaira(1900000)}</p>
        </div>
        <p className="text-secondary mt-2 text-sm leading-relaxed">
          Golden breaded pork loin, buttered dill potatoes, mizeria salad.
        </p>
        <DietaryTags className="mt-3" info={SAMPLE_DISH} />
        <p className="text-muted mt-3 text-xs">Earn 95 points</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button size="sm">Add to order</Button>
          <Button size="sm" variant="secondary">
            Details
          </Button>
        </div>
      </div>
      <TextField className="mt-6" label="Email" placeholder="you@example.com" />
      <Alert tone="error" className="mt-4">
        Enter a valid email address.
      </Alert>
    </div>
  );
}

function Section({ eyebrow, title, children }) {
  return (
    <section>
      <p className="text-accent eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-4xl">{title}</h2>
      <div className="gold-rule mt-4 mb-8" />
      {children}
    </section>
  );
}
