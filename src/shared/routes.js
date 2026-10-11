/** The calibration sandbox is a separate public entry point, including mobile. */
export const isTrainingDebugPath = pathname => /^\/debug\/?$/.test(pathname || '');
