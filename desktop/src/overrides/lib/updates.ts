// The desktop app's version, for the shared Jellyfin client's "Rakki <version>" client header.
import pkg from '../../../package.json';

export function appVersion(): string {
  return pkg.version;
}
