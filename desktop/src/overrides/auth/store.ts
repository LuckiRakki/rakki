// The phone app's shared modules (search index, smart queue, lyrics) read the signed-in account
// from '@/auth/store': on the desktop that's the desktop session.
export { useAuth } from '~/auth/session';
