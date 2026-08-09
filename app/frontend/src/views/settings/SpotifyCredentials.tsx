// Authored by Karter Whitman using Claude Sonnet 5
// Spotify's Client Credentials app: the Client ID and Secret an album
// import needs to ask the Web API for a token (lib/spotify.ts). Shaped
// like the watch/exclude lists beside it — load on mount, save on
// demand, `errors.surface` on failure — but there's nothing to list or
// drag, just two fields.
import { useEffect, useState } from "react";
import { errors } from "../../store/index.js";

export function SpotifyCredentials() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.index.spotify.credentials.get().then((answer) => {
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setClientId(answer.ok.clientId);
      setClientSecret(answer.ok.clientSecret);
      setLoaded(true);
    });
  }, []);

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.spotify.credentials.save(clientId.trim(), clientSecret.trim());
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setClientId(answer.ok.clientId);
      setClientSecret(answer.ok.clientSecret);
    } finally {
      setBusy(false);
    }
  };

  const openDashboard = (): void => {
    void window.index.shell.openExternal("https://developer.spotify.com/dashboard").then((result) => {
      if ("err" in result) errors.surface(result.err);
    });
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Spotify</h3>
      <p className="settings-section-note">
        Lets pasting a Spotify album link fetch its real tracklist — a song per track, each with
        its own Spotify link. Needs a free Client ID and Secret from{" "}
        <button className="settings-link" onClick={openDashboard} type="button">
          Spotify's developer dashboard
        </button>
        .
      </p>

      <label className="settings-field">
        <span className="settings-field-label">Client ID</span>
        <input
          disabled={!loaded || busy}
          onChange={(event) => setClientId(event.target.value)}
          spellCheck={false}
          value={clientId}
        />
      </label>

      <label className="settings-field">
        <span className="settings-field-label">Client Secret</span>
        <input
          disabled={!loaded || busy}
          onChange={(event) => setClientSecret(event.target.value)}
          spellCheck={false}
          type="password"
          value={clientSecret}
        />
      </label>

      <button className="settings-save" disabled={!loaded || busy} onClick={() => void save()} type="button">
        save
      </button>
    </section>
  );
}
