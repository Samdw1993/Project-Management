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

  async function route() {
    stopDictation();
    const hash = location.hash || '#/projects';
    const parts = hash.replace(/^#\//, '').split('/');
    try {
      if (parts[0] === 'projects' || parts[0] === '') await viewProjects();
      else if (parts[0] === 'project-edit') await viewProjectForm(parts[1]);
      else if (parts[0] === 'project') await viewProject(parts[1]);
      else if (parts[0] === 'review') await viewReview(parts[1]);
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
        const hay = [p.name, p.ref, p.client, p.location, (p.tags || []).join(' ')]
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
            <div class="row-sub">${esc([p.ref, p.client].filter(Boolean).join(' · '))}</div>
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

  /* ---------- project create / edit ---------- */

  async function viewProjectForm(id) {
    const existing = id ? await DB.get('projects', id) : null;
    setHeader(existing ? 'Edit project' : 'New project', existing ? `#/project/${id}` : '#/projects');

    const p = existing || { name: '', ref: '', client: '', location: '', status: 'active', tags: [], notes: '' };

    view.innerHTML = `
      <form id="projectForm" class="card form">
        <label>Project name *<input name="name" required value="${esc(p.name)}"></label>
        <label>Reference / number<input name="ref" value="${esc(p.ref)}"></label>
        <label>Client<input name="client" value="${esc(p.client)}"></label>
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
        ref: String(f.get('ref')).trim(),
        client: String(f.get('client')).trim(),
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
      ['Reference', p.ref],
      ['Client', p.client],
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
        reviewer: settings.reviewer || '',
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

  async function viewReview(id) {
    const review = await DB.get('reviews', id);
    if (!review) { location.hash = '#/projects'; return; }
    const project = await DB.get('projects', review.projectId);
    setHeader(project ? project.name : 'Review', `#/project/${review.projectId}`);

    const speechSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

    view.innerHTML = `
      <div class="card form" id="reviewMeta">
        <div class="grid-2">
          <label>Review title<input id="rvTitle" value="${esc(review.title)}"></label>
          <label>Date<input id="rvDate" type="date" value="${esc(review.date)}"></label>
        </div>
        <label>Reviewed by<input id="rvReviewer" value="${esc(review.reviewer)}"></label>
      </div>

      <h2 class="section-label">Review sections</h2>
      <div id="sections"></div>
      <button id="addSectionBtn" class="btn block">+ Add section</button>

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
      review.reviewer = document.getElementById('rvReviewer').value;
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
          <input class="sec-title" placeholder="Section title (e.g. Health & Safety)" value="${esc(sec.title)}">
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

      /* dictation */
      const micBtn = el.querySelector('.mic-btn');
      const interimEl = el.querySelector('.interim');
      const notesEl = el.querySelector('.sec-notes');
      if (micBtn) {
        micBtn.onclick = () => {
          if (dictationTarget === sec.id) { stopDictation(); micBtn.classList.remove('recording'); micBtn.innerHTML = '&#127908; Dictate'; return; }
          stopDictation();
          document.querySelectorAll('.mic-btn.recording').forEach((b) => {
            b.classList.remove('recording'); b.innerHTML = '&#127908; Dictate';
          });
          dictationTarget = sec.id;
          dictation = createDictation({
            onFinal: (text) => {
              notesEl.value = (notesEl.value.trim() ? notesEl.value.replace(/\s*$/, '') + '\n' : '') + text;
              interimEl.textContent = '';
              scheduleSave();
            },
            onInterim: (text) => { interimEl.textContent = text; },
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

      /* tidy */
      el.querySelector('.tidy-btn').onclick = async (e) => {
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
      location.hash = `#/project/${review.projectId}`;
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
      <p class="muted small center">All data is stored locally on this device.<br>
      Install this app: browser menu &rarr; “Add to Home Screen”.</p>
    `;

    document.getElementById('settingsForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      await DB.saveSettings({
        reviewer: String(f.get('reviewer')).trim(),
        company: String(f.get('company')).trim(),
        aiEnabled: f.get('aiEnabled') === 'on',
        apiKey: String(f.get('apiKey')).trim(),
      });
      toast('Settings saved');
      location.hash = '#/projects';
    };
  }
})();
