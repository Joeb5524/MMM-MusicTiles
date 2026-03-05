/* MMM-MusicTiles node_helper.js */
const NodeHelper = require("node_helper");
const path = require("path");
const fs = require("fs");
const fsp = fs.promises;
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

function safeBaseName(name) {
  const base = path.basename(String(name || "")).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base || "file";
}

async function readJson(filePath, fallback) {
  try {
    const s = await fsp.readFile(filePath, "utf8");
    return JSON.parse(s);
  } catch (_) {
    return fallback;
  }
}

async function writeJsonAtomic(filePath, obj) {
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
  await fsp.rename(tmp, filePath);
}

module.exports = NodeHelper.create({
  start() {
    this.publicDir = path.join(__dirname, "public");
    this.uploadDir = path.join(this.publicDir, "uploads");
    this.coverDir = path.join(this.publicDir, "covers");
    this.dataFile = path.join(__dirname, "tracks.json");

    this._ensureDirs();

    this.tracks = [];
    this._loadTracks().then(() => this._broadcastTracks());

    this.upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          if (file.fieldname === "cover") return cb(null, this.coverDir);
          return cb(null, this.uploadDir);
        },
        filename: (req, file, cb) => {
          const ext = path.extname(file.originalname || "").toLowerCase();
          const base = safeBaseName(path.basename(file.originalname || "", ext));
          cb(null, `${uuidv4()}_${base}${ext}`);
        }
      }),
      limits: {
        fileSize: 50 * 1024 * 1024 // 50MB
      },
      fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname || "").toLowerCase();

        if (file.fieldname === "audio") {
          const ok = [".mp3", ".m4a", ".wav", ".ogg"].includes(ext);
          return cb(ok ? null : new Error("Unsupported audio type"), ok);
        }

        if (file.fieldname === "cover") {
          const ok = [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
          return cb(ok ? null : new Error("Unsupported image type"), ok);
        }

        cb(new Error("Unknown field"), false);
      }
    });

    const app = this.expressApp;
    if (!app) {
      console.log("[MMM-MusicTiles] ERROR: expressApp not available (routes not mounted)");
      return;
    }

    // Admin page
    app.get("/mmm-music", (req, res) => {
      res.sendFile(path.join(this.publicDir, "admin.html"));
    });
    app.get("/mmm-music/", (req, res) => {
      res.sendFile(path.join(this.publicDir, "admin.html"));
    });


    app.get("/mmm-music/api/tracks", async (req, res) => {
      await this._loadTracks();
      res.json({ ok: true, tracks: this.tracks });
    });

    app.post(
        "/mmm-music/api/tracks",
        this.upload.fields([{ name: "audio", maxCount: 1 }, { name: "cover", maxCount: 1 }]),
        async (req, res) => {
          try {
            const title = String((req.body && req.body.title) ? req.body.title : "").trim();
            const mood = String((req.body && req.body.mood) ? req.body.mood : "").trim();

            const audioFile =
                req.files && req.files.audio && req.files.audio[0]
                    ? req.files.audio[0].filename
                    : null;

            if (!audioFile) return res.status(400).json({ ok: false, error: "Missing audio file" });

            const coverFile =
                req.files && req.files.cover && req.files.cover[0]
                    ? req.files.cover[0].filename
                    : null;

            const track = {
              id: uuidv4(),
              title: title || "Untitled",
              mood: mood || "",
              file: audioFile,
              cover: coverFile || ""
            };

            await this._loadTracks();
            this.tracks.unshift(track);
            await this._saveTracks();

            this._broadcastTracks();
            res.json({ ok: true, track });
          } catch (e) {
            console.log("[MMM-MusicTiles] upload error:", e && e.message ? e.message : e);
            res.status(500).json({ ok: false, error: "Upload failed" });
          }
        }
    );

    app.delete("/mmm-music/api/tracks/:id", async (req, res) => {
      const id = String(req.params.id || "");
      await this._loadTracks();

      const idx = this.tracks.findIndex((t) => String(t.id) === id);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Not found" });

      const t = this.tracks[idx];
      this.tracks.splice(idx, 1);
      await this._saveTracks();

      if (t && t.file) {
        try { await fsp.unlink(path.join(this.uploadDir, safeBaseName(t.file))); } catch (_) {}
      }
      if (t && t.cover) {
        try { await fsp.unlink(path.join(this.coverDir, safeBaseName(t.cover))); } catch (_) {}
      }

      this._broadcastTracks();
      res.json({ ok: true });
    });

    console.log("[MMM-MusicTiles] started");
    console.log("[MMM-MusicTiles] routes mounted at /mmm-music");
  },

  _ensureDirs() {
    try { fs.mkdirSync(this.uploadDir, { recursive: true }); } catch (_) {}
    try { fs.mkdirSync(this.coverDir, { recursive: true }); } catch (_) {}
  },

  async _loadTracks() {
    const data = await readJson(this.dataFile, { tracks: [] });
    this.tracks = Array.isArray(data.tracks) ? data.tracks : [];
  },

  async _saveTracks() {
    await writeJsonAtomic(this.dataFile, { tracks: this.tracks });
  },

  _broadcastTracks() {
    this.sendSocketNotification("MMMT_TRACKS", { tracks: this.tracks });
  },

  socketNotificationReceived(notification) {
    if (notification === "MMMT_INIT") {
      this._broadcastTracks();
    }
  }
});