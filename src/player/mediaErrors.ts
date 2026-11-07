// Names for the bare numbers iOS puts in playback errors ("The operation couldn't be completed.
// (CoreMediaErrorDomain error 1852797029.)"). Positive codes are four letters packed into a
// number (1852797029 = 0x6E6F7065 = 'nope'); negative ones are plain error numbers. The full
// table, with what usually causes each one in Rakki, is docs/MEDIA_ERRORS.md: keep both in step.

export interface MediaErrorInfo {
  domain: string | null;
  code: number;
  /** The four letters, for codes that are four letters packed into a number. */
  fourcc: string | null;
  /** Short name, e.g. "Illegal audio operation". */
  name: string | null;
  /** What it means for the listener, as a sentence. */
  meaning: string | null;
  /** Whether converting the song on the server is likely to get it playing. */
  decode: boolean;
}

interface Known {
  name: string;
  meaning: string;
  decode?: boolean;
}

const KNOWN: Record<number, Known> = {
  // Audio decoding (AudioToolbox / CoreAudio four-letter codes)
  1852797029: { name: 'Illegal audio operation', meaning: 'iOS’s audio decoder refused this file.', decode: true }, // 'nope'
  1718449215: { name: 'Unsupported audio format', meaning: 'iOS can’t decode this audio format.', decode: true }, // 'fmt?'
  1954115647: { name: 'Unsupported file type', meaning: 'iOS doesn’t recognise this kind of file.', decode: true }, // 'typ?'
  1685348671: { name: 'Invalid audio file', meaning: 'The file looks damaged or isn’t audio.', decode: true }, // 'dta?'
  2003334207: { name: 'Audio file error', meaning: 'iOS couldn’t read this audio file.', decode: true }, // 'wht?'
  1886681407: { name: 'Unsupported audio property', meaning: 'The file uses an audio feature iOS doesn’t support.', decode: true }, // 'pty?'
  1885563711: { name: 'Bad packet offset', meaning: 'The file’s audio data is damaged.', decode: true }, // 'pck?'
  560226676: { name: 'Unsupported codec format', meaning: 'iOS’s decoder doesn’t support this codec setup.', decode: true }, // '!dat'
  1768846202: { name: 'Invalid input size', meaning: 'The audio converter got data of the wrong size.', decode: true }, // 'insz'
  2003329396: { name: 'Unspecified audio error', meaning: 'iOS’s audio system failed without saying why.' }, // 'what'
  // Audio session (AVAudioSession four-letter codes)
  560557684: { name: 'Can’t interrupt others', meaning: 'The audio session couldn’t start in the background.' }, // '!int'
  561017449: { name: 'Insufficient priority', meaning: 'Another app (a call, Siri) has the audio.' }, // '!pri'
  561015905: { name: 'Can’t start playing', meaning: 'iOS wouldn’t let audio start right now.' }, // '!pla'
  561145203: { name: 'Audio resource unavailable', meaning: 'The audio hardware is busy or unavailable.' }, // '!res'
  560030580: { name: 'Audio session busy', meaning: 'The audio session is in use.' }, // '!act'
  560161140: { name: 'Incompatible audio category', meaning: 'The audio session was set up for something else.' }, // '!cat'
  1768841571: { name: 'Audio session not active', meaning: 'Playback started before the audio session was active.' }, // 'inac'
  1836282486: { name: 'Media services failed', meaning: 'iOS’s media server restarted.' }, // 'msrv'
  // AVFoundation
  [-11800]: { name: 'Unknown AVFoundation error', meaning: 'Playback failed without a reason.' },
  [-11819]: { name: 'Media services unavailable', meaning: 'iOS’s media server restarted.' },
  [-11821]: { name: 'Decode failed', meaning: 'The song’s audio couldn’t be decoded.', decode: true },
  [-11828]: { name: 'Unrecognised format', meaning: 'iOS doesn’t recognise this file format.', decode: true },
  [-11829]: { name: 'File corrupt or unrecognised', meaning: 'The file is damaged or not in a format iOS reads.', decode: true },
  [-11833]: { name: 'Decoder not found', meaning: 'iOS has no decoder for this audio.', decode: true },
  [-11848]: { name: 'Can’t play this content', meaning: 'This iPhone can’t play the file as it is.', decode: true },
  [-11849]: { name: 'Media data couldn’t load', meaning: 'The song’s data couldn’t be loaded.' },
  [-11850]: { name: 'Server misconfigured', meaning: 'The server’s answer doesn’t support seeking (byte ranges).' },
  [-11855]: { name: 'Media data couldn’t decode', meaning: 'The song’s audio couldn’t be decoded.', decode: true },
  [-11864]: { name: 'Format unsupported', meaning: 'iOS doesn’t support this file’s format.', decode: true },
  // CoreMedia (streaming)
  [-12645]: { name: 'Media request timed out', meaning: 'The server took too long to send the song.' },
  [-12660]: { name: 'HTTP 403 Forbidden', meaning: 'The server refused the request (sign-in or permissions).' },
  [-12661]: { name: 'HTTP 503 Unavailable', meaning: 'The server was busy or down.' },
  [-12666]: { name: 'Unrecognised HTTP response', meaning: 'The server answered with an unexpected HTTP status.' },
  [-12667]: { name: 'Network error', meaning: 'The connection to the server failed.' },
  [-12847]: { name: 'Unsupported media format', meaning: 'The stream is in a format iOS can’t play.', decode: true },
  [-12848]: { name: 'Couldn’t parse moov', meaning: 'The MP4/M4A file’s index is damaged or missing.', decode: true },
  [-12889]: { name: 'Segment request timed out', meaning: 'A piece of the converted stream didn’t arrive in time.' },
  [-12903]: { name: 'Decompression error', meaning: 'The audio couldn’t be decompressed.', decode: true },
  [-12911]: { name: 'Decoder malfunction', meaning: 'iOS’s decoder failed on this audio.', decode: true },
  [-12913]: { name: 'Decoder busy', meaning: 'iOS’s decoder was temporarily unavailable.' },
  [-12937]: { name: 'Authentication error', meaning: 'The server wanted a sign-in (HTTP 401/407).' },
  [-12938]: { name: 'HTTP 404 Not Found', meaning: 'The server doesn’t have this song (moved or deleted?).' },
  [-12939]: { name: 'Byte range error', meaning: 'The server sent the wrong part of the file.' },
  [-12971]: { name: 'Unparseable segment', meaning: 'A converted stream segment wasn’t valid MPEG-TS or audio.', decode: true },
  [-16839]: { name: 'Playlist timed out', meaning: 'The converted stream’s playlist didn’t arrive in time.' },
  // NSURLError (network)
  [-1001]: { name: 'Request timed out', meaning: 'The server didn’t answer in time.' },
  [-1003]: { name: 'Host not found', meaning: 'The server’s name couldn’t be found.' },
  [-1004]: { name: 'Can’t connect to server', meaning: 'The server didn’t accept the connection.' },
  [-1005]: { name: 'Connection lost', meaning: 'The network dropped mid-song.' },
  [-1009]: { name: 'Offline', meaning: 'The phone has no internet connection.' },
  [-1011]: { name: 'Bad server response', meaning: 'The server sent something that isn’t the song.' },
  [-1100]: { name: 'File not found', meaning: 'The downloaded file is missing from the phone.' },
  [-1200]: { name: 'Secure connection failed', meaning: 'The HTTPS connection failed.' },
  [-1202]: { name: 'Untrusted certificate', meaning: 'The server’s HTTPS certificate isn’t trusted.' },
};

/** The four letters a positive code packs, or null when it isn't printable text. */
export function fourCC(code: number): string | null {
  if (!Number.isInteger(code) || code < 0x20202020 || code > 0x7e7e7e7e) return null;
  let s = '';
  for (let shift = 24; shift >= 0; shift -= 8) {
    const c = (code >>> shift) & 0xff;
    if (c < 0x20 || c > 0x7e) return null;
    s += String.fromCharCode(c);
  }
  return s;
}

/** Finds the domain and code in an iOS error message and names them, or null if there's none. */
export function decodeMediaError(message: string): MediaErrorInfo | null {
  const m = /(\w+ErrorDomain|NSOSStatusErrorDomain)?\s*error\s+(-?\d+)/i.exec(message);
  if (!m) return null;
  const code = Number(m[2]);
  const known = KNOWN[code];
  return {
    domain: m[1] ?? null,
    code,
    fourcc: fourCC(code),
    name: known?.name ?? null,
    meaning: known?.meaning ?? null,
    decode: known?.decode ?? false,
  };
}

/** A readable error line: what went wrong, then the domain, code and four letters to look up. */
export function describeMediaError(message: string, title?: string): string {
  const info = decodeMediaError(message);
  const what = title ? `Couldn’t play “${title}”` : 'Couldn’t play this song';
  if (!info) return `${what}: ${message}`;
  const ref = [info.domain, String(info.code), info.fourcc ? `'${info.fourcc}'` : null].filter(Boolean).join(' ');
  return info.meaning ? `${what}. ${info.meaning} (${info.name}, ${ref})` : `${what} (${ref}).`;
}
