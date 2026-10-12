// Station pictures are saved as files on the phone; the desktop doesn't have its own yet, so
// stations show SUB/WAVE's cover for what's on air, or the radio icon.
export const stationImagesSupported = false;

export function stationImageUri(_name: string | undefined): string | undefined {
  return undefined;
}

export async function pickStationImage(_stationId: string): Promise<string | null> {
  return null;
}

export function deleteStationImage(_name: string | undefined) {}
