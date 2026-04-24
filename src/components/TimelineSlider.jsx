const MIN_YEAR = 330;
const MAX_YEAR = 1453;

function yearToDate(year) {
  return `${String(year).padStart(4, "0")}-01-01`;
}

function dateToYear(dateValue) {
  if (!dateValue) {
    return 867;
  }
  return Number(dateValue.slice(0, 4));
}

export default function TimelineSlider({ atDate, onChange }) {
  const selectedYear = dateToYear(atDate);
  const hasSelection = Boolean(atDate);

  return (
    <section className="timeline-slider" aria-label="Timeline">
      <div className="timeline-slider__header">
        <div>
          <p>Timeline</p>
          <strong>{hasSelection ? selectedYear : "All dates"}</strong>
        </div>
        <button type="button" onClick={() => onChange(null)} disabled={!hasSelection}>
          Clear
        </button>
      </div>
      <input
        type="range"
        min={MIN_YEAR}
        max={MAX_YEAR}
        step="1"
        value={selectedYear}
        onChange={(event) => onChange(yearToDate(event.target.value))}
        aria-label="Selected year"
      />
      <div className="timeline-slider__ticks">
        <span>{MIN_YEAR}</span>
        <span>867</span>
        <span>{MAX_YEAR}</span>
      </div>
    </section>
  );
}
