/* Photo annotation editor: sketch freehand lines, straight lines and arrows
 * over a photo. Annotations are stored as vector strokes (re-editable), and a
 * flattened image is produced for display/export so the original is preserved.
 *
 *   PhotoEditor.open(blob, annotations) -> Promise<{annotations, annotatedBlob} | null>
 *   PhotoEditor.composite(blob, annotations) -> Promise<Blob>   // flatten strokes onto the image
 */
const PhotoEditor = (() => {
  const COLORS = ['#e63946', '#ffd000', '#22c55e', '#111111', '#ffffff'];

  async function loadBitmap(blob) {
    if (window.createImageBitmap) {
      try { return await createImageBitmap(blob); } catch (_) { /* fall through */ }
    }
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });
  }
  const dimsOf = (bmp) => ({ w: bmp.width || bmp.naturalWidth, h: bmp.height || bmp.naturalHeight });

  function drawArrowHead(ctx, a, b, w) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.max(12, w * 5);
    const spread = Math.PI / 7;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - len * Math.cos(ang - spread), b.y - len * Math.sin(ang - spread));
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - len * Math.cos(ang + spread), b.y - len * Math.sin(ang + spread));
    ctx.stroke();
  }

  function drawStroke(ctx, s) {
    const p = s.points || [];
    if (!p.length) return;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (s.type === 'free') {
      ctx.beginPath();
      ctx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) ctx.lineTo(p[i].x, p[i].y);
      ctx.stroke();
    } else {
      const a = p[0];
      const b = p[p.length - 1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (s.type === 'arrow') drawArrowHead(ctx, a, b, s.width);
    }
  }

  async function compositeFromBitmap(bmp, annotations) {
    const { w, h } = dimsOf(bmp);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0, w, h);
    for (const s of annotations || []) drawStroke(ctx, s);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  }

  async function composite(blob, annotations) {
    return compositeFromBitmap(await loadBitmap(blob), annotations);
  }

  function open(blob, annotations) {
    return new Promise(async (resolve) => {
      const bmp = await loadBitmap(blob);
      const { w: iw, h: ih } = dimsOf(bmp);
      const baseWidth = Math.max(3, Math.round(Math.max(iw, ih) / 220));

      // Deep-copy incoming strokes so a Cancel leaves the original untouched.
      let strokes = (annotations || []).map((s) => ({
        type: s.type, color: s.color, width: s.width,
        points: s.points.map((pt) => ({ x: pt.x, y: pt.y })),
      }));
      let current = null;
      let tool = 'arrow';
      let color = COLORS[0];

      const overlay = document.createElement('div');
      overlay.className = 'pe-overlay';
      overlay.innerHTML = `
        <div class="pe-toolbar pe-top">
          <button class="pe-btn" data-act="cancel">Cancel</button>
          <span class="pe-title">Annotate photo</span>
          <button class="pe-btn pe-primary" data-act="save">Save</button>
        </div>
        <div class="pe-stage"><canvas class="pe-canvas"></canvas></div>
        <div class="pe-toolbar pe-bottom">
          <div class="pe-tools">
            <button class="pe-tool" data-tool="pen" title="Pen">&#9998;</button>
            <button class="pe-tool" data-tool="arrow" title="Arrow">&#8599;</button>
            <button class="pe-tool" data-tool="line" title="Line">&#8725;</button>
          </div>
          <div class="pe-colors">
            ${COLORS.map((c) => `<button class="pe-color" data-color="${c}" style="background:${c}"></button>`).join('')}
          </div>
          <div class="pe-tools">
            <button class="pe-btn" data-act="undo">Undo</button>
            <button class="pe-btn" data-act="clear">Clear</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      const canvas = overlay.querySelector('.pe-canvas');
      const ctx = canvas.getContext('2d');
      let k = 1; // canvas pixels per image pixel

      function paintTools() {
        overlay.querySelectorAll('.pe-tool').forEach((b) =>
          b.classList.toggle('active', b.dataset.tool === tool));
        overlay.querySelectorAll('.pe-color').forEach((b) =>
          b.classList.toggle('active', b.dataset.color === color));
      }

      function redraw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.scale(k, k);
        for (const s of strokes) drawStroke(ctx, s);
        if (current) drawStroke(ctx, current);
        ctx.restore();
      }

      function fit() {
        const stage = overlay.querySelector('.pe-stage');
        const availW = stage.clientWidth;
        const availH = stage.clientHeight;
        if (!availW || !availH) return;
        const s = Math.min(availW / iw, availH / ih);
        const cssW = Math.max(1, Math.floor(iw * s));
        const cssH = Math.max(1, Math.floor(ih * s));
        const dpr = window.devicePixelRatio || 1;
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        k = canvas.width / iw;
        redraw();
      }

      function toImg(ev) {
        const r = canvas.getBoundingClientRect();
        return {
          x: ((ev.clientX - r.left) / r.width) * iw,
          y: ((ev.clientY - r.top) / r.height) * ih,
        };
      }

      let drawing = false;
      canvas.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        drawing = true;
        canvas.setPointerCapture(ev.pointerId);
        const pt = toImg(ev);
        current = { type: tool === 'pen' ? 'free' : tool, color, width: baseWidth, points: [pt] };
        if (current.type !== 'free') current.points.push(pt); // start == end until moved
        redraw();
      });
      canvas.addEventListener('pointermove', (ev) => {
        if (!drawing || !current) return;
        const pt = toImg(ev);
        if (current.type === 'free') current.points.push(pt);
        else current.points[1] = pt;
        redraw();
      });
      function endStroke() {
        if (!drawing) return;
        drawing = false;
        if (current) {
          const p = current.points;
          const moved =
            current.type === 'free'
              ? p.length > 1
              : Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) > baseWidth;
          if (moved) strokes.push(current);
        }
        current = null;
        redraw();
      }
      canvas.addEventListener('pointerup', endStroke);
      canvas.addEventListener('pointercancel', endStroke);
      canvas.addEventListener('pointerleave', () => { if (drawing) endStroke(); });

      function close() {
        window.removeEventListener('resize', fit);
        overlay.remove();
        document.body.style.overflow = '';
      }

      overlay.addEventListener('click', async (ev) => {
        const tb = ev.target.closest('[data-tool]');
        if (tb) { tool = tb.dataset.tool; paintTools(); return; }
        const cb = ev.target.closest('[data-color]');
        if (cb) { color = cb.dataset.color; paintTools(); return; }
        const ab = ev.target.closest('[data-act]');
        if (!ab) return;
        const act = ab.dataset.act;
        if (act === 'undo') { strokes.pop(); redraw(); }
        else if (act === 'clear') { strokes = []; redraw(); }
        else if (act === 'cancel') { close(); resolve(null); }
        else if (act === 'save') {
          const annotatedBlob = strokes.length ? await compositeFromBitmap(bmp, strokes) : null;
          close();
          resolve({ annotations: strokes, annotatedBlob });
        }
      });

      window.addEventListener('resize', fit);
      paintTools();
      // Let layout settle so the stage has measurable dimensions.
      requestAnimationFrame(fit);
    });
  }

  return { open, composite };
})();
