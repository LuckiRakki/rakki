// The app's first step: read Rakki's data folder (lib/kv.ts) before any of the interface loads,
// since settings are read as each part starts.
import { loadData } from '~/lib/kv';

void loadData().then(() => import('./main'));
