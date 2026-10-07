// Source picker and Start/Stop/Pause buttons. Disabled until the replay source exists (M1).
export function Controls() {
  return (
    <section className="controls" aria-label="Controls">
      <label>
        Source
        <select disabled>
          <option>Replay from file (M1)</option>
        </select>
      </label>
      <button type="button" disabled>
        Start
      </button>
      <button type="button" disabled>
        Pause
      </button>
      <button type="button" disabled>
        Stop
      </button>
    </section>
  )
}
