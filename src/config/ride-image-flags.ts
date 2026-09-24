/**
 * Ride-image feature switches — the safe on/off for the built-in ride-image picker (see the
 * "no upload" plan). Same weight as app/statisticsPreview.tsx: a small dedicated file with a
 * plain boolean, not a generic feature-flag system — this project doesn't have one and one
 * switch doesn't earn it.
 */

/** Shows/hides the "Choose ride image" gallery on Create/Edit Ride. Flip to false to pull the
 *  picker without any DB change — events that already have a rideImageKey keep rendering it
 *  either way, this only hides the PICKER. */
export const BUILT_IN_RIDE_IMAGES_ENABLED = true;

/** Shows/hides the existing (disabled, "coming soon") cover-upload stub on Create/Edit Ride.
 *  True = today's exact appearance. Flip to false once the built-in picker is approved, to
 *  remove the dead "coming soon" button from view — it does nothing functional either way, so
 *  this is cosmetic, not a rollback of working functionality. */
export const USER_RIDE_IMAGE_UPLOAD_VISIBLE = true;
