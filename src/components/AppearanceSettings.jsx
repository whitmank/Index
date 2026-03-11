// Author: Claude Code (Anthropic)
// Appearance settings panel — HSLA background controls and noise texture sliders.

import { useAppearance } from '../hooks/useAppearance';
import './AppearanceSettings.css';

function Slider({ label, value, min, max, step, onChange, display, track }) {
  return (
    <div className="appearance-slider-row">
      <span className="appearance-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="appearance-slider"
        style={track ? { '--track-bg': track } : undefined}
      />
      <span className="appearance-slider-value">{display ?? value}</span>
    </div>
  );
}

export default function AppearanceSettings() {
  const { values, update } = useAppearance();

  const hueTrack = 'linear-gradient(to right, hsl(0,80%,70%), hsl(30,80%,70%), hsl(60,80%,70%), hsl(90,80%,70%), hsl(120,80%,70%), hsl(150,80%,70%), hsl(180,80%,70%), hsl(210,80%,70%), hsl(240,80%,70%), hsl(270,80%,70%), hsl(300,80%,70%), hsl(330,80%,70%), hsl(360,80%,70%))';
  const satTrack = `linear-gradient(to right, hsl(${values.bgH},0%,${values.bgL}%), hsl(${values.bgH},100%,${values.bgL}%))`;
  const lightTrack = `linear-gradient(to right, hsl(${values.bgH},${values.bgS}%,0%), hsl(${values.bgH},${values.bgS}%,50%), hsl(${values.bgH},${values.bgS}%,100%))`;
  const alphaTrack = `linear-gradient(to right, hsla(${values.bgH},${values.bgS}%,${values.bgL}%,0), hsla(${values.bgH},${values.bgS}%,${values.bgL}%,1))`;

  return (
    <div className="appearance-settings">
      <section className="settings-section">
        <h3 className="settings-section-title">Background</h3>
        <Slider
          label="Hue"
          value={values.bgH}
          min={0} max={360} step={1}
          onChange={v => update('bgH', v)}
          display={`${values.bgH}°`}
          track={hueTrack}
        />
        <Slider
          label="Saturation"
          value={values.bgS}
          min={0} max={100} step={1}
          onChange={v => update('bgS', v)}
          display={`${values.bgS}%`}
          track={satTrack}
        />
        <Slider
          label="Lightness"
          value={values.bgL}
          min={0} max={100} step={1}
          onChange={v => update('bgL', v)}
          display={`${values.bgL}%`}
          track={lightTrack}
        />
        <Slider
          label="Opacity"
          value={values.bgA}
          min={0} max={1} step={0.01}
          onChange={v => update('bgA', v)}
          display={`${Math.round(values.bgA * 100)}%`}
          track={alphaTrack}
        />
      </section>

    </div>
  );
}
