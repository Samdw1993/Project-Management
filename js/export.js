/* Builds the standardised review form as a self-contained HTML document.
 * Open it in a new tab to Print / Save as PDF, or download the file itself.
 */
const Exporter = (() => {
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));

  const STATUS_LABELS = { active: 'Active', onhold: 'On hold', complete: 'Complete' };

  function metaRow(label, value) {
    if (!value) return '';
    return `<tr><th>${esc(label)}</th><td>${esc(value)}</td></tr>`;
  }

  /* photoUrls: Map photoId -> data URL */
  function buildHtml({ project, review, settings, photoUrls }) {
    const sectionsHtml = (review.sections || [])
      .map((sec, si) => {
        const bullets = String(sec.notes || '')
          .split('\n')
          .map((l) => l.replace(/^[-•*]\s*/, '').trim())
          .filter(Boolean)
          .map((l) => `<li>${esc(l)}</li>`)
          .join('');

        const photos = (sec.photos || [])
          .map((p, pi) => {
            const url = photoUrls.get(p.id);
            if (!url) return '';
            const label = `Photo ${si + 1}.${pi + 1}`;
            const caption = p.caption ? ` — ${esc(p.caption)}` : '';
            return `<figure><img src="${url}" alt="${esc(label)}"><figcaption>${label}${caption}</figcaption></figure>`;
          })
          .join('');

        return `
        <section class="review-section">
          <h2>${si + 1}. ${esc(sec.title || 'Untitled section')}</h2>
          ${bullets ? `<ul>${bullets}</ul>` : '<p class="none">No notes recorded.</p>'}
          ${photos ? `<div class="photo-grid">${photos}</div>` : ''}
        </section>`;
      })
      .join('');

    const generated = new Date().toLocaleString();

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review — ${esc(project.name)} — ${esc(review.date || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 13px/1.5 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
         color: #16212e; background: #e9ecef; }
  .sheet { max-width: 800px; margin: 0 auto; background: #fff; padding: 34px 40px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start;
                border-bottom: 3px solid #1d3557; padding-bottom: 12px; margin-bottom: 18px; }
  .doc-header h1 { font-size: 20px; color: #1d3557; letter-spacing: .04em; }
  .doc-header .company { font-size: 14px; font-weight: 600; text-align: right; }
  .doc-header .subtitle { color: #5a6b7d; font-size: 12px; margin-top: 2px; }
  table.meta { width: 100%; border-collapse: collapse; margin-bottom: 22px; }
  table.meta th, table.meta td { border: 1px solid #cfd8e0; padding: 6px 10px; text-align: left; }
  table.meta th { background: #f1f4f7; width: 28%; font-weight: 600; color: #33465c; }
  .review-section { margin-bottom: 20px; break-inside: avoid-page; }
  .review-section h2 { font-size: 14.5px; color: #1d3557; background: #f1f4f7;
                       border-left: 4px solid #1d3557; padding: 6px 10px; margin-bottom: 8px; }
  .review-section ul { margin: 0 0 8px 22px; }
  .review-section li { margin-bottom: 3px; }
  .none { color: #8a97a5; font-style: italic; margin-bottom: 8px; }
  .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 6px; }
  .photo-grid figure { break-inside: avoid; }
  .photo-grid img { width: 100%; border: 1px solid #cfd8e0; }
  .photo-grid figcaption { font-size: 11px; color: #5a6b7d; margin-top: 3px; }
  .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 36px; }
  .signoff .line { border-top: 1px solid #33465c; padding-top: 4px; font-size: 12px; color: #33465c; }
  .doc-footer { margin-top: 26px; font-size: 10.5px; color: #8a97a5;
                border-top: 1px solid #e1e7ec; padding-top: 6px; }
  .toolbar { position: sticky; top: 0; background: #1d3557; color: #fff; padding: 10px;
             display: flex; gap: 10px; justify-content: center; }
  .toolbar button { font: inherit; padding: 8px 18px; border: 0; border-radius: 6px;
                    background: #e63946; color: #fff; cursor: pointer; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; padding: 0; }
    @page { margin: 18mm 15mm; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">
  <div class="doc-header">
    <div>
      <h1>PROJECT REVIEW REPORT</h1>
      <div class="subtitle">${esc(review.title || 'Review')}</div>
    </div>
    <div class="company">${esc(settings.company || '')}</div>
  </div>

  <table class="meta">
    ${metaRow('Project', project.name)}
    ${metaRow('Project aspect', project.aspect)}
    ${metaRow('Reference', project.ref)}
    ${metaRow('CAD name', project.cadName)}
    ${metaRow('CAD version', project.cadVersion)}
    ${metaRow('Location', project.location)}
    ${metaRow('Project status', STATUS_LABELS[project.status] || project.status)}
    ${metaRow('Review date', review.date)}
    ${metaRow('Reviewed by', review.reviewer)}
  </table>

  ${sectionsHtml || '<p class="none">No review sections.</p>'}

  <div class="signoff">
    <div class="line">Signed (reviewer)</div>
    <div class="line">Date</div>
  </div>

  <div class="doc-footer">Generated ${esc(generated)} · Project Review app</div>
</div>
</body>
</html>`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  async function collectPhotoUrls(review) {
    const urls = new Map();
    for (const sec of review.sections || []) {
      for (const p of sec.photos || []) {
        const rec = await DB.get('photos', p.id);
        if (rec && rec.blob) urls.set(p.id, await blobToDataUrl(rec.blob));
      }
    }
    return urls;
  }

  async function makeDocument(project, review, settings) {
    const photoUrls = await collectPhotoUrls(review);
    return buildHtml({ project, review, settings, photoUrls });
  }

  function filename(project, review) {
    const slug = (s) => String(s || '').trim().replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
    return `review_${slug(project.name) || 'project'}_${review.date || 'undated'}.html`;
  }

  return {
    async openPrintView(project, review, settings) {
      const html = await makeDocument(project, review, settings);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      window.open(url, '_blank');
    },
    async download(project, review, settings) {
      const html = await makeDocument(project, review, settings);
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename(project, review);
      document.body.appendChild(a);
      a.click();
      a.remove();
    },
    _buildHtml: buildHtml, // exposed for testing
  };
})();
