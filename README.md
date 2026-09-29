# Rakki

A Jellyfin music client for iPhone with a Spotify/Feishin-style UI, Finamp/Feishin features,
and Spicy Lyrics built in. React Native + Expo (TypeScript).

The plan, decisions and roadmap live in [docs/FRAMEWORK.md](docs/FRAMEWORK.md).

## Run it on your iPhone (no Mac needed)

1. Install **Expo Go** from the App Store and make sure **Tailscale** is on (phone and PC).
2. On the PC:

   ```bash
   npm install
   npm run phone
   ```

3. Scan the QR code with the iPhone camera. Rakki opens in Expo Go; edits on the PC appear
   on the phone within seconds.

## Checks

```bash
npm run typecheck
npm run lint
```

## Licence

AGPL-3.0. See [LICENSE](LICENSE).
