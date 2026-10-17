import { useState } from "react";
import "./fieldnotes.css";

type IconName = "wifi" | "leaf" | "droplet" | "eye" | "info" | "arrow" | "check" | "refresh";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  if (name === "wifi") {
    return <svg {...common}><path d="M5 9.5a11 11 0 0 1 14 0" /><path d="M8 12.5a6.5 6.5 0 0 1 8 0" /><path d="M10.7 15.4a2.3 2.3 0 0 1 2.6 0" /><path d="M12 19h.01" /></svg>;
  }
  if (name === "leaf") {
    return <svg {...common}><path d="M20.4 3.7c-8.8-.6-14.7 1.5-15.8 7.5-.7 3.9 2.4 6.7 5.8 6.2 6.7-1 9.1-6.9 10-13.7Z" /><path d="M4 21c2.9-5.2 6.1-8.1 11.6-11.7" /></svg>;
  }
  if (name === "droplet") {
    return <svg {...common}><path d="M12 3.1s-6.5 7.3-6.5 11.3a6.5 6.5 0 0 0 13 0C18.5 10.4 12 3.1 12 3.1Z" /><path d="M9 15a3.1 3.1 0 0 0 3 2.2" /></svg>;
  }
  if (name === "eye") {
    return <svg {...common}><path d="M2.4 12s3.3-6 9.6-6 9.6 6 9.6 6-3.3 6-9.6 6-9.6-6-9.6-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  }
  if (name === "info") {
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>;
  }
  if (name === "arrow") {
    return <svg {...common}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
  }
  if (name === "check") {
    return <svg {...common}><path d="m5 12 4.3 4.3L19 6.8" /></svg>;
  }
  return <svg {...common}><path d="M20 11a8.1 8.1 0 0 0-14.2-5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 14.2 5L20 16" /><path d="M20 20v-4h-4" /></svg>;
}

function dateLabel(date: number) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

export default function FieldNotes() {
  const [connected, setConnected] = useState(false);
  const [moisture, setMoisture] = useState(42);
  const [wateredAt, setWateredAt] = useState(Date.now() - 2 * 86400000);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [screen, setScreen] = useState<"plant" | "connect">("plant");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const needsWater = connected && moisture < 35;
  const title = needsWater
    ? "Milo could use a drink"
    : connected && moisture >= 70
      ? "Hold off on watering"
      : connected
        ? "Milo is feeling settled"
        : "Milo is looking good";
  const careText = needsWater
    ? "The soil is on the dry side. Give Milo a slow drink, then let the pot drain."
    : connected && moisture >= 70
      ? "The soil is still moist. Let it dry a little before watering again."
      : connected
        ? "Moisture is right in Milo’s comfort zone. Come back for another look tomorrow."
        : "Your next soil check is in a few days. Milo’s doing just fine.";

  function waterMilo() {
    setWateredAt(Date.now());
    if (connected) setMoisture(48);
    setMessage("Watering noted. Milo sends a little thank-you.");
  }

  function checkSoil() {
    setCheckedAt(Date.now());
    setMessage("Soil check logged. Good looking out.");
  }

  function toggleConnection() {
    setConnected(!connected);
    setMessage(connected ? "Sensor disconnected. Your routine is still here." : "Sensor connected. Live readings are in.");
    setScreen("plant");
  }

  function refreshReading() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setMoisture((value) => value === 42 ? 39 : 42);
      setIsRefreshing(false);
      setMessage("Fresh reading, just in.");
    }, 450);
  }

  return (
    <div className="fieldnotes-shell">
      <div className="fieldnotes-paper-grain" aria-hidden="true" />
      <main className="fieldnotes-scroll">
        {screen === "plant" ? (
          <div className="fieldnotes-content">
            <header className="fn-topline">
              <div>
                <div className="fn-eyebrow"><span className="fn-eyebrow-mark" /> A little care, every day</div>
                <div className="fn-date">{dateLabel(Date.now())} <span>·</span> Milo’s journal</div>
              </div>
              <button className={`fn-connect-pill ${connected ? "is-connected" : ""}`} onClick={() => setScreen("connect")} aria-label="Open sensor connection">
                <Icon name="wifi" size={15} />
                <span>{connected ? "Sensor live" : "Connect"}</span>
              </button>
            </header>

            <h1 className="fn-title">{title}</h1>

            <section className="fn-hero" aria-label="Milo the pothos">
              <div className="fn-hero-grain" />
              <div className="fn-hero-copy">
                <div className="fn-specimen">Field note <span>04</span></div>
                <h2>Milo</h2>
                <p>A pothos with a sunny spot and a steady watering rhythm.</p>
                <div className="fn-latin">Epipremnum aureum</div>
              </div>
              <div className="fn-stamp" aria-hidden="true">GROW<br />SLOW</div>
              <img className="fn-plant-art" src="/__mockup/images/fieldnotes-milo.png" alt="Illustration of Milo, a potted pothos" />
            </section>

            <section className="fn-care-sheet">
              <div className="fn-care-head">
                <div>
                  <div className="fn-section-kicker">Entry 018 <span>·</span> today</div>
                  <h2>Today’s care</h2>
                </div>
                <div className={`fn-live-badge ${connected ? "is-live" : ""}`}>
                  <span className="fn-live-dot" />
                  {connected ? "LIVE SENSOR" : "PLANT ROUTINE"}
                </div>
              </div>
              <p className="fn-guidance">{careText}</p>
              <div className="fn-metrics">
                <div className="fn-metric">
                  <span className="fn-metric-label">{connected ? "Soil moisture" : "Last watered"}</span>
                  <strong>{connected ? `${moisture}%` : dateLabel(wateredAt)}</strong>
                </div>
                <div className="fn-metric">
                  <span className="fn-metric-label">{connected ? "Latest reading" : "Next soil check"}</span>
                  <strong>{connected ? "Just now" : checkedAt ? dateLabel(checkedAt) : "In 3 days"}</strong>
                </div>
              </div>
              <div className="fn-actions">
                <button className="fn-water-button" onClick={waterMilo}>
                  <Icon name="droplet" size={17} />
                  <span>I watered Milo</span>
                </button>
                <button className="fn-check-button" onClick={checkSoil} aria-label="I checked the soil and it is still damp">
                  <Icon name="eye" size={16} />
                  <span>Checked</span>
                </button>
              </div>
              {message && <div className="fn-feedback" role="status"><Icon name="check" size={14} />{message}</div>}
            </section>

            <aside className="fn-note">
              <div className="fn-note-icon"><Icon name="info" size={16} /></div>
              <p><strong>From the margins:</strong> Pothos like their top inch of soil to dry between drinks. When in doubt, check before you water.</p>
            </aside>
          </div>
        ) : (
          <div className="fieldnotes-content fn-connect-view">
            <header className="fn-connect-header">
              <button className="fn-back-button" onClick={() => setScreen("plant")} aria-label="Back to Milo’s plant page"><Icon name="arrow" size={17} /></button>
              <span className="fn-eyebrow"><span className="fn-eyebrow-mark" /> Optional hardware</span>
            </header>
            <div>
              <div className="fn-section-kicker">The instrument desk <span>·</span> 01</div>
              <h1 className="fn-connect-title">Bring Milo<br />online.</h1>
              <p className="fn-connect-intro">Add a small soil sensor for live readings. No sensor? Milo’s paper-and-pencil routine works beautifully, too.</p>
            </div>
            <section className="fn-device-card">
              <div className="fn-device-top">
                <div className="fn-device-icon"><Icon name="wifi" size={21} /></div>
                <div className="fn-device-copy">
                  <span className="fn-section-kicker">ESP32 · local Wi-Fi</span>
                  <h2>{connected ? "Board connected" : "No board connected"}</h2>
                </div>
                {connected && <button className={`fn-refresh ${isRefreshing ? "refreshing" : ""}`} onClick={refreshReading} aria-label="Refresh sensor reading"><Icon name="refresh" size={17} /></button>}
              </div>
              {connected ? (
                <div className="fn-reading"><strong>{moisture}<small>%</small></strong><span>Soil moisture · updated just now</span></div>
              ) : (
                <p className="fn-device-note">Your phone and board need to be on the same home Wi-Fi network.</p>
              )}
              <div className="fn-device-rule" />
              <div className="fn-setup-note">
                <span className="fn-setup-index">01—04</span>
                <p>Connect a capacitive moisture sensor to GPIO 34, upload the included starter sketch, then enter the board’s local address.</p>
              </div>
              <button className="fn-water-button fn-connect-action" onClick={toggleConnection}>
                <Icon name={connected ? "check" : "wifi"} size={17} />
                <span>{connected ? "Disconnect sensor" : "Connect sensor"}</span>
                {!connected && <Icon name="arrow" size={16} />}
              </button>
              <p className="fn-local-only">This board talks directly over your local network. Keep it off the public internet.</p>
            </section>
            <button className="fn-return-link" onClick={() => setScreen("plant")}>Back to Milo’s journal <Icon name="arrow" size={15} /></button>
          </div>
        )}
      </main>
      <nav className="fn-tabbar" aria-label="Main navigation">
        <button className={`fn-tab ${screen === "plant" ? "active" : ""}`} onClick={() => setScreen("plant")}>
          <Icon name="leaf" size={19} /><span>Plant</span>
        </button>
        <button className={`fn-tab ${screen === "connect" ? "active" : ""}`} onClick={() => setScreen("connect")}>
          <Icon name="wifi" size={18} /><span>Connect</span>
        </button>
        <div className="fn-tab-edition">VOL. 01 <span>—</span> SPRING</div>
      </nav>
    </div>
  );
}
