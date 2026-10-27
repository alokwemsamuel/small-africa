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

/**
 * Off screen, a section skips layout and painting until it is scrolled near: the home page is
 * long, and laying all of it out at once kept phones busy while the page was starting up.
 */
function Deferred({ children }) {
  return (
    <div className="[contain-intrinsic-block-size:auto_900px] [content-visibility:auto]">{children}</div>
  );
}

/** Everything below the hero: a separate chunk, rendered after the hero has painted. */
export function HomeSections() {
  return (
    <>
      <Deferred>
        <SignatureDishes />
      </Deferred>
      {/* Deferred on smaller screens only: its pinned horizontal scroll (1024px and up) can't
          sit inside containment. */}
      <div className="max-lg:[contain-intrinsic-block-size:auto_1800px] max-lg:[content-visibility:auto]">
        <ThreeKitchens />
      </div>
      <Deferred>
        <Counters />
      </Deferred>
      <Deferred>
        <ChefStory />
      </Deferred>
      <Deferred>
        <Testimonials />
      </Deferred>
      <Deferred>
        <InterestTeaser />
      </Deferred>
      <Deferred>
        <ReserveBand />
      </Deferred>
      <Deferred>
        <EventsTeaser />
      </Deferred>
      <Deferred>
        <GalleryStrip />
      </Deferred>
      <Deferred>
        <Newsletter />
      </Deferred>
    </>
  );
}
