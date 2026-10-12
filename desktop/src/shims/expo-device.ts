// What the shared Jellyfin client asks expo-device for: the name Jellyfin shows for this
// session (Dashboard → Devices, "Playing on ...").
const platform = navigator.userAgent.includes('Windows') ? 'Windows' : navigator.userAgent.includes('Linux') ? 'Linux' : 'Desktop';

export const deviceName: string | null = `Rakki on ${platform}`;
export const modelName: string | null = null;
