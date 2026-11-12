// Settings → Lyrics (the phone app's lyrics settings, shared store).
import { useSettings } from '@/settings/store';
import { LYRICS_SIZE, useLook } from '~/settings/look';
import { Slider } from '~/ui/Slider';
import { Card, Choice, Row } from '~/settings/rows';

export function Lyrics() {
  const s = useSettings();
  const size = useLook((l) => l.lyricsSize);
  const setSize = useLook((l) => l.setLyricsSize);
  return (
    <Card>
      <Row label="Text Size" detail="The full player's lyrics, scaled to their side of the window; turn it up to fill it. Also in the full player (Aa).">
        <Slider label="Lyrics Text Size" value={size} min={LYRICS_SIZE.min} max={LYRICS_SIZE.max} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={setSize} />
      </Row>
      <Row label="Lyrics Style" detail="Spicy: word by word, as on the phone. Regular: line by line. Also switchable in the full player.">
        <Choice
          label="Lyrics Style"
          value={s.lyricsMode}
          onChange={(v) => s.set('lyricsMode', v)}
          options={[
            { value: 'spicy', label: 'Spicy' },
            { value: 'regular', label: 'Regular' },
          ]}
        />
      </Row>
    </Card>
  );
}
