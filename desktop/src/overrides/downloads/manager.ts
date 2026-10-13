// Downloads aren't on the desktop yet. The shared lyrics offset (lyrics/offset.ts) asks this to
// save a downloaded song's lyrics again after their timing changes; there are none to save.
export async function saveLyrics(_client: unknown, _id: string): Promise<boolean> {
  return false;
}
