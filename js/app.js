/* Main app: hash routing, views, autosave. */
(() => {
  const view = document.getElementById('view');
  const screenTitle = document.getElementById('screenTitle');
  const backBtn = document.getElementById('backBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const toastEl = document.getElementById('toast');

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(16).slice(2));

  const today = () => new Date().toISOString().slice(0, 10);

  const STATUS = [
    ['active', 'Active'],
    ['onhold', 'On hold'],
    ['complete', 'Complete'],
  ];
  const statusLabel = (v) => (STATUS.find(([k]) => k === v) || [])[1] || v || '';

  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
  }

  function setHeader(title, backHash) {
    screenTitle.textContent = title;
    backBtn.classList.toggle('hidden', !backHash);
    backBtn.onclick = backHash ? () => (location.hash = backHash) : null;
  }

  settingsBtn.onclick = () => (location.hash = '#/settings');

  /* ---------- routing ---------- */

  let listFilter = { search: '', status: 'all' };
  let reviewFilter = { search: '' };

  /* Segmented control shown on the two home screens (Projects / Reviews). */
  function homeTabs(active) {
    return `
      <div class="tabs">
        <a class="tab ${active === 'projects' ? 'active' : ''}" href="#/projects">Projects</a>
        <a class="tab ${active === 'reviews' ? 'active' : ''}" href="#/reviews">Saved reviews</a>
      </div>`;
  }

  async function route() {
    stopDictation();
    const hash = location.hash || '#/projects';
    const parts = hash.replace(/^#\//, '').split('/');
    try {
      if (parts[0] === 'projects' || parts[0] === '') await viewProjects();
      else if (parts[0] === 'reviews') await viewReviews();
      else if (parts[0] === 'review-view') await viewReviewPreview(parts[1]);
      else if (parts[0] === 'project-edit') await viewProjectForm(parts[1]);
      else if (parts[0] === 'project') await viewProject(parts[1]);
      else if (parts[0] === 'review') await viewReview(parts[1], parts[2]);
      else if (parts[0] === 'settings') await viewSettings();
      else await viewProjects();
    } catch (err) {
      console.error(err);
      view.innerHTML = `<div class="card"><p>Something went wrong loading this screen.</p>
        <p class="muted">${esc(err.message || err)}</p></div>`;
    }
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('DOMContentLoaded', route);

  /* ---------- projects list ---------- */

  async function viewProjects() {
    setHeader('Projects', null);
    const projects = await DB.getAll('projects');
    const reviews = await DB.getAll('reviews');
    const counts = {};
    for (const r of reviews) counts[r.projectId] = (counts[r.projectId] || 0) + 1;

    projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    view.innerHTML = `
      ${homeTabs('projects')}
      <div class="toolbar">
        <input id="searchBox" type="search" placeholder="Search projects…" value="${esc(listFilter.search)}">
        <div class="chips" id="statusChips">
          <button class="chip" data-status="all">All</button>
          ${STATUS.map(([v, l]) => `<button class="chip" data-status="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <div id="projectList" class="list"></div>
      <button id="newProjectBtn" class="btn primary block">+ New project</button>
    `;

    const listEl = document.getElementById('projectList');

    function render() {
      const q = listFilter.search.trim().toLowerCase();
      const filtered = projects.filter((p) => {
        if (listFilter.status !== 'all' && p.status !== listFilter.status) return false;
        if (!q) return true;
        const hay = [p.name, p.aspect, p.ref, p.cadName, p.location, (p.tags || []).join(' ')]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });

      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty">
          ${projects.length ? 'No projects match your filter.' :
            'No projects yet. Tap <strong>New project</strong> to add your first one.'}
        </div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map(
          (p) => `
        <a class="card row-card" href="#/project/${p.id}">
          <div class="row-main">
            <div class="row-title">${esc(p.name)}</div>
            <div class="row-sub">${esc([p.ref, p.aspect].filter(Boolean).join(' · '))}</div>
            <div class="row-sub muted">${esc(p.location || '')}</div>
          </div>
          <div class="row-side">
            <span class="pill pill-${esc(p.status)}">${esc(statusLabel(p.status))}</span>
            <span class="muted small">${counts[p.id] || 0} review${(counts[p.id] || 0) === 1 ? '' : 's'}</span>
          </div>
        </a>`
        )
        .join('');
    }

    document.getElementById('searchBox').addEventListener('input', (e) => {
      listFilter.search = e.target.value;
      render();
    });
    const chips = document.getElementById('statusChips');
    function paintChips() {
      chips.querySelectorAll('.chip').forEach((c) =>
        c.classList.toggle('active', c.dataset.status === listFilter.status)
      );
    }
    chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      listFilter.status = chip.dataset.status;
      paintChips();
      render();
    });
    document.getElementById('newProjectBtn').onclick = () => (location.hash = '#/project-edit');

    paintChips();
    render();
  }

  /* ---------- all-reviews library ---------- */

  function reviewReviewers(r) {
    const list = Array.isArray(r.reviewers) ? r.reviewers : r.reviewer ? [r.reviewer] : [];
    return list.filter(Boolean);
  }

  async function viewReviews() {
    setHeader('Saved reviews', null);
    const [projects, reviews] = [await DB.getAll('projects'), await DB.getAll('reviews')];
    const projectById = {};
    for (const p of projects) projectById[p.id] = p;

    // Most recent first (by review date, then last edited).
    reviews.sort(
      (a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || 0) - (a.updatedAt || 0)
    );

    view.innerHTML = `
      ${homeTabs('reviews')}
      <div class="toolbar">
        <input id="reviewSearch" type="search" placeholder="Search reviews (project, title, reviewer, date)…"
          value="${esc(reviewFilter.search)}">
      </div>
      <div id="reviewList" class="list"></div>
    `;

    const listEl = document.getElementById('reviewList');

    function render() {
      const q = reviewFilter.search.trim().toLowerCase();
      const filtered = reviews.filter((r) => {
        if (!q) return true;
        const project = projectById[r.projectId];
        const hay = [
          project && project.name,
          project && project.ref,
          r.title,
          r.date,
          reviewReviewers(r).join(' '),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });

      if (!filtered.length) {
        listEl.innerHTML = `<div class="empty">
          ${reviews.length
            ? 'No reviews match your search.'
            : 'No reviews saved yet. Open a project and tap <strong>New review</strong> to create one — it will appear here automatically.'}
        </div>`;
        return;
      }

      listEl.innerHTML = filtered
        .map((r) => {
          const project = projectById[r.projectId];
          const nSec = (r.sections || []).length;
          const nPh = (r.sections || []).reduce((n, s) => n + (s.photos || []).length, 0);
          const reviewers = reviewReviewers(r).join(', ');
          const projectName = project ? project.name : 'Unknown project';
          const status = project ? project.status : '';
          return `
        <a class="card row-card" href="#/review-view/${r.id}">
          <div class="row-main">
            <div class="row-title">${esc(r.title || 'Review')}</div>
            <div class="row-sub">${esc(projectName)}</div>
            <div class="row-sub muted">${esc(
              [r.date, reviewers, `${nSec} section${nSec === 1 ? '' : 's'}`, `${nPh} photo${nPh === 1 ? '' : 's'}`]
                .filter(Boolean)
                .join(' · ')
            )}</div>
          </div>
          <div class="row-side">
            ${status ? `<span class="pill pill-${esc(status)}">${esc(statusLabel(status))}</span>` : ''}
            <span class="chev">&#8250;</span>
          </div>
        </a>`;
        })
        .join('');
    }

    document.getElementById('reviewSearch').addEventListener('input', (e) => {
      reviewFilter.search = e.target.value;
      render();
    });

    render();
  }

  /* ---------- review preview (read-only, PDF-style) ---------- */

  async function viewReviewPreview(id) {
    const review = await DB.get('reviews', id);
    if (!review) { location.hash = '#/reviews'; return; }
    const project = await DB.get('projects', review.projectId);
    const settings = await DB.getSettings();
    setHeader(project ? project.name : 'Review', '#/reviews');

    view.innerHTML = `
      <div class="preview-actions">
        <button id="editReviewBtn" class="btn primary">&#9998; Edit review</button>
        <button id="printBtn" class="btn">Print / Save as PDF</button>
        <button id="dlBtn" class="btn">Download</button>
      </div>
      <div class="preview-frame">
        <iframe id="previewFrame" title="Review form preview"></iframe>
      </div>
    `;

    const frame = document.getElementById('previewFrame');
    const html = await Exporter.previewHtml(project || { name: 'Project' }, review, settings);
    // Auto-size the iframe to its content so the page scrolls naturally.
    frame.onload = () => {
      try {
        const h = frame.contentDocument.documentElement.scrollHeight;
        if (h) frame.style.height = h + 'px';
      } catch (_) { /* cross-origin guard — not expected for srcdoc */ }
    };
    frame.srcdoc = html;
    // Re-measure shortly after in case layout settles after first paint.
    setTimeout(() => {
      try {
        const h = frame.contentDocument.documentElement.scrollHeight;
        if (h) frame.style.height = h + 'px';
      } catch (_) {}
    }, 300);

    document.getElementById('editReviewBtn').onclick = () => (location.hash = `#/review/${id}/view`);
    document.getElementById('printBtn').onclick = () =>
      Exporter.openPrintView(project || { name: 'Project' }, review, settings);
    document.getElementById('dlBtn').onclick = async () => {
      await Exporter.download(project || { name: 'Project' }, review, settings);
      toast('Review form downloaded');
    };
  }

  /* ---------- project create / edit ---------- */

  async function viewProjectForm(id) {
    const existing = id ? await DB.get('projects', id) : null;
    setHeader(existing ? 'Edit project' : 'New project', existing ? `#/project/${id}` : '#/projects');

    const p = existing || { name: '', aspect: '', ref: '', cadName: '', cadVersion: '', location: '', status: 'active', tags: [], notes: '' };

    view.innerHTML = `
      <form id="projectForm" class="card form">
        <label>Project name *<input name="name" required value="${esc(p.name)}"></label>
        <label>Project aspect<input name="aspect" value="${esc(p.aspect)}"></label>
        <label>Reference / number<input name="ref" value="${esc(p.ref)}"></label>
        <label>CAD name<input name="cadName" value="${esc(p.cadName)}"></label>
        <label>CAD version<input name="cadVersion" value="${esc(p.cadVersion)}"></label>
        <label>Location<input name="location" value="${esc(p.location)}"></label>
        <label>Status
          <select name="status">
            ${STATUS.map(([v, l]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label>Tags (comma separated)<input name="tags" value="${esc((p.tags || []).join(', '))}"></label>
        <label>Description<textarea name="notes" rows="3">${esc(p.notes)}</textarea></label>
        <button class="btn primary block" type="submit">${existing ? 'Save changes' : 'Create project'}</button>
        ${existing ? '<button class="btn danger block" type="button" id="deleteProjectBtn">Delete project</button>' : ''}
      </form>
    `;

    document.getElementById('projectForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const rec = {
        id: existing ? existing.id : uid(),
        name: String(f.get('name')).trim(),
        aspect: String(f.get('aspect')).trim(),
        ref: String(f.get('ref')).trim(),
        cadName: String(f.get('cadName')).trim(),
        cadVersion: String(f.get('cadVersion')).trim(),
        location: String(f.get('location')).trim(),
        status: String(f.get('status')),
        tags: String(f.get('tags')).split(',').map((t) => t.trim()).filter(Boolean),
        notes: String(f.get('notes')).trim(),
        createdAt: existing ? existing.createdAt : Date.now(),
        updatedAt: Date.now(),
      };
      if (!rec.name) return;
      await DB.put('projects', rec);
      toast(existing ? 'Project saved' : 'Project created');
      location.hash = `#/project/${rec.id}`;
    };

    const del = document.getElementById('deleteProjectBtn');
    if (del)
      del.onclick = async () => {
        if (!confirm('Delete this project and ALL of its reviews and photos?')) return;
        const reviews = await DB.byIndex('reviews', 'projectId', existing.id);
        for (const r of reviews) await deleteReviewData(r);
        await DB.delete('projects', existing.id);
        toast('Project deleted');
        location.hash = '#/projects';
      };
  }

  async function deleteReviewData(review) {
    for (const sec of review.sections || []) {
      for (const ph of sec.photos || []) await DB.delete('photos', ph.id);
    }
    await DB.delete('reviews', review.id);
  }

  /* ---------- project detail ---------- */

  async function viewProject(id) {
    const p = await DB.get('projects', id);
    if (!p) { location.hash = '#/projects'; return; }
    setHeader(p.name, '#/projects');

    const reviews = await DB.byIndex('reviews', 'projectId', id);
    reviews.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt - a.createdAt));

    const detailRows = [
      ['Aspect', p.aspect],
      ['Reference', p.ref],
      ['CAD name', p.cadName],
      ['CAD version', p.cadVersion],
      ['Location', p.location],
      ['Tags', (p.tags || []).join(', ')],
      ['Description', p.notes],
    ]
      .filter(([, v]) => v)
      .map(([k, v]) => `<div class="kv"><span>${k}</span><strong>${esc(v)}</strong></div>`)
      .join('');

    view.innerHTML = `
      <div class="card">
        <div class="card-head">
          <span class="pill pill-${esc(p.status)}">${esc(statusLabel(p.status))}</span>
          <button class="btn small" id="editProjectBtn">Edit</button>
        </div>
        ${detailRows || '<p class="muted">No further details.</p>'}
      </div>

      <h2 class="section-label">Reviews</h2>
      <div class="list">
        ${reviews.map((r) => {
          const nSec = (r.sections || []).length;
          const nPh = (r.sections || []).reduce((n, s) => n + (s.photos || []).length, 0);
          return `<a class="card row-card" href="#/review/${r.id}">
            <div class="row-main">
              <div class="row-title">${esc(r.title || 'Review')}</div>
              <div class="row-sub muted">${esc(r.date || '')} · ${nSec} section${nSec === 1 ? '' : 's'} · ${nPh} photo${nPh === 1 ? '' : 's'}</div>
            </div>
            <div class="row-side"><span class="chev">&#8250;</span></div>
          </a>`;
        }).join('') || '<div class="empty">No reviews yet.</div>'}
      </div>
      <button id="newReviewBtn" class="btn primary block">+ New review</button>
    `;

    document.getElementById('editProjectBtn').onclick = () => (location.hash = `#/project-edit/${id}`);
    document.getElementById('newReviewBtn').onclick = async () => {
      const settings = await DB.getSettings();
      const review = {
        id: uid(),
        projectId: id,
        title: 'Project review',
        date: today(),
        reviewers: settings.reviewer ? [settings.reviewer] : [],
        sections: [{ id: uid(), title: 'General', notes: '', photos: [] }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await DB.put('reviews', review);
      location.hash = `#/review/${review.id}`;
    };
  }

  /* ---------- review editor ---------- */

  let dictation = null;        // active dictation instance
  let dictationTarget = null;  // section id currently being dictated into

  function stopDictation() {
    if (dictation && dictation.active) dictation.stop();
    dictation = null;
    dictationTarget = null;
  }

  /* Options for the "add a reviewer" select: team members not already picked. */
  function reviewerAddOptions(people, selected) {
    const available = people.filter((n) => !selected.includes(n));
    return (
      `<option value="">+ Add reviewer…</option>` +
      available.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('') +
      `<option value="__add__">+ Add new person…</option>`
    );
  }

  async function viewReview(id, origin) {
    const review = await DB.get('reviews', id);
    if (!review) { location.hash = '#/projects'; return; }
    const project = await DB.get('projects', review.projectId);
    // Return to wherever the editor was opened from.
    const backHash =
      origin === 'view' ? `#/review-view/${id}`
      : origin === 'lib' ? '#/reviews'
      : `#/project/${review.projectId}`;
    setHeader(project ? project.name : 'Review', backHash);

    const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    const appSettings = await DB.getSettings();

    // Multiple reviewers per review. Migrate any older single-`reviewer` reviews.
    const reviewers = Array.isArray(review.reviewers)
      ? review.reviewers.slice()
      : review.reviewer ? [review.reviewer] : [];

    view.innerHTML = `
      <div class="card form" id="reviewMeta">
        <div class="grid-2">
          <label>Review title<input id="rvTitle" value="${esc(review.title)}"></label>
          <label>Date<input id="rvDate" type="date" value="${esc(review.date)}"></label>
        </div>
        <div class="field">
          <span class="field-label">Reviewed by</span>
          <div class="chip-list" id="reviewerChips"></div>
          <select id="reviewerAddSel"></select>
        </div>
      </div>

      <h2 class="section-label">Review sections</h2>
      <div id="sections"></div>
      <button id="addSectionBtn" class="btn block">+ Add section</button>

      <h2 class="section-label">Next steps</h2>
      <div class="card">
        <textarea id="nextSteps" class="sec-notes" rows="4"
          placeholder="Follow-up actions — one per line. Dictate below, then Tidy.">${esc(review.nextSteps || '')}</textarea>
        <div class="dict-bar">
          ${speechSupported ? '<button class="btn small mic-btn" id="nsMic">&#127908; Dictate</button>' : ''}
          <button class="btn small" id="nsTidy">&#10024; Tidy into bullets</button>
          <span class="interim muted small" id="nsInterim"></span>
        </div>
      </div>

      <div class="actions">
        <button id="exportBtn" class="btn primary block">Export review form (PDF / print)</button>
        <button id="downloadBtn" class="btn block">Download as HTML file</button>
        <button id="deleteReviewBtn" class="btn danger block">Delete review</button>
      </div>
      ${speechSupported ? '' : '<p class="muted small">Voice dictation is not supported in this browser — use Chrome, or your keyboard’s mic key.</p>'}
      <p class="muted small" id="saveState">All changes save automatically.</p>
    `;

    const sectionsEl = document.getElementById('sections');

    /* --- persistence --- */
    let saveTimer = null;
    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 400);
    }
    async function save() {
      review.title = document.getElementById('rvTitle').value;
      review.date = document.getElementById('rvDate').value;
      review.reviewers = reviewers.slice();
      delete review.reviewer; // superseded by the reviewers array
      review.nextSteps = document.getElementById('nextSteps').value;
      review.sections = [...sectionsEl.querySelectorAll('.section-card')].map((el) => {
        const secId = el.dataset.id;
        const old = review.sections.find((s) => s.id === secId) || { photos: [] };
        return {
          id: secId,
          title: el.querySelector('.sec-title').value,
          notes: el.querySelector('.sec-notes').value,
          photos: [...el.querySelectorAll('.photo-thumb')].map((t) => ({
            id: t.dataset.photoId,
            caption: t.querySelector('.photo-caption').value,
          })),
        };
      });
      review.updatedAt = Date.now();
      await DB.put('reviews', review);
      if (project) { project.updatedAt = Date.now(); await DB.put('projects', project); }
      const st = document.getElementById('saveState');
      if (st) st.textContent = 'Saved ' + new Date().toLocaleTimeString();
    }

    document.getElementById('reviewMeta').addEventListener('input', scheduleSave);
    sectionsEl.addEventListener('input', scheduleSave);

    /* Shared Dictate/Tidy wiring, used by review sections and the Next steps field.
     * targetKey uniquely identifies the field being dictated into so only one
     * mic records at a time. */
    function wireDictation(micBtn, interimEl, notesEl, targetKey) {
      if (!micBtn) return;
      micBtn.onclick = () => {
        if (dictationTarget === targetKey) {
          stopDictation();
          micBtn.classList.remove('recording');
          micBtn.innerHTML = '&#127908; Dictate';
          return;
        }
        stopDictation();
        document.querySelectorAll('.mic-btn.recording').forEach((b) => {
          b.classList.remove('recording');
          b.innerHTML = '&#127908; Dictate';
        });
        dictationTarget = targetKey;
        // Whatever is already in the field; dictation is appended to it as one
        // continuous stream (spaces, not a new line per word).
        const base = notesEl.value;
        dictation = createDictation({
          onTranscript: (finalized, interim) => {
            const dictated = (finalized + interim).replace(/\s+/g, ' ').trim();
            notesEl.value = base
              ? base.replace(/\s*$/, '') + (dictated ? ' ' + dictated : '')
              : dictated;
            interimEl.textContent = interim.replace(/\s+/g, ' ').trim();
            scheduleSave();
          },
          onState: (active) => {
            micBtn.classList.toggle('recording', active);
            micBtn.innerHTML = active ? '&#9632; Stop' : '&#127908; Dictate';
            if (!active) interimEl.textContent = '';
          },
          onError: (msg) => toast(msg),
        });
        if (dictation) dictation.start();
      };
    }

    function wireTidy(tidyBtn, notesEl) {
      tidyBtn.onclick = async (e) => {
        const btn = e.currentTarget;
        const raw = notesEl.value.trim();
        if (!raw) { toast('Nothing to tidy yet'); return; }
        const settings = await DB.getSettings();
        let bullets;
        if (settings.aiEnabled && settings.apiKey) {
          btn.disabled = true;
          btn.textContent = 'Tidying…';
          try {
            bullets = await Tidy.ai(raw, settings.apiKey);
          } catch (err) {
            toast('AI tidy failed (' + err.message + ') — used offline tidy instead');
            bullets = Tidy.local(raw);
          }
          btn.disabled = false;
          btn.innerHTML = '&#10024; Tidy into bullets';
        } else {
          bullets = Tidy.local(raw);
        }
        if (!bullets.length) { toast('Nothing usable found'); return; }
        notesEl.value = bullets.join('\n');
        scheduleSave();
      };
    }

    /* Next steps field: same Dictate/Tidy affordances as sections. */
    const nextStepsEl = document.getElementById('nextSteps');
    nextStepsEl.addEventListener('input', scheduleSave);
    wireDictation(document.getElementById('nsMic'), document.getElementById('nsInterim'), nextStepsEl, '__nextsteps__');
    wireTidy(document.getElementById('nsTidy'), nextStepsEl);

    /* "Reviewed by" — multiple reviewers as chips, plus NPI team + add-new-person */
    const reviewerChips = document.getElementById('reviewerChips');
    const reviewerAddSel = document.getElementById('reviewerAddSel');

    function renderReviewerChips() {
      reviewerChips.innerHTML = reviewers.length
        ? reviewers
            .map(
              (n, i) => `<span class="chip reviewer-chip">${esc(n)}
                <button type="button" class="chip-remove" data-i="${i}" aria-label="Remove ${esc(n)}">&#10005;</button>
              </span>`
            )
            .join('')
        : '<span class="muted small">No reviewers added yet.</span>';
      reviewerChips.querySelectorAll('.chip-remove').forEach((btn) => {
        btn.onclick = () => {
          reviewers.splice(Number(btn.dataset.i), 1);
          renderReviewerChips();
          renderReviewerAddSelect();
          scheduleSave();
        };
      });
    }
    function renderReviewerAddSelect() {
      reviewerAddSel.innerHTML = reviewerAddOptions(appSettings.people, reviewers);
    }

    reviewerAddSel.addEventListener('change', async () => {
      const val = reviewerAddSel.value;
      if (!val) return;
      if (val === '__add__') {
        const name = (prompt('Name of new reviewer:') || '').trim();
        if (name) {
          if (!appSettings.people.includes(name)) {
            appSettings.people.push(name);
            await DB.saveSettings(appSettings);
          }
          if (!reviewers.includes(name)) reviewers.push(name);
          toast(name + ' added to the team list');
        }
      } else if (!reviewers.includes(val)) {
        reviewers.push(val);
      }
      renderReviewerChips();
      renderReviewerAddSelect();
      scheduleSave();
    });

    renderReviewerChips();
    renderReviewerAddSelect();

    /* --- section rendering --- */
    async function renderSections() {
      sectionsEl.innerHTML = '';
      for (const sec of review.sections) sectionsEl.appendChild(await buildSectionEl(sec));
    }

    async function buildSectionEl(sec) {
      const el = document.createElement('div');
      el.className = 'card section-card';
      el.dataset.id = sec.id;
      el.innerHTML = `
        <div class="section-head">
          <input class="sec-title" placeholder="Section title (e.g. Progress, Budget, Quality)" value="${esc(sec.title)}">
          <button class="icon-btn sec-up" title="Move up">&#8593;</button>
          <button class="icon-btn sec-down" title="Move down">&#8595;</button>
          <button class="icon-btn sec-del" title="Delete section">&#10005;</button>
        </div>
        <textarea class="sec-notes" rows="4"
          placeholder="Notes — one point per line. Dictate below, then Tidy.">${esc(sec.notes)}</textarea>
        <div class="dict-bar">
          ${speechSupported ? '<button class="btn small mic-btn">&#127908; Dictate</button>' : ''}
          <button class="btn small tidy-btn">&#10024; Tidy into bullets</button>
          <span class="interim muted small"></span>
        </div>
        <div class="photo-row"></div>
        <label class="btn small photo-add">&#128247; Add photo
          <input type="file" accept="image/*" capture="environment" multiple hidden>
        </label>
      `;

      const photoRow = el.querySelector('.photo-row');
      for (const ph of sec.photos || []) {
        const rec = await DB.get('photos', ph.id);
        if (rec) photoRow.appendChild(buildThumb(ph.id, rec.blob, ph.caption));
      }

      /* section controls */
      el.querySelector('.sec-del').onclick = async () => {
        if (!confirm('Delete this section (and its photos)?')) return;
        const cur = review.sections.find((s) => s.id === sec.id);
        for (const ph of (cur && cur.photos) || []) await DB.delete('photos', ph.id);
        el.remove();
        await save();
      };
      el.querySelector('.sec-up').onclick = async () => {
        if (el.previousElementSibling) { el.parentNode.insertBefore(el, el.previousElementSibling); await save(); }
      };
      el.querySelector('.sec-down').onclick = async () => {
        if (el.nextElementSibling) { el.parentNode.insertBefore(el.nextElementSibling, el); await save(); }
      };

      /* dictation + tidy (shared helpers) */
      const notesEl = el.querySelector('.sec-notes');
      wireDictation(el.querySelector('.mic-btn'), el.querySelector('.interim'), notesEl, sec.id);
      wireTidy(el.querySelector('.tidy-btn'), notesEl);

      /* photos */
      el.querySelector('.photo-add input').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        for (const file of files) {
          try {
            const blob = await downscalePhoto(file);
            const photoId = uid();
            await DB.put('photos', { id: photoId, blob, createdAt: Date.now() });
            photoRow.appendChild(buildThumb(photoId, blob, ''));
          } catch (err) {
            console.error(err);
            toast('Could not add that photo');
          }
        }
        await save();
      });

      function buildThumb(photoId, blob, caption) {
        const t = document.createElement('div');
        t.className = 'photo-thumb';
        t.dataset.photoId = photoId;
        const url = URL.createObjectURL(blob);
        t.innerHTML = `
          <img src="${url}" alt="Review photo">
          <button class="thumb-del" title="Remove photo">&#10005;</button>
          <input class="photo-caption" placeholder="Caption…" value="${esc(caption || '')}">
        `;
        t.querySelector('.thumb-del').onclick = async () => {
          if (!confirm('Remove this photo?')) return;
          await DB.delete('photos', photoId);
          t.remove();
          await save();
        };
        return t;
      }

      return el;
    }

    document.getElementById('addSectionBtn').onclick = async () => {
      const sec = { id: uid(), title: '', notes: '', photos: [] };
      review.sections.push(sec);
      sectionsEl.appendChild(await buildSectionEl(sec));
      await save();
      sectionsEl.lastElementChild.querySelector('.sec-title').focus();
    };

    document.getElementById('exportBtn').onclick = async () => {
      await save();
      const settings = await DB.getSettings();
      await Exporter.openPrintView(project || { name: 'Project' }, review, settings);
    };
    document.getElementById('downloadBtn').onclick = async () => {
      await save();
      const settings = await DB.getSettings();
      await Exporter.download(project || { name: 'Project' }, review, settings);
      toast('Review form downloaded');
    };
    document.getElementById('deleteReviewBtn').onclick = async () => {
      if (!confirm('Delete this review and its photos?')) return;
      await deleteReviewData(review);
      toast('Review deleted');
      location.hash = backHash;
    };

    await renderSections();
  }

  /* Downscale camera photos before storing (max 1600px, JPEG). */
  async function downscalePhoto(file) {
    const img = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const MAX = 1600;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.82));
    if (!blob) throw new Error('encode failed');
    return blob;
  }

  /* ---------- settings ---------- */

  async function viewSettings() {
    setHeader('Settings', '#/projects');
    const s = await DB.getSettings();

    // This app's own URL (without the in-app #route) — for sharing / installing elsewhere.
    const appUrl = location.origin + location.pathname;

    view.innerHTML = `
      <form id="settingsForm" class="card form">
        <label>Your name (default reviewer)<input name="reviewer" value="${esc(s.reviewer)}"></label>
        <label>Company name (shown on review forms)<input name="company" value="${esc(s.company)}"></label>

        <h3 class="settings-sub">AI-powered tidy (optional)</h3>
        <p class="muted small">Off = the built-in offline tidy is used. On = dictation is cleaned up by
        Claude using your own Anthropic API key. The key is stored only on this device and sent only to
        Anthropic. Get a key at console.anthropic.com — use one with a spend limit.</p>
        <label class="check"><input type="checkbox" name="aiEnabled" ${s.aiEnabled ? 'checked' : ''}> Use AI tidy</label>
        <label>Anthropic API key<input name="apiKey" type="password" autocomplete="off" value="${esc(s.apiKey)}"></label>

        <button class="btn primary block" type="submit">Save settings</button>
      </form>

      <div class="card">
        <h3 class="settings-sub" style="margin-top:0">App link</h3>
        <p class="muted small">Open this app on another device, or share it with a colleague.</p>
        <a class="app-link" id="appLink" href="${esc(appUrl)}" target="_blank" rel="noopener">${esc(appUrl)}</a>
        <div class="link-actions">
          <button type="button" class="btn small" id="copyLinkBtn">Copy link</button>
          <a class="btn small" href="${esc(appUrl)}" target="_blank" rel="noopener">Open in new tab</a>
        </div>
      </div>

      <p class="muted small center">All data is stored locally on this device.<br>
      Install this app: browser menu &rarr; “Add to Home Screen”.</p>
    `;

    document.getElementById('copyLinkBtn').onclick = async () => {
      try {
        await navigator.clipboard.writeText(appUrl);
        toast('Link copied');
      } catch (_) {
        // Clipboard API unavailable (e.g. non-secure context) — select the text instead.
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('appLink'));
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        toast('Copy the highlighted link');
      }
    };

    document.getElementById('settingsForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const current = await DB.getSettings();
      await DB.saveSettings(Object.assign(current, {
        reviewer: String(f.get('reviewer')).trim(),
        company: String(f.get('company')).trim(),
        aiEnabled: f.get('aiEnabled') === 'on',
        apiKey: String(f.get('apiKey')).trim(),
      }));
      toast('Settings saved');
      location.hash = '#/projects';
    };
  }
})();
