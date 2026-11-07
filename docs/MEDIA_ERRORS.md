# Playback error codes (iOS)

iOS reports playback failures as a domain and a bare number, e.g.

> The operation couldn't be completed. (CoreMediaErrorDomain error 1852797029.)

This page says what those numbers mean and what usually causes them in Rakki. The phone app
names them itself since 1.24.1 (`src/player/mediaErrors.ts`, keep it in step with this page),
so the player shows e.g. *Couldn't play "Song". iOS's audio decoder refused this file.
(Illegal audio operation, CoreMediaErrorDomain 1852797029 'nope')*, and every failure is written
to the performance log as a `playError` event (song id, container, domain, code, four letters,
fallback step).

## Reading a code

- **Positive, large (> 500,000,000)**: four letters packed into a number (an `OSStatus`
  FourCC). Turn it into hex and read the bytes as ASCII:
  `1852797029` = `0x6E6F7065` = `n o p e`. In a shell:
  `python3 -c "print((1852797029).to_bytes(4,'big'))"`. The same four letters can come from
  AudioToolbox, CoreAudio or AVAudioSession; the domain is often just CoreMediaErrorDomain
  passing them on.
- **Negative, -11800 to -11899**: AVFoundation (`AVError`).
- **Negative, -12xxx and -16xxx**: CoreMedia streaming (HTTP and HLS loading, decoding).
- **Negative, -1xxx**: `NSURLError`, the network layer.

## What Rakki does on a failure

AVQueuePlayer drops a failed item and moves to the next one, which is what looked like songs
"skipping". Since 1.24.1 the phone retries the same song converted on the server
(`recoverFromError` in `src/player/store.ts`):

1. **Step 1**: AAC over HLS (`fallbackStreamUrl(id, 1)`: `/Audio/{id}/universal` with a
   direct-play list that matches no audio file, so Jellyfin always converts or remuxes).
2. **Step 2**: MP3 (`/Audio/{id}/stream.mp3`).
3. After that it stays skipped and the player shows the named error.

Seen 2026-11-07: a run of 'nope' on almost every converted (HLS) song after the app resumed
from hours paused or relaunched, while the same files played fine before. The player still
held HLS links whose conversions the server had deleted (404s for old segments in the Jellyfin
log). Since 1.24.2 a resume after 5+ minutes paused rebuilds the queue with fresh links, and
every stream link carries a new `PlaySessionId`. So 'nope' on many songs at once means stale
streams; 'nope' on one song every time means that file.

The step a song reached is remembered until the app restarts, so it plays from the working
stream straight away next time. Radio stations, offline mode and remote playback (Connect) are
not retried. Codes marked **convert** below are the ones a conversion normally fixes.

## Audio decoding (AudioToolbox / CoreAudio four-letter codes)

| Decimal | FourCC | Name | Meaning | Likely Rakki cause |
|---|---|---|---|---|
| 1852797029 | `nope` | kAudioCodecIllegalOperationError, kAudioFileStreamError_IllegalOperation, kAudioHardwareIllegalOperationError | The decoder or audio hardware refused the operation. | **convert.** A file Jellyfin offered for direct play (FLAC, ALAC, WAV, MP3, M4A) that iOS's decoder won't take: e.g. 32-bit or float FLAC/WAV, WAV "extensible" headers, more than 2 channels, odd sample rates, broken frames. Rarely a decoder hiccup after an audio interruption; the retry covers both. |
| 1718449215 | `fmt?` | kAudioFileUnsupportedDataFormatError, kAudioConverterErr_FormatNotSupported | The data format isn't supported for this file type. | **convert.** Codec inside the container isn't one iOS decodes (e.g. Opus/Vorbis in an unexpected container). |
| 1954115647 | `typ?` | kAudioFileUnsupportedFileTypeError | Unknown file type. | **convert.** Container iOS doesn't know (OGG, WMA, APE, WV) slipped through direct play, or a downloaded file saved with the wrong extension. |
| 1685348671 | `dta?` | kAudioFileInvalidFileError | File is malformed. | **convert.** Damaged file or a cut-off download. Re-download; check the file on the server. |
| 2003334207 | `wht?` | kAudioFileUnspecifiedError | Unspecified file error. | **convert.** Usually a damaged or oddly tagged file. |
| 1886681407 | `pty?` | kAudioFileUnsupportedPropertyError | Unsupported property. | **convert.** Unusual file headers. |
| 1885563711 | `pck?` | kAudioFileInvalidPacketOffsetError | Bad packet offset. | **convert.** Damaged audio data, often after a seek in a broken file. |
| 560226676 | `!dat` | kAudioCodecUnsupportedFormatError | Codec doesn't support this format. | **convert.** Same as `fmt?` at the codec level. |
| 1768846202 | `insz` | kAudioConverterErr_InvalidInputSize | Wrong input size. | **convert.** Broken frames. |
| 2003329396 | `what` | kAudioHardwareUnspecifiedError, AVAudioSessionErrorCodeUnspecified | Unspecified audio error. | Audio system trouble; try again, restart the app. |

## Audio session (AVAudioSession four-letter codes)

| Decimal | FourCC | Name | Meaning | Likely Rakki cause |
|---|---|---|---|---|
| 560557684 | `!int` | CannotInterruptOthers | A non-mixable session can't start in the background. | Play pressed from the lock screen/widget while another app held the audio. |
| 561017449 | `!pri` | InsufficientPriority | Another app has priority (a call, Siri, navigation). | Wait for the call to end; Rakki resumes after interruptions by itself. |
| 561015905 | `!pla` | CannotStartPlaying | Playback isn't allowed right now. | Session not set up yet, or started from the background without being the Now Playing app. |
| 561145203 | `!res` | ResourceNotAvailable | Audio hardware unavailable. | Route change (AirPlay, Bluetooth) at that moment. |
| 560030580 | `!act` | IsBusy | Session in use. | Deactivating the session while audio still runs. |
| 560161140 | `!cat` | IncompatibleCategory | Wrong session category. | A music video (expo-video) changed the category; `activateSession()` resets it before every play. |
| 1768841571 | `inac` | SessionNotActive | Session not active. | Play before `setActive(true)`. |
| 1836282486 | `msrv` | MediaServicesFailed | iOS's media server restarted. | System-side; the app has to rebuild its player (restart Rakki). |

## AVFoundation (AVError)

| Decimal | Name | Meaning | Likely Rakki cause |
|---|---|---|---|
| -11800 | AVErrorUnknown | Unknown error; the underlying error (often a FourCC above) is the real one. | Look for a second code in the message. |
| -11819 | MediaServicesWereReset | Media server restarted. | Restart Rakki. |
| -11821 | DecodeFailed | Media failed to decode. | **convert.** |
| -11828 | FileFormatNotRecognized | Unrecognised file format. | **convert.** Container iOS doesn't read. |
| -11829 | FailedToParse | File corrupt or unrecognised. | **convert.** Damaged file. |
| -11833 | DecoderNotFound | No decoder for this codec. | **convert.** |
| -11848 | OperationNotSupportedForAsset / content can't be played | The device can't play the content. | **convert.** |
| -11849 | MediaDataCouldNotBeLoaded (not loadable) | Data couldn't load. | Network or server trouble. |
| -11850 | ServerIncorrectlyConfigured | Server doesn't support byte-range requests. | A proxy in front of Jellyfin stripping `Range`/`Accept-Ranges`. |
| -11855 | MediaDataCouldNotBeDecoded | Data couldn't be decoded. | **convert.** |
| -11864 | AssetFormatUnsupported | Asset format unsupported. | **convert.** |

## CoreMedia streaming (CoreMediaErrorDomain negatives)

| Decimal | Meaning | Likely Rakki cause |
|---|---|---|
| -12645 | Media request timed out. | Slow server (it's under memory pressure) or weak signal. |
| -12660 | HTTP 403 Forbidden. | Token expired or the user lost access; sign in again. |
| -12661 | HTTP 503 Service Unavailable. | Jellyfin restarting or overloaded. |
| -12666 | Unrecognised HTTP response (400, 405, 500 and similar). | Jellyfin's transcoder failed; check its log for ffmpeg errors. |
| -12667 | Networking error. | Connection dropped. |
| -12847 | Unsupported media format. | **convert.** |
| -12848 | 'moov' atom couldn't be parsed. | **convert.** M4A/MP4 with the index at the end or damaged. |
| -12889 | Segment request timed out. | HLS conversion too slow on the server. |
| -12903 | Decompression error. | **convert.** |
| -12911 | Decoder malfunction. | **convert.** |
| -12913 | Decoder temporarily unavailable. | Another app or a video using the decoder; try again. |
| -12937 | Authentication error (HTTP 401/407). | Sign-in needed. |
| -12938 | HTTP 404 Not Found. | Song moved or deleted on the server; library rescan. |
| -12939 | Byte-range mismatch or server misconfiguration. | Proxy/caching layer sending the wrong part of the file. |
| -12971 | Segment isn't valid MPEG-TS or elementary stream. | **convert** (step 2, MP3). The HLS conversion produced bad segments. |
| -16839 | Playlist didn't arrive before the long download timer. | HLS conversion couldn't start in time (server busy). |
| -16840 / -16845 | HTTP 401 / other 4xx on HLS. | Sign-in or bad request. |
| -16846 to -16850 | HTTP 5xx on HLS. | Server error; check the Jellyfin log. |

## Network (NSURLErrorDomain)

| Decimal | Meaning | Likely Rakki cause |
|---|---|---|
| -1001 | Timed out. | Slow server or network. |
| -1003 | Host not found. | Server address wrong or DNS/Tailscale down. |
| -1004 | Can't connect to host. | Server or Tailscale off. |
| -1005 | Network connection lost. | Wi-Fi to cellular switch mid-song. |
| -1009 | Not connected to the internet. | Offline; only downloads play. |
| -1011 | Bad server response. | Proxy error page instead of audio. |
| -1100 | File doesn't exist. | A downloaded song's file is missing; download it again. |
| -1200 / -1202 | Secure connection failed / untrusted certificate. | HTTPS certificate problem. |

## Debugging a failure

1. Read the error line in the player, or the `playError` events in the phone's performance log
   on the server (`/config/log/upload_Rakki_*.log`, kept about 3 days).
2. `container` in the event says what Jellyfin had on disk; `step` says which stream failed
   (0 = original or direct-play choice, 1 = AAC/HLS, 2 = MP3).
3. For decode errors, check the file on the server with
   `ffprobe -hide_banner "<file>"` (sample format, bit depth, channels, sample rate).
4. Network and HTTP errors point at the server or connection, not the file.

Sources: Apple's AudioToolbox (`AudioFile.h`, `AudioCodec.h`, `AudioConverter.h`), CoreAudio
(`AudioHardwareBase.h`), `AVAudioSession` and `AVError` headers, and Bitmovin's
[iOS system error list](https://developer.bitmovin.com/playback/docs/system-error-codes-ios).
CoreMedia's negative codes are undocumented by Apple; their meanings come from that list and
long-standing developer reports.
