// Rakki stands upright, except the music video screen, which turns with the phone. app.json
// allows every orientation (so iOS can turn at all); this keeps the other screens portrait.
import * as ScreenOrientation from 'expo-screen-orientation';

/** Every screen but the music video one. */
export function lockPortrait() {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
}

/** The music video screen: portrait or either landscape, as the phone is held (iPhone's default: never upside down). */
export function allowTurning() {
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.DEFAULT).catch(() => {});
}
