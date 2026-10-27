// Stand-in for the demo API in every build except the demo (see resolve.alias in vite.config.js).
// The real demo (./index.js) and its data are never bundled into the production site.
export async function installDemo() {}
export async function resetDemo() {}
