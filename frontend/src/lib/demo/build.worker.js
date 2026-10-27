/// <reference lib="webworker" />
import { buildState } from './build';
import snapshot from './snapshot.json';

/**
 * Builds today's demo database off the main thread (parsing the snapshot and generating a
 * month of orders is the heaviest part of starting the demo), then hands it to the page.
 */
self.onmessage = async () => {
  const state = await buildState(snapshot, undefined, { consume: true });
  // As JSON: parsing a string on the page is much faster than structured-cloning this object.
  self.postMessage(JSON.stringify(state));
};
