// Settings → Visualizer: style, colours and the live preview.
import { Visualizer } from '~/audio/Visualizer';
import { FEISHIN, presetOf, useLook, VISUALIZER_PRESETS, type VisualizerLook } from '~/settings/look';
import { Slider } from '~/ui/Slider';
import { Card, Choice, More, Row, Toggle } from '~/settings/rows';

export function VisualizerSettings() {
  const look = useLook((s) => s.visualizer);
  const set = useLook((s) => s.setVisualizer);
  const preset = presetOf(look);
  const line = look.style === 'line';
  return (
    <>
      <div className="settings-visualizer">
        <Visualizer className="settings-visualizer-graph" />
        <span className="setting-detail">Plays along with whatever Rakki plays.</span>
      </div>
      <Card>
        <Row label="Look">
          <Choice
            label="Visualizer Look"
            value={preset ?? 'custom'}
            onChange={(id) => {
              const p = VISUALIZER_PRESETS.find((x) => x.id === id);
              if (p) set(p.look);
            }}
            options={[...VISUALIZER_PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(preset ? [] : [{ value: 'custom', label: 'Yours' }])]}
          />
        </Row>
        <Row label="Colours" detail="Accent follows Lucid: the colour of what's playing.">
          <Choice
            label="Colours"
            value={look.colors}
            onChange={(colors) => set({ colors })}
            options={[
              { value: 'mono', label: 'White and Grey' },
              { value: 'accent', label: 'Accent' },
              { value: 'prism', label: 'Prism' },
              { value: 'rainbow', label: 'Rainbow' },
            ]}
          />
        </Row>
        <More>
          <Row label="Drawn As">
            <Choice
              label="Drawn As"
              value={look.style}
              onChange={(style) => set({ style })}
              options={[
                { value: 'line', label: 'Line' },
                { value: 'bars', label: 'Bars' },
              ]}
            />
          </Row>
          {line ? (
            <Row label="Line Width">
              <Slider label="Line Width" value={look.lineWidth} min={0.5} max={4} step={0.1} show={(v) => v.toFixed(1)} onChange={(lineWidth) => set({ lineWidth })} />
            </Row>
          ) : (
            <Row label="Bars" detail="How finely the sound is split.">
              <Choice<VisualizerLook['barsPerOctave']>
                label="Bars per Octave"
                value={look.barsPerOctave}
                onChange={(barsPerOctave) => set({ barsPerOctave })}
                options={[
                  { value: 1, label: 'Few' },
                  { value: 3, label: 'Some' },
                  { value: 6, label: 'Many' },
                  { value: 12, label: 'Lots' },
                  { value: 24, label: 'Most' },
                ]}
              />
            </Row>
          )}
          <Row label={line ? 'Fill Under the Line' : 'Bar Opacity'}>
            <Slider label={line ? 'Fill Under the Line' : 'Bar Opacity'} value={look.fill} min={0} max={1} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(fill) => set({ fill })} />
          </Row>
          <Row label="Reflection" detail="A faint mirror under it.">
            <Choice
              label="Reflection"
              value={look.reflection}
              onChange={(reflection) => set({ reflection })}
              options={[
                { value: 0, label: 'Off' },
                { value: 0.25, label: 'Short' },
                { value: 0.5, label: 'Half' },
              ]}
            />
          </Row>
          <Row label="Lowest Sound Shown">
            <Choice
              label="Lowest Frequency"
              value={look.minFreq}
              onChange={(minFreq) => set({ minFreq })}
              options={[
                { value: 20, label: '20 Hz' },
                { value: 40, label: '40 Hz' },
                { value: 80, label: '80 Hz' },
              ]}
            />
          </Row>
          <Row label="Highest Sound Shown">
            <Choice
              label="Highest Frequency"
              value={look.maxFreq}
              onChange={(maxFreq) => set({ maxFreq })}
              options={[
                { value: 12000, label: '12 kHz' },
                { value: 16000, label: '16 kHz' },
                { value: 22050, label: '22 kHz' },
              ]}
            />
          </Row>
          <Row label="Smoothing" detail="Higher: calmer movement.">
            <Slider label="Smoothing" value={look.smoothing} min={0} max={0.9} step={0.05} show={(v) => `${Math.round(v * 100)}%`} onChange={(smoothing) => set({ smoothing })} />
          </Row>
          <Toggle on={look.peaks} onChange={(peaks) => set({ peaks })} label="Peaks" detail="Marks that hold the highest points for a moment." />
          <div className="setting">
            <button className="secondary small" disabled={preset === 'feishin'} onClick={() => set(FEISHIN)}>
              Back to the Default Look
            </button>
          </div>
        </More>
      </Card>
    </>
  );
}
