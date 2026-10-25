import { Hero } from '@/features/home/hero/Hero';
import {
  ChefStory,
  Counters,
  EventsTeaser,
  GalleryStrip,
  InterestTeaser,
  Newsletter,
  ReserveBand,
  SignatureDishes,
  Testimonials,
  ThreeKitchens,
} from '@/features/home/sections';
import { useSeo } from '@/lib/seo';

export function HomePage() {
  useSeo({});
  return (
    <>
      <Hero />
      <SignatureDishes />
      <ThreeKitchens />
      <Counters />
      <ChefStory />
      <Testimonials />
      <InterestTeaser />
      <ReserveBand />
      <EventsTeaser />
      <GalleryStrip />
      <Newsletter />
    </>
  );
}
