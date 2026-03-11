/* global Module */

Module.register("MMM-MusicTiles", {
  defaults: {
    title: "Music",
    maxTiles: 3,
    showTitle: false,
    tileSizePx: 220,
    autoStopOnScreenChange: false,
    screenName: "music"
  },

  start() {
    this.tracks = [];
    this.activeId = null;

    this.audio = new Audio();
    this.audio.preload = "none";
    this.audio.volume = (typeof this.config.defaultVolume === "number")
        ? Math.max(0, Math.min(1, this.config.defaultVolume))
        : 0.7;

    this.audio.addEventListener("ended", () => {
      this.activeId = null;
      this.updateDom(0);
    });

    this.audio.addEventListener("pause", () => {
      this.updateDom(0);
    });

    this.audio.addEventListener("play", () => {
      this.updateDom(0);
    });

    this.sendSocketNotification("MMMT_INIT", {});
  },

  getStyles() {
    return ["MMM-MusicTiles.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "MMMT_TRACKS") {
      this.tracks = Array.isArray(payload && payload.tracks) ? payload.tracks : [];
      this.updateDom(0);
    }
  },

  notificationReceived(notification, payload) {
    if (notification === "MUSIC_PLAY_TRACK") {
      if (payload && payload.id) this._playById(String(payload.id));
      return;
    }

    if (notification === "MUSIC_PLAY_QUERY") {
      const q = String(payload && (payload.query || payload.text || "")).trim().toLowerCase();
      if (q) this._playByQuery(q);
      return;
    }

    if (notification === "MUSIC_STOP") {
      this._stop();
      return;
    }

    if (notification === "MUSIC_SET_VOLUME") {
      const v = Number(payload && payload.level);
      if (Number.isFinite(v)) {
        this.audio.volume = Math.max(0, Math.min(1, v));
      }
      return;
    }

    if (this.config.autoStopOnScreenChange && (notification === "ASSIST_SCREEN_SET" || notification === "ASSIST_SCREEN_CHANGED")) {
      const screen = String(payload && payload.screen ? payload.screen : "");
      if (screen && screen !== this.config.screenName) this._stop();
    }
  },

  _trackUrl(t) {
    if (!t || !t.file) return "";
    return `/modules/MMM-MusicTiles/public/uploads/${encodeURIComponent(t.file)}`;
  },

  _coverUrl(t) {
    if (t && t.cover) return `/modules/MMM-MusicTiles/public/covers/${encodeURIComponent(t.cover)}`;
    return `/modules/MMM-MusicTiles/public/default-cover.svg`;
  },

  _playById(id) {
    const t = this.tracks.find((x) => String(x.id) === String(id));
    if (!t) return;

    if (this.activeId === id) {
      if (this.audio.paused) {
        this.audio.play().catch(() => {});
      } else {
        this.audio.pause();
      }
      return;
    }

    this.activeId = id;
    this.audio.src = this._trackUrl(t);
    this.audio.play().catch(() => {
      this.updateDom(0);
    });

    this.updateDom(0);
  },

  _playByQuery(q) {
    const norm = (x) => String(x || "").toLowerCase();

    let t = this.tracks.find((x) => norm(x.mood) === q);
    if (!t) t = this.tracks.find((x) => norm(x.title) === q);
    if (!t) t = this.tracks.find((x) => norm(x.title).includes(q));
    if (!t) t = this.tracks.find((x) => norm(x.mood).includes(q));

    if (t && t.id) this._playById(String(t.id));
  },

  _stop() {
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch (_) {}
    this.activeId = null;
    this.updateDom(0);
  },

  getDom() {
    const root = document.createElement("div");
    root.className = "mmmt-root";

    if (this.config.showTitle && this.config.title) {
      const h = document.createElement("div");
      h.className = "mmmt-title";
      h.textContent = this.config.title;
      root.appendChild(h);
    }

    const grid = document.createElement("div");
    grid.className = "mmmt-grid";
    grid.style.setProperty("--mmmt-tile-size", `${Number(this.config.tileSizePx || 220)}px`);

    const visible = (this.tracks || []).slice(0, Number(this.config.maxTiles || 6));

    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "mmmt-empty";
      empty.textContent = "No music added yet";
      root.appendChild(empty);
      return root;
    }

    for (const t of visible) {
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "mmmt-tile";
      tile.setAttribute("aria-label", t.title || "Track");

      if (String(t.id) === String(this.activeId)) tile.classList.add("is-active");
      if (String(t.id) === String(this.activeId) && !this.audio.paused) tile.classList.add("is-playing");
      if (String(t.id) === String(this.activeId) && this.audio.paused) tile.classList.add("is-paused");

      tile.addEventListener("click", () => this._playById(String(t.id)));

      const img = document.createElement("img");
      img.className = "mmmt-cover";
      img.src = this._coverUrl(t);
      img.alt = t.title || "Track";

      const meta = document.createElement("div");
      meta.className = "mmmt-meta";

      const title = document.createElement("div");
      title.className = "mmmt-track-title";
      title.textContent = t.title || "Untitled";

      const sub = document.createElement("div");
      sub.className = "mmmt-track-sub";
      const mood = t.mood ? String(t.mood) : "";
      sub.textContent = mood;

      meta.appendChild(title);
      meta.appendChild(sub);

      tile.appendChild(img);
      tile.appendChild(meta);

      grid.appendChild(tile);
    }

    root.appendChild(grid);

    if (this.activeId) {
      const t = this.tracks.find((x) => String(x.id) === String(this.activeId));
      const np = document.createElement("div");
      np.className = "mmmt-now";
      np.textContent = (t && t.title) ? `Now: ${t.title}${this.audio.paused ? " (paused)" : ""}` : "";
      root.appendChild(np);
    }

    return root;
  }
});