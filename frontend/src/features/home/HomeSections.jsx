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
} from './sections';

/** Everything below the hero: a separate chunk, rendered after the hero has painted. */
export function HomeSections() {
  return (
    <>
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
