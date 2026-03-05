
async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

function coverUrl(t) {
  if (t.cover) return "/modules/MMM-MusicTiles/covers/" + encodeURIComponent(t.cover);
  return "/modules/MMM-MusicTiles/default-cover.svg";
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

async function loadList() {
  const list = document.getElementById("list");
  list.innerHTML = "Loading…";

  const data = await fetchJson("/mm-music/api/tracks");
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];

  list.innerHTML = "";
  if (!tracks.length) {
    list.appendChild(el("div", "", "No tracks yet."));
    return;
  }

  for (const t of tracks) {
    const item = el("div", "item");

    const img = document.createElement("img");
    img.className = "thumb";
    img.src = coverUrl(t);
    img.alt = t.title || "Track";

    const meta = el("div", "meta");
    meta.appendChild(el("div", "t", t.title || "Untitled"));
    meta.appendChild(el("div", "m", t.mood || ""));
    meta.appendChild(el("div", "id", "ID: " + t.id));

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      if (!confirm("Delete this track?")) return;
      del.disabled = true;
      try {
        await fetchJson("/mmm-music/api/tracks/" + encodeURIComponent(t.id), { method: "DELETE" });
        await loadList();
      } catch (e) {
        alert("Delete failed: " + e.message);
      } finally {
        del.disabled = false;
      }
    });

    item.appendChild(img);
    item.appendChild(meta);
    item.appendChild(del);
    list.appendChild(item);
  }
}

document.getElementById("uploadForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();

  const status = document.getElementById("status");
  const btn = document.getElementById("uploadBtn");

  const title = document.getElementById("title").value;
  const mood = document.getElementById("mood").value;
  const audio = document.getElementById("audio").files[0];
  const cover = document.getElementById("cover").files[0];

  if (!audio) return;

  const fd = new FormData();
  fd.append("title", title);
  fd.append("mood", mood);
  fd.append("audio", audio);
  if (cover) fd.append("cover", cover);

  btn.disabled = true;
  status.textContent = "Uploading…";

  try {
    await fetchJson("/mmm-music/api/tracks", { method: "POST", body: fd });
    status.textContent = "Uploaded ✓";
    document.getElementById("audio").value = "";
    document.getElementById("cover").value = "";
    await loadList();
    setTimeout(() => { status.textContent = ""; }, 1500);
  } catch (e) {
    status.textContent = "Upload failed: " + e.message;
  } finally {
    btn.disabled = false;
  }
});

loadList().catch((e) => {
  const status = document.getElementById("status");
  if (status) status.textContent = "Error: " + e.message;
});
