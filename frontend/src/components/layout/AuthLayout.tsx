import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../ui/Logo';

/** Split-screen layout for sign-in and account flows: brand panel left, form right. */
export function AuthLayout({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-[calc(100dvh-4.5rem)] lg:grid-cols-[1fr_1.05fr]">
      <aside className="border-gold/15 bg-ebony relative hidden overflow-hidden border-r lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-16">
        <div className="bg-pattern absolute inset-0 opacity-[0.06]" aria-hidden="true" />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(201,162,75,0.16),transparent_60%)]"
          aria-hidden="true"
        />
        <div className="relative flex max-w-md flex-col items-center text-center">
          <Logo variant="mark" className="w-44" />
          <p className="font-script text-gold-light mt-10 text-3xl">Three kitchens. One table.</p>
          <div className="gold-rule my-8" />
          <p className="text-ivory font-serif text-2xl leading-snug">
            Members earn points on every visit, monthly dining credit on their wallet, and a seat at the
            chef’s table.
          </p>
          <Link to="/rewards" className="text-gold mt-6 text-sm underline-offset-4 hover:underline">
            About the Small Africa Interest Account
          </Link>
        </div>
      </aside>
      <section className="flex items-start justify-center px-4 py-12 sm:px-8 lg:items-center lg:py-16">
        <div className="w-full max-w-md">
          <Logo variant="mark" className="mx-auto mb-8 w-20 lg:hidden" />
          <p className="text-gold eyebrow">{eyebrow}</p>
          <h1 className="mt-3 text-4xl leading-tight sm:text-5xl">{title}</h1>
          {intro && <div className="text-sand mt-4 leading-relaxed">{intro}</div>}
          <div className="mt-10">{children}</div>
        </div>
      </section>
    </div>
  );
}
