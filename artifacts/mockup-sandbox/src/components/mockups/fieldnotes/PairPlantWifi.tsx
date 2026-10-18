import { useState } from "react";
import "./pairplantwifi.css";

type PairStep = 1 | 2 | 3;
type ConnectionState = "waiting" | "connecting" | "connected";
type IconName = "leaf" | "wifi" | "arrow" | "check" | "lock" | "eye" | "signal" | "back";

function PairIcon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (name === "leaf") return <svg {...common}><path d="M20.4 3.7c-8.8-.6-14.7 1.5-15.8 7.5-.7 3.9 2.4 6.7 5.8 6.2 6.7-1 9.1-6.9 10-13.7Z" /><path d="M4 21c2.9-5.2 6.1-8.1 11.6-11.7" /></svg>;
  if (name === "wifi") return <svg {...common}><path d="M5 9.5a11 11 0 0 1 14 0" /><path d="M8 12.5a6.5 6.5 0 0 1 8 0" /><path d="M10.7 15.4a2.3 2.3 0 0 1 2.6 0" /><path d="M12 19h.01" /></svg>;
  if (name === "arrow") return <svg {...common}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
  if (name === "check") return <svg {...common}><path d="m5 12 4.3 4.3L19 6.8" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="4.5" y="10" width="15" height="11" rx="1.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
  if (name === "eye") return <svg {...common}><path d="M2.4 12s3.3-6 9.6-6 9.6 6 9.6 6-3.3 6-9.6 6-9.6-6-9.6-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
  if (name === "signal") return <svg {...common}><path d="M3 20h2v-3H3zM8 20h2v-7H8zM13 20h2V9h-2zM18 20h2V4h-2z" /></svg>;
  return <svg {...common}><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></svg>;
}

function isLocalAddress(address: string) {
  const match = address.trim().match(/^(?:http:\/\/)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{1,5})?$/i);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) return false;
  return octets[0] === 10 ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
}

export default function PairPlantWifi() {
  const [step, setStep] = useState<PairStep>(2);
  const [ssid, setSsid] = useState("Fernhouse_2G");
  const [password, setPassword] = useState("greenhouse24");
  const [showPassword, setShowPassword] = useState(false);
  const [address, setAddress] = useState("192.168.1.42");
  const [connection, setConnection] = useState<ConnectionState>("waiting");
  const [error, setError] = useState("");

  function continueToBoard() {
    if (!ssid.trim()) {
      setError("Add the name of your home Wi-Fi network first.");
      return;
    }
    if (password.length < 8) {
      setError("Your Wi-Fi password needs at least 8 characters.");
      return;
    }
    setError("");
    setStep(3);
  }

  function connectBoard() {
    if (!isLocalAddress(address)) {
      setError("Enter a private local address, like 192.168.1.42.");
      return;
    }
    setError("");
    setConnection("connecting");
    window.setTimeout(() => setConnection("connected"), 1350);
  }

  function retryPairing() {
    setConnection("waiting");
    setError("");
  }

  return (
    <main className="ppw-shell">
      <div className="ppw-grain" aria-hidden="true" />
      <div className="ppw-frame">
        <header className="ppw-header">
          <div className="ppw-brand">
            <span className="ppw-mark"><PairIcon name="leaf" size={16} /></span>
            <span>FIELD NOTES <i>·</i> DEVICE SETUP</span>
          </div>
          <div className="ppw-serial">MILO / 01</div>
        </header>

        <section className="ppw-intro">
          <div className="ppw-kicker"><span /> A SMALL STEP TOWARD LIVE CARE</div>
          <h1>Bring your<br /><em>sensor</em> home.</h1>
          <p>Pair Milo’s ESP32 with the same local Wi-Fi your phone uses. Your readings stay on your home network.</p>
        </section>

        <section className="ppw-journey" aria-label="Pairing progress">
          <div className="ppw-journey-rule" />
          {([
            { id: 1 as const, title: "Wire sensor", sub: "GPIO 34" },
            { id: 2 as const, title: "Home Wi-Fi", sub: "LOCAL NETWORK" },
            { id: 3 as const, title: "Find board", sub: "ESP32 ADDRESS" },
          ]).map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ppw-step ${item.id === step ? "is-current" : ""} ${item.id < step || connection === "connected" && item.id === 3 ? "is-done" : ""}`}
              onClick={() => {
                if (item.id <= 2 || step >= item.id) {
                  setStep(item.id);
                  setError("");
                }
              }}
              aria-current={item.id === step ? "step" : undefined}
              aria-label={`Step ${item.id}: ${item.title}`}
            >
              <span className="ppw-step-dot">{item.id < step ? <PairIcon name="check" size={13} /> : item.id}</span>
              <span className="ppw-step-copy"><strong>{item.title}</strong><small>{item.sub}</small></span>
            </button>
          ))}
        </section>

        <div className="ppw-main-grid">
          <section className="ppw-panel">
            {connection === "connected" ? (
              <div className="ppw-success">
                <div className="ppw-success-stamp"><PairIcon name="check" size={22} /></div>
                <div className="ppw-kicker">PAIRING COMPLETE <span className="ppw-green-dot" /></div>
                <h2>Milo is online.</h2>
                <p>Your ESP32 is talking to this device over your home network. Live soil readings are ready.</p>
                <div className="ppw-connected-details">
                  <div><span>LOCAL ADDRESS</span><strong>{address}</strong></div>
                  <div><span>CONNECTED WI-FI</span><strong>{ssid}</strong></div>
                  <div><span>SOIL MOISTURE</span><strong>42<small>%</small></strong></div>
                </div>
                <button className="ppw-primary" type="button" onClick={() => { setStep(2); retryPairing(); }}>
                  Pair another board <PairIcon name="arrow" size={16} />
                </button>
              </div>
            ) : step === 1 ? (
              <div className="ppw-step-pane">
                <div className="ppw-panel-top"><span>STEP 01 / 03</span><span>HARDWARE</span></div>
                <h2>Give the sensor<br />a place to listen.</h2>
                <p className="ppw-panel-copy">Connect the capacitive moisture probe to your ESP32. Keep the board powered while pairing.</p>
                <div className="ppw-pin-map">
                  <div className="ppw-board-mark"><span>ESP</span><strong>32</strong><i>DEV KIT</i></div>
                  <div className="ppw-wire-map">
                    <div><b className="pin-vcc" /><span>VIN</span><i>Power</i></div>
                    <div><b className="pin-gnd" /><span>GND</span><i>Ground</i></div>
                    <div><b className="pin-sig" /><span>GPIO 34</span><i>Signal</i></div>
                  </div>
                </div>
                <div className="ppw-hint"><PairIcon name="leaf" size={16} /><span>Use the capacitive probe — it’s gentler on roots than the forked metal kind.</span></div>
                <button className="ppw-primary" type="button" onClick={() => setStep(2)}>Continue to Wi-Fi <PairIcon name="arrow" size={16} /></button>
              </div>
            ) : step === 2 ? (
              <div className="ppw-step-pane">
                <div className="ppw-panel-top"><span>STEP 02 / 03</span><span>HOME NETWORK</span></div>
                <h2>Same Wi-Fi.<br />Same little world.</h2>
                <p className="ppw-panel-copy">Tell the board which network to join. Your phone and ESP32 need to share the same 2.4 GHz Wi-Fi.</p>

                <div className="ppw-network-chip">
                  <div className="ppw-network-symbol"><PairIcon name="wifi" size={18} /></div>
                  <div><span>LOCAL NETWORK</span><strong>2.4 GHz · WPA2</strong></div>
                  <span className="ppw-network-tag">HOME</span>
                </div>

                <label className="ppw-label" htmlFor="ppw-ssid">Wi-Fi network name <span>SSID</span></label>
                <input id="ppw-ssid" className="ppw-input" value={ssid} onChange={(event) => { setSsid(event.target.value); setError(""); }} autoCapitalize="none" autoCorrect="off" />
                <label className="ppw-label" htmlFor="ppw-password">Wi-Fi password <span>WPA2 KEY</span></label>
                <div className="ppw-password-wrap">
                  <PairIcon name="lock" size={15} />
                  <input id="ppw-password" className="ppw-password-input" type={showPassword ? "text" : "password"} value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} autoCapitalize="none" autoCorrect="off" />
                  <button type="button" className="ppw-reveal" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><PairIcon name="eye" size={16} /></button>
                </div>
                <div className="ppw-network-foot"><PairIcon name="signal" size={14} /><span>2.4 GHz only — ESP32 boards can’t join 5 GHz networks.</span></div>
                {error && <p className="ppw-error" role="alert">{error}</p>}
                <button className="ppw-primary" type="button" onClick={continueToBoard}>Save &amp; find board <PairIcon name="arrow" size={16} /></button>
              </div>
            ) : (
              <div className="ppw-step-pane">
                <div className="ppw-panel-top"><span>STEP 03 / 03</span><span>LOCAL CONNECTION</span></div>
                <h2>Find Milo<br />on the network.</h2>
                <p className="ppw-panel-copy">After the board joins <strong>{ssid}</strong>, find its address in Arduino IDE’s Serial Monitor and enter it here.</p>

                <div className={`ppw-status ${connection === "connecting" ? "is-searching" : ""}`}>
                  <span className="ppw-status-light" />
                  <div><strong>{connection === "connecting" ? "Looking for your ESP32" : "Waiting for your ESP32"}</strong><small>{connection === "connecting" ? "Checking local network…" : "Board not connected yet"}</small></div>
                  <span className="ppw-status-code">{connection === "connecting" ? "PAIRING" : "STANDBY"}</span>
                </div>

                <label className="ppw-label" htmlFor="ppw-address">ESP32 local address <span>PRIVATE IP</span></label>
                <input id="ppw-address" className="ppw-input ppw-ip-input" value={address} onChange={(event) => { setAddress(event.target.value); setError(""); }} inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                <div className="ppw-address-note">Look for <code>http://192.168.1.42</code> in your Serial Monitor. The address may differ on your router.</div>

                <div className="ppw-privacy"><PairIcon name="lock" size={14} /><span><strong>LOCAL ONLY</strong> — no cloud account, no public internet.</span></div>
                {error && <p className="ppw-error" role="alert">{error}</p>}
                <button className="ppw-primary" type="button" onClick={connection === "connecting" ? undefined : connectBoard} disabled={connection === "connecting"}>
                  {connection === "connecting" ? "Connecting…" : "Connect sensor"}
                  {connection === "connecting" ? <span className="ppw-button-loader" /> : <PairIcon name="wifi" size={16} />}
                </button>
                {connection === "waiting" && <button className="ppw-text-button" type="button" onClick={retryPairing}>Board not showing up? Try again</button>}
              </div>
            )}
          </section>

          <aside className="ppw-aside">
            <div className="ppw-aside-art">
              <div className="ppw-orbit ppw-orbit-one" />
              <div className="ppw-orbit ppw-orbit-two" />
              <div className="ppw-plant-pot"><span /><span /><span /><i /></div>
              <div className="ppw-aside-caption">FIELD NOTE <b>018</b><br />A quieter kind of signal.</div>
              <div className="ppw-aside-stamp"><PairIcon name="leaf" size={15} /><span>GROW<br />SLOW</span></div>
            </div>
            <div className="ppw-aside-note">
              <span className="ppw-aside-index">GOOD TO KNOW / 01</span>
              <p>Your phone and the ESP32 need to be on the same Wi-Fi to see live readings. Cellular data won’t reach a local board.</p>
              <div><span className={`ppw-connection-dot ${connection === "connected" ? "is-connected" : connection === "connecting" ? "is-pulsing" : ""}`} /><strong>{connection === "connected" ? "SENSOR CONNECTED" : connection === "connecting" ? "PAIRING IN PROGRESS" : "SENSOR NOT CONNECTED"}</strong></div>
            </div>
          </aside>
        </div>

        <footer className="ppw-footer">
          <button type="button" className="ppw-back" onClick={() => { setStep(step === 3 ? 2 : 1); setError(""); }} disabled={step === 1 || connection === "connected"}><PairIcon name="back" size={15} /> Back</button>
          <span>YOUR PLANT, YOUR NETWORK <i>·</i> EST. ALWAYS</span>
          <span className="ppw-footer-page">0{step} <i>/</i> 03</span>
        </footer>
      </div>
    </main>
  );
}
