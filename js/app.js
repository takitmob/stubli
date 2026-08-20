/* ==========================================================================
   Parcours annuel — Croissance chrétienne
   App entièrement statique (aucun build). Stockage local + sync GitHub optionnelle.
   ========================================================================== */

const STORAGE_KEY = "pacc_state_v1";
const SETTINGS_KEY = "pacc_settings_v1";
const SEED_URL = "data/seed.json";

const DIMENSIONS = [
  { key: "comprehension", label: "Compréhension" },
  { key: "application", label: "Application" },
  { key: "memorisation", label: "Mémorisation" },
  { key: "priere", label: "Prière" },
  { key: "transmission", label: "Transmission" },
];

let state = {
  weeks: [],
  updatedAt: null,
};

let settings = {
  owner: "",
  repo: "",
  branch: "main",
  path: "data/progress.json",
  token: "",
  connected: false,
  autoSync: false,
  sha: null,
};

let ghSaveTimer = null;

/* ==========================================================================
   Boot
   ========================================================================== */
async function boot() {
  loadSettings();
  await loadState();
  bindNav();
  bindSettingsForm();
  bindModal();
  bindExportImport();
  bindFilters();
  renderAll();

  if (settings.connected && settings.token) {
    ghPull({ silent: true });
  }
}

document.addEventListener("DOMContentLoaded", boot);

/* ==========================================================================
   State persistence (local)
   ========================================================================== */
async function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      state = JSON.parse(raw);
      return;
    } catch (e) {
      console.warn("État local corrompu, rechargement du modèle de base.", e);
    }
  }
  const res = await fetch(SEED_URL);
  const seed = await res.json();
  state = { weeks: seed, updatedAt: null };
  persistLocal();
}

function persistLocal() {
  state.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (raw) {
    try {
      settings = { ...settings, ...JSON.parse(raw) };
    } catch (e) {
      /* ignore */
    }
  }
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function onDataChanged() {
  persistLocal();
  renderAll();
  if (settings.connected && settings.autoSync) {
    clearTimeout(ghSaveTimer);
    ghSaveTimer = setTimeout(() => ghPush({ silent: true }), 2500);
  }
}

/* ==========================================================================
   Navigation
   ========================================================================== */
function bindNav() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
    });
  });
}

/* ==========================================================================
   Derived data helpers
   ========================================================================== */
function weekTotal(w) {
  return DIMENSIONS.reduce((sum, d) => sum + (w[d.key] || 0), 0);
}

function weekStatus(w) {
  const allScored = DIMENSIONS.every((d) => (w[d.key] || 0) > 0);
  const anyScored = DIMENSIONS.some((d) => (w[d.key] || 0) > 0);
  const hasNotes = w.notes || w.applicationConcrete || w.versetMemorise || w.questionRestante;
  if (w.lectureFaite && allScored) return "done";
  if (w.lectureFaite || anyScored || hasNotes) return "progress";
  return "todo";
}

function statusLabel(s) {
  return { done: "Terminée", progress: "En cours", todo: "À faire" }[s];
}

function monthKey(w) {
  return w.mois;
}

function groupByMonth(weeks) {
  const order = [];
  const map = {};
  weeks.forEach((w) => {
    const k = monthKey(w);
    if (!map[k]) {
      map[k] = [];
      order.push(k);
    }
    map[k].push(w);
  });
  return order.map((k) => ({ key: k, weeks: map[k] }));
}

/* ==========================================================================
   Render: everything
   ========================================================================== */
function renderAll() {
  renderDashboard();
  renderPath();
  renderSettingsForm();
  updateSyncStatus();
}

/* ==========================================================================
   Render: dashboard
   ========================================================================== */
function renderDashboard() {
  const weeks = state.weeks;
  const statuses = weeks.map(weekStatus);
  const done = statuses.filter((s) => s === "done").length;
  const progress = statuses.filter((s) => s === "progress").length;
  const todo = statuses.filter((s) => s === "todo").length;
  const pct = Math.round((done / weeks.length) * 100) || 0;

  const statGrid = document.getElementById("statGrid");
  statGrid.innerHTML = `
    ${statCard("Progression annuelle", pct + "%", "accent-gold", "an")}
    ${statCard("Semaines terminées", done, "accent-sage", "fait")}
    ${statCard("Semaines en cours", progress, "", "cours")}
    ${statCard("Semaines à faire", todo, "accent-clay", "reste")}
  `;

  // Monthly breakdown
  const groups = groupByMonth(weeks);
  const monthBars = document.getElementById("monthBars");
  monthBars.innerHTML = groups
    .map((g) => {
      const gDone = g.weeks.filter((w) => weekStatus(w) === "done").length;
      const gPct = Math.round((gDone / g.weeks.length) * 100);
      return `
        <div class="month-bar-row">
          <span class="month-bar-label">${g.key}</span>
          <div class="month-bar-track"><div class="month-bar-fill" style="width:${gPct}%"></div></div>
          <span class="month-bar-value">${gDone}/${g.weeks.length}</span>
        </div>`;
    })
    .join("");

  // Averages per dimension
  const avgBars = document.getElementById("avgBars");
  avgBars.innerHTML = DIMENSIONS.map((d) => {
    const scored = weeks.filter((w) => (w[d.key] || 0) > 0);
    const avg = scored.length ? scored.reduce((s, w) => s + w[d.key], 0) / scored.length : 0;
    const pctW = (avg / 5) * 100;
    return `
      <div class="avg-row">
        <span class="avg-label">${d.label}</span>
        <div class="avg-track"><div class="avg-fill" style="width:${pctW}%"></div></div>
        <span class="avg-value">${avg ? avg.toFixed(1) : "—"}/5</span>
      </div>`;
  }).join("");
}

function statCard(label, value, accent, eyebrow) {
  return `
    <div class="stat-card ${accent}" data-eyebrow="${eyebrow}">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

/* ==========================================================================
   Render: the path (sentier)
   ========================================================================== */
let currentSearch = "";
let currentFilter = "all";

function bindFilters() {
  document.getElementById("searchInput").addEventListener("input", (e) => {
    currentSearch = e.target.value.trim().toLowerCase();
    renderPath();
  });
  document.getElementById("filterStatus").addEventListener("change", (e) => {
    currentFilter = e.target.value;
    renderPath();
  });
}

function renderPath() {
  const container = document.getElementById("pathContainer");
  const groups = groupByMonth(state.weeks);

  const html = groups
    .map((g) => {
      const visibleWeeks = g.weeks.filter((w) => matchesFilters(w));
      if (visibleWeeks.length === 0) return "";

      const gDone = g.weeks.filter((w) => weekStatus(w) === "done").length;
      const numMatch = g.key.match(/\d+/);
      const ghostLabel = numMatch ? numMatch[0] : "✦";
      const monthTitle = g.key === "Bilan" ? "Bilan de fin de parcours" : "Mois " + (numMatch ? numMatch[0] : g.key);

      return `
        <div class="month-chapter">
          <div class="month-chapter-header">
            <span class="month-ghost">${ghostLabel}</span>
            <span class="month-title">${monthTitle}</span>
            <span class="month-progress-text">${gDone}/${g.weeks.length} terminées</span>
          </div>
          <div class="week-grid">
            ${visibleWeeks.map(weekCardHtml).join("")}
          </div>
        </div>`;
    })
    .join("");

  container.innerHTML = html || `<p class="help-text" style="margin-top:24px;">Aucune semaine ne correspond à ta recherche.</p>`;

  container.querySelectorAll("[data-week]").forEach((card) => {
    card.addEventListener("click", () => openWeekModal(Number(card.dataset.week)));
  });
}

function matchesFilters(w) {
  const status = weekStatus(w);
  if (currentFilter !== "all" && status !== currentFilter) return false;
  if (currentSearch) {
    const hay = (w.theme + " " + w.passages + " " + w.objectif).toLowerCase();
    if (!hay.includes(currentSearch)) return false;
  }
  return true;
}

function weekCardHtml(w) {
  const status = weekStatus(w);
  const total = weekTotal(w);
  const pct = Math.round((total / 25) * 100);
  return `
    <div class="week-card status-${status}" data-week="${w.semaine}" tabindex="0">
      <div class="week-ring" style="--pct:${pct}">
        <div class="week-ring-inner">${w.semaine}</div>
      </div>
      <div class="week-card-body">
        <div class="week-card-num">Semaine ${w.semaine} · ${statusLabel(status)}</div>
        <div class="week-card-theme">${escapeHtml(w.theme)}</div>
        <div class="week-card-passages">${escapeHtml(w.passages)}</div>
      </div>
    </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* ==========================================================================
   Modal: week detail + fiche d'étude
   ========================================================================== */
function bindModal() {
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
}

function openWeekModal(semaine) {
  const w = state.weeks.find((x) => x.semaine === semaine);
  if (!w) return;

  const body = document.getElementById("modalBody");
  body.innerHTML = `
    <div class="modal-eyebrow">Semaine ${w.semaine} · ${w.mois}</div>
    <h2>${escapeHtml(w.theme)}</h2>
    <p class="modal-objectif">${escapeHtml(w.objectif)}</p>
    <p class="modal-passages">${escapeHtml(w.passages)}</p>

    <div class="lecture-toggle">
      <button class="btn ${w.lectureFaite ? "primary" : ""}" id="btnLecture">
        ${w.lectureFaite ? "✓ Lecture faite" : "Marquer la lecture comme faite"}
      </button>
      <span class="total-badge" id="totalBadge">Total : ${weekTotal(w)}/25</span>
    </div>

    <div class="modal-section-title">Évaluation de la semaine</div>
    <div class="score-grid" id="scoreGrid"></div>

    <div class="modal-section-title">Notes</div>
    <div class="fiche-grid">
      <div class="field">
        <label>Notes / découvertes</label>
        <textarea data-field="notes">${escapeHtml(w.notes)}</textarea>
      </div>
      <div class="two-col">
        <div class="field">
          <label>Application concrète</label>
          <textarea data-field="applicationConcrete">${escapeHtml(w.applicationConcrete)}</textarea>
        </div>
        <div class="field">
          <label>Verset mémorisé</label>
          <textarea data-field="versetMemorise">${escapeHtml(w.versetMemorise)}</textarea>
        </div>
      </div>
      <div class="field">
        <label>Question restante</label>
        <textarea data-field="questionRestante">${escapeHtml(w.questionRestante)}</textarea>
      </div>
    </div>

    <div class="modal-section-title">Fiche d'étude complète</div>
    <div class="fiche-grid">
      <div class="field">
        <label>Question centrale</label>
        <textarea data-fiche="questionCentrale">${escapeHtml(w.fiche.questionCentrale)}</textarea>
      </div>
      <div class="two-col">
        <div class="field">
          <label>Observation <span class="field-hint">(qui, à qui, où, quand, pourquoi…)</span></label>
          <textarea data-fiche="observation">${escapeHtml(w.fiche.observation)}</textarea>
        </div>
        <div class="field">
          <label>Contexte <span class="field-hint">(historique, culturel, littéraire)</span></label>
          <textarea data-fiche="contexte">${escapeHtml(w.fiche.contexte)}</textarea>
        </div>
      </div>
      <div class="field">
        <label>Interprétation</label>
        <textarea data-fiche="interpretation">${escapeHtml(w.fiche.interpretation)}</textarea>
      </div>
      <div class="field">
        <label>Connexions bibliques <span class="field-hint">(3 à 5 autres passages)</span></label>
        <textarea data-fiche="connexionsBibliques">${escapeHtml(w.fiche.connexionsBibliques)}</textarea>
      </div>
      <div class="two-col">
        <div class="field">
          <label>Ce que j'apprends sur Dieu</label>
          <textarea data-fiche="surDieu">${escapeHtml(w.fiche.surDieu)}</textarea>
        </div>
        <div class="field">
          <label>Ce que j'apprends sur l'humain</label>
          <textarea data-fiche="surHumain">${escapeHtml(w.fiche.surHumain)}</textarea>
        </div>
      </div>
      <div class="two-col">
        <div class="field">
          <label>Ce que j'apprends sur Jésus-Christ</label>
          <textarea data-fiche="surJesus">${escapeHtml(w.fiche.surJesus)}</textarea>
        </div>
        <div class="field">
          <label>Ce que cela révèle de ma vie</label>
          <textarea data-fiche="surMaVie">${escapeHtml(w.fiche.surMaVie)}</textarea>
        </div>
      </div>
      <div class="two-col">
        <div class="field">
          <label>À croire</label>
          <textarea data-fiche="aCroire">${escapeHtml(w.fiche.aCroire)}</textarea>
        </div>
        <div class="field">
          <label>À changer</label>
          <textarea data-fiche="aChanger">${escapeHtml(w.fiche.aChanger)}</textarea>
        </div>
      </div>
      <div class="two-col">
        <div class="field">
          <label>À pratiquer</label>
          <textarea data-fiche="aPratiquer">${escapeHtml(w.fiche.aPratiquer)}</textarea>
        </div>
        <div class="field">
          <label>À éviter</label>
          <textarea data-fiche="aEviter">${escapeHtml(w.fiche.aEviter)}</textarea>
        </div>
      </div>
      <div class="field">
        <label>À transmettre</label>
        <textarea data-fiche="aTransmettre">${escapeHtml(w.fiche.aTransmettre)}</textarea>
      </div>
      <div class="field">
        <label>Verset à mémoriser</label>
        <textarea data-fiche="versetAMemoriser">${escapeHtml(w.fiche.versetAMemoriser)}</textarea>
      </div>
      <div class="field">
        <label>Prière</label>
        <textarea data-fiche="priere">${escapeHtml(w.fiche.priere)}</textarea>
      </div>
      <div class="field">
        <label>Question restante (fiche)</label>
        <textarea data-fiche="questionRestante">${escapeHtml(w.fiche.questionRestante)}</textarea>
      </div>
    </div>
  `;

  renderScoreGrid(w);

  document.getElementById("btnLecture").addEventListener("click", () => {
    w.lectureFaite = !w.lectureFaite;
    onDataChanged();
    openWeekModal(semaine);
  });

  body.querySelectorAll("textarea[data-field]").forEach((ta) => {
    ta.addEventListener("change", () => {
      w[ta.dataset.field] = ta.value;
      onDataChanged();
    });
  });

  body.querySelectorAll("textarea[data-fiche]").forEach((ta) => {
    ta.addEventListener("change", () => {
      w.fiche[ta.dataset.fiche] = ta.value;
      onDataChanged();
    });
  });

  document.getElementById("modalBackdrop").classList.add("open");
}

function renderScoreGrid(w) {
  const grid = document.getElementById("scoreGrid");
  grid.innerHTML = DIMENSIONS.map((d) => {
    const val = w[d.key] || 0;
    const stars = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<button class="star-btn ${n <= val ? "filled" : ""}" data-dim="${d.key}" data-val="${n}" aria-label="${n}/5">★</button>`
      )
      .join("");
    return `
      <div class="score-field">
        <label>${d.label}</label>
        <div class="score-stars">${stars}</div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".star-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const dim = btn.dataset.dim;
      const val = Number(btn.dataset.val);
      w[dim] = w[dim] === val ? val - 1 : val; // click same star twice to clear down
      onDataChanged();
      renderScoreGrid(w);
      document.getElementById("totalBadge").textContent = "Total : " + weekTotal(w) + "/25";
    });
  });
}

/* ==========================================================================
   Export / import
   ========================================================================== */
function bindExportImport() {
  document.getElementById("btnExport").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "parcours-progression.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("btnImportTrigger").addEventListener("click", () => {
    document.getElementById("btnImport").click();
  });

  document.getElementById("btnImport").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.weeks || !Array.isArray(parsed.weeks)) throw new Error("Format invalide");
      state = parsed;
      onDataChanged();
      showToast("Import réussi.");
    } catch (err) {
      showToast("Échec de l'import : fichier invalide.");
    }
    e.target.value = "";
  });
}

/* ==========================================================================
   GitHub sync
   ========================================================================== */
function bindSettingsForm() {
  document.getElementById("btnConnect").addEventListener("click", async () => {
    settings.owner = document.getElementById("ghOwner").value.trim();
    settings.repo = document.getElementById("ghRepo").value.trim();
    settings.branch = document.getElementById("ghBranch").value.trim() || "main";
    settings.path = document.getElementById("ghPath").value.trim() || "data/progress.json";
    const tokenField = document.getElementById("ghToken").value.trim();
    if (tokenField) settings.token = tokenField;

    if (!settings.owner || !settings.repo || !settings.token) {
      setSettingsMessage("Renseigne au minimum le propriétaire, le dépôt et le token.", true);
      return;
    }
    settings.connected = true;
    persistSettings();
    await ghPull({ silent: false });
  });

  document.getElementById("btnPush").addEventListener("click", () => ghPush({ silent: false }));

  document.getElementById("btnDisconnect").addEventListener("click", () => {
    settings = { ...settings, connected: false, token: "", sha: null };
    persistSettings();
    renderSettingsForm();
    updateSyncStatus();
    setSettingsMessage("Déconnecté. Tes données restent enregistrées localement.", false);
  });

  document.getElementById("autoSyncToggle").addEventListener("change", (e) => {
    settings.autoSync = e.target.checked;
    persistSettings();
  });
}

function renderSettingsForm() {
  document.getElementById("ghOwner").value = settings.owner || "";
  document.getElementById("ghRepo").value = settings.repo || "";
  document.getElementById("ghBranch").value = settings.branch || "main";
  document.getElementById("ghPath").value = settings.path || "data/progress.json";
  document.getElementById("autoSyncToggle").checked = !!settings.autoSync;
  // Never re-populate the token field for safety on re-render after load; it stays in memory only.
}

function setSettingsMessage(msg, isError) {
  const el = document.getElementById("settingsMessage");
  el.textContent = msg;
  el.className = "sync-message " + (isError ? "error" : "ok");
}

function updateSyncStatus(mode) {
  const dot = document.getElementById("syncDot");
  const label = document.getElementById("syncLabel");
  dot.className = "sync-dot";
  if (!settings.connected) {
    label.textContent = "Non synchronisé (local uniquement)";
    return;
  }
  if (mode === "syncing") {
    dot.classList.add("syncing");
    label.textContent = "Synchronisation…";
  } else if (mode === "error") {
    dot.classList.add("error");
    label.textContent = "Erreur de synchronisation";
  } else {
    dot.classList.add("ok");
    const when = state.updatedAt ? new Date(state.updatedAt).toLocaleString("fr-FR") : "";
    label.textContent = "Synchronisé avec GitHub · " + settings.owner + "/" + settings.repo;
  }
}

function ghHeaders() {
  return {
    Authorization: "Bearer " + settings.token,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function ghContentsUrl() {
  return `https://api.github.com/repos/${settings.owner}/${settings.repo}/contents/${settings.path}`;
}

function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\n/g, ""))));
}

async function ghPull({ silent }) {
  if (!settings.token) return;
  updateSyncStatus("syncing");
  try {
    const res = await fetch(`${ghContentsUrl()}?ref=${encodeURIComponent(settings.branch)}`, {
      headers: ghHeaders(),
    });

    if (res.status === 404) {
      // Fichier absent : on crée depuis l'état local actuel.
      settings.sha = null;
      persistSettings();
      await ghPush({ silent: true });
      setSettingsMessage("Aucune donnée existante sur GitHub : première sauvegarde effectuée.", false);
      return;
    }

    if (!res.ok) throw new Error("HTTP " + res.status);

    const json = await res.json();
    settings.sha = json.sha;
    persistSettings();

    const remoteState = JSON.parse(base64ToUtf8(json.content));
    const localTime = state.updatedAt ? new Date(state.updatedAt).getTime() : 0;
    const remoteTime = remoteState.updatedAt ? new Date(remoteState.updatedAt).getTime() : 0;

    if (remoteTime > localTime) {
      state = remoteState;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
      if (!silent) showToast("Données plus récentes chargées depuis GitHub.");
    } else if (!silent) {
      showToast("Ta version locale est à jour ou plus récente.");
    }

    updateSyncStatus("ok");
    if (!silent) setSettingsMessage("Connecté et synchronisé avec succès.", false);
  } catch (err) {
    console.error(err);
    updateSyncStatus("error");
    setSettingsMessage(
      "Échec de la connexion : vérifie le token, le dépôt et ses permissions (Contents: Read/write).",
      true
    );
  }
}

async function ghPush({ silent }) {
  if (!settings.token || !settings.connected) {
    if (!silent) setSettingsMessage("Connecte d'abord un dépôt GitHub dans les champs ci-dessus.", true);
    return;
  }
  updateSyncStatus("syncing");
  try {
    const payload = {
      message: "Mise à jour de la progression — " + new Date().toISOString(),
      content: utf8ToBase64(JSON.stringify(state, null, 2)),
      branch: settings.branch,
    };
    if (settings.sha) payload.sha = settings.sha;

    const res = await fetch(ghContentsUrl(), {
      method: "PUT",
      headers: ghHeaders(),
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      // Conflit : quelqu'un (un autre appareil) a modifié entre-temps. On récupère le sha et réessaie une fois.
      const getRes = await fetch(`${ghContentsUrl()}?ref=${encodeURIComponent(settings.branch)}`, {
        headers: ghHeaders(),
      });
      const getJson = await getRes.json();
      settings.sha = getJson.sha;
      persistSettings();
      payload.sha = settings.sha;
      const retry = await fetch(ghContentsUrl(), {
        method: "PUT",
        headers: ghHeaders(),
        body: JSON.stringify(payload),
      });
      if (!retry.ok) throw new Error("HTTP " + retry.status);
      const retryJson = await retry.json();
      settings.sha = retryJson.content.sha;
    } else if (!res.ok) {
      throw new Error("HTTP " + res.status);
    } else {
      const json = await res.json();
      settings.sha = json.content.sha;
    }

    persistSettings();
    updateSyncStatus("ok");
    if (!silent) {
      setSettingsMessage("Sauvegardé sur GitHub avec succès.", false);
      showToast("Sauvegardé sur GitHub.");
    }
  } catch (err) {
    console.error(err);
    updateSyncStatus("error");
    if (!silent) setSettingsMessage("Échec de la sauvegarde sur GitHub. Réessaie dans un instant.", true);
  }
}

/* ==========================================================================
   Toast
   ========================================================================== */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
