(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const cfg = window.PL_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const view = $('#view');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const must = ({ data, error }) => { if (error) throw error; return data; };
  const num = v => Number(v || 0);

  let db;
  let settings = { price_per_portion: '1', currency: '₹' };
  let students = [];

  const unitPrice = () => num(settings.price_per_portion);
  const money = n => (settings.currency || '₹') + num(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const fmtDate = d => new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let toastTimer;
  function toast(msg, isErr = false) {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast' + (isErr ? ' err' : '');
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), isErr ? 5000 : 2500);
  }
  const fail = e => { console.error(e); toast(e.message || 'Something went wrong', true); };

  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = html;
    m.showModal();
    return m;
  }
  const closeModal = () => $('#modal').close();

  async function refreshStudents() {
    students = must(await db.from('student_balances').select('*').order('name')).map(s => ({
      ...s, total_charge: num(s.total_charge), total_paid: num(s.total_paid), pending: num(s.pending)
    }));
  }

  async function loadSettings() {
    const rows = must(await db.from('settings').select('*'));
    rows.forEach(r => (settings[r.key] = r.value));
  }

  /* ---------- searchable student picker ---------- */
  function picker(host, { activeOnly = true, placeholder = 'Search student by name, class or ID…', onSelect }) {
    host.classList.add('picker');
    host.innerHTML = `<input type="search" autocomplete="off" placeholder="${esc(placeholder)}"><div class="picker-list" hidden></div>`;
    const input = host.querySelector('input');
    const list = host.querySelector('.picker-list');
    let items = [], idx = 0, chosen = null;

    function render() {
      const q = input.value.trim().toLowerCase();
      items = students
        .filter(s => !activeOnly || s.is_active)
        .filter(s => !q || [s.name, s.class_name, s.student_code].some(v => (v || '').toLowerCase().includes(q)))
        .slice(0, 8);
      if (idx >= items.length) idx = 0;
      list.innerHTML = items.length
        ? items.map((s, i) => `<button type="button" class="${i === idx ? 'active' : ''}" data-i="${i}">
            <b>${esc(s.name)}</b><small>${esc([s.class_name, s.student_code].filter(Boolean).join(' · ') || '—')}</small>
            <em>${s.pending > 0 ? money(s.pending) : ''}</em></button>`).join('')
        : '<div class="empty">No students found</div>';
      list.hidden = false;
    }
    function choose(s) {
      chosen = s; input.value = s.name; list.hidden = true; onSelect(s);
    }
    input.addEventListener('input', () => { if (chosen) { chosen = null; onSelect(null); } idx = 0; render(); });
    input.addEventListener('focus', () => { if (chosen) input.select(); else { idx = 0; render(); } });
    input.addEventListener('blur', () => setTimeout(() => (list.hidden = true), 120));
    input.addEventListener('keydown', e => {
      if (list.hidden && e.key !== 'Enter') render();
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, items.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); render(); }
      else if (e.key === 'Enter' && !list.hidden && items[idx]) { e.preventDefault(); choose(items[idx]); }
    });
    list.addEventListener('mousedown', e => {
      const b = e.target.closest('button');
      if (b) { e.preventDefault(); choose(items[b.dataset.i]); }
    });
    return {
      focus: () => input.focus(),
      clear() { chosen = null; input.value = ''; onSelect(null); },
      set: choose
    };
  }

  /* ---------- Screen 1: Dashboard ---------- */
  async function dashboard() {
    await refreshStudents();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const todays = must(await db.from('print_entries').select('total_amount').gte('created_at', start.toISOString()));
    const todayTotal = todays.reduce((a, r) => a + num(r.total_amount), 0);
    const active = students.filter(s => s.is_active).length;
    const outstanding = students.reduce((a, s) => a + Math.max(0, s.pending), 0);
    const top = students.filter(s => s.pending > 0).sort((a, b) => b.pending - a.pending).slice(0, 5);

    view.innerHTML = `
      <h1>Dashboard</h1><p class="sub">Quick overview of the printing system</p>
      <div class="grid c3">
        <div class="card stat"><small>Total students</small><b>${active}</b></div>
        <div class="card stat"><small>Today's print charge</small><b>${money(todayTotal)}</b></div>
        <div class="card stat warn"><small>Total outstanding</small><b>${money(outstanding)}</b></div>
      </div>
      <div class="row" style="margin-bottom:18px">
        <a class="btn" href="#/print">＋ Quick Add Print</a>
        <a class="btn ok" href="#/payments">₹ Receive Payment</a>
      </div>
      <div class="card"><h2>Search student</h2><div id="dash-picker"></div></div>
      <div class="card"><h2>Highest pending balances</h2>
        ${top.length ? `<div class="table-wrap"><table><tbody>${top.map(s => `
          <tr class="click" data-id="${s.id}"><td>${esc(s.name)}</td><td>${esc(s.class_name || '')}</td><td class="num pos">${money(s.pending)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No pending balances 🎉</div>'}
      </div>`;
    picker($('#dash-picker'), { activeOnly: false, onSelect: s => { if (s) location.hash = '#/reports/' + s.id; } });
    view.querySelectorAll('tr.click').forEach(tr => tr.onclick = () => (location.hash = '#/reports/' + tr.dataset.id));
  }

  /* ---------- Screen 2: Quick Print Entry ---------- */
  async function printScreen() {
    await refreshStudents();
    const price = unitPrice();
    let sel = null, qty = 1;

    view.innerHTML = `
      <h1>Add Print</h1><p class="sub">Search a student, enter portions, save.</p>
      <div class="card" style="max-width:560px">
        <div class="field"><label>Student</label><div id="pp"></div></div>
        <div class="field"><label>Print quantity (portions)</label>
          <div class="qty">
            <button class="btn ghost" id="minus" type="button">−</button>
            <input id="qty" type="number" min="1" step="1" value="1" inputmode="numeric">
            <button class="btn ghost" id="plus" type="button">+</button>
          </div>
          <div class="chips">${[1, 2, 5, 10, 20].map(n => `<button type="button" data-q="${n}">${n}</button>`).join('')}</div>
        </div>
        <div class="summary">
          <span>Price per portion</span><b>${money(price)}</b>
          <span>Total</span><b class="total" id="total">${money(price)}</b>
          <span>Date &amp; time</span><b>Automatic</b>
        </div>
        <button class="btn big" id="save" disabled>Save print entry</button>
      </div>
      <div class="card"><h2>Recent entries</h2><div id="recent"><div class="loading">Loading…</div></div></div>`;

    const saveBtn = $('#save'), qtyInput = $('#qty');
    const sync = () => {
      qty = Math.max(0, Math.floor(num(qtyInput.value)));
      $('#total').textContent = money(qty * price);
      saveBtn.disabled = !(sel && qty > 0);
    };
    const pk = picker($('#pp'), { onSelect: s => { sel = s; sync(); if (s) qtyInput.focus(); qtyInput.select(); } });
    qtyInput.oninput = sync;
    $('#minus').onclick = () => { qtyInput.value = Math.max(1, num(qtyInput.value) - 1); sync(); };
    $('#plus').onclick = () => { qtyInput.value = num(qtyInput.value) + 1; sync(); };
    view.querySelectorAll('.chips button').forEach(b => b.onclick = () => { qtyInput.value = b.dataset.q; sync(); });
    qtyInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !saveBtn.disabled) saveBtn.click(); });

    async function loadRecent() {
      const rows = must(await db.from('print_entries').select('*, students(name)').order('created_at', { ascending: false }).limit(8));
      $('#recent').innerHTML = rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th><th>When</th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.students?.name)}</td><td class="num">${r.quantity}</td><td class="num">${money(r.unit_price)}</td><td class="num">${money(r.total_amount)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No print entries yet</div>';
    }

    saveBtn.onclick = async () => {
      if (!sel || qty < 1) return;
      saveBtn.disabled = true;
      try {
        must(await db.from('print_entries').insert({
          student_id: sel.id, quantity: qty, unit_price: price, total_amount: +(qty * price).toFixed(2)
        }));
        toast(`Saved: ${sel.name} — ${qty} × ${money(price)} = ${money(qty * price)}`);
        await refreshStudents();
        pk.clear(); qtyInput.value = 1; sync(); pk.focus();
        await loadRecent();
      } catch (e) { fail(e); sync(); }
    };
    loadRecent().catch(fail);
  }

  /* ---------- Screen 4: Payments ---------- */
  async function payments() {
    await refreshStudents();
    let sel = null;

    view.innerHTML = `
      <h1>Payments</h1><p class="sub">Receive, track and undo payments.</p>
      <div class="card" style="max-width:560px">
        <div class="field"><label>Student</label><div id="pp"></div></div>
        <div id="pay-form" hidden>
          <div class="pending-box" id="pbox"></div>
          <div class="field"><label>Amount received</label>
            <div class="row" style="flex-wrap:nowrap"><input id="amt" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0">
            <button class="btn ghost" id="full" type="button" style="white-space:nowrap">Full amount</button></div></div>
          <div class="field"><label>Note (optional)</label><input id="note" type="text" maxlength="120" placeholder="e.g. cash, UPI"></div>
          <button class="btn ok big" id="save">Save payment</button>
        </div>
      </div>
      <div class="card"><h2 id="hist-title">Recent payments</h2><div id="hist"><div class="loading">Loading…</div></div></div>`;

    const form = $('#pay-form');
    function showPending() {
      const p = sel.pending;
      const box = $('#pbox');
      box.className = 'pending-box' + (p <= 0 ? ' clear' : '');
      box.innerHTML = `<small>${esc(sel.name)} — ${p < 0 ? 'Advance / credit' : 'Pending'}</small><b>${money(Math.abs(p))}</b>`;
    }
    const pk = picker($('#pp'), {
      activeOnly: false,
      onSelect: s => {
        sel = s;
        form.hidden = !s;
        if (s) { showPending(); $('#amt').value = ''; $('#amt').focus(); }
        loadHist().catch(fail);
      }
    });
    $('#full').onclick = () => { if (sel && sel.pending > 0) $('#amt').value = sel.pending; };

    async function loadHist() {
      let q = db.from('payments').select('*, students(name)').order('created_at', { ascending: false }).limit(25);
      if (sel) q = q.eq('student_id', sel.id);
      const rows = must(await q);
      $('#hist-title').textContent = sel ? `Payment history — ${sel.name}` : 'Recent payments';
      $('#hist').innerHTML = rows.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Student</th><th class="num">Amount</th><th>Note</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr class="${r.status === 'void' ? 'void' : ''}">
          <td>${esc(r.students?.name)}</td><td class="num">${money(r.amount)}</td><td>${esc(r.payment_note || '')}</td>
          <td>${fmtDate(r.created_at)}</td>
          <td><span class="tag ${r.status === 'valid' ? 'ok' : 'gray'}">${r.status}</span></td>
          <td>${r.status === 'valid' ? `<button class="btn bad sm" data-void="${r.id}">Void</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">No payments yet</div>';
      $('#hist').querySelectorAll('[data-void]').forEach(b => b.onclick = async () => {
        if (!confirm('Void this payment? The balance will be recalculated.')) return;
        try {
          must(await db.from('payments').update({ status: 'void' }).eq('id', b.dataset.void));
          toast('Payment voided');
          await refreshStudents();
          if (sel) { sel = students.find(s => s.id === sel.id); showPending(); }
          await loadHist();
        } catch (e) { fail(e); }
      });
    }

    $('#save').onclick = async () => {
      const amount = +num($('#amt').value).toFixed(2);
      if (!sel || amount <= 0) return toast('Enter a valid amount', true);
      if (amount > sel.pending && !confirm(`${money(amount)} is more than the pending ${money(Math.max(0, sel.pending))}. Save anyway?`)) return;
      const btn = $('#save'); btn.disabled = true;
      try {
        must(await db.from('payments').insert({ student_id: sel.id, amount, payment_note: $('#note').value.trim() || null, status: 'valid' }));
        toast(`Payment of ${money(amount)} saved for ${sel.name}`);
        const id = sel.id;
        await refreshStudents();
        sel = students.find(s => s.id === id);
        showPending(); $('#amt').value = ''; $('#note').value = '';
        await loadHist();
      } catch (e) { fail(e); }
      btn.disabled = false;
    };
    loadHist().catch(fail);
  }

  /* ---------- Screen 3: Students ---------- */
  async function studentsScreen() {
    await refreshStudents();
    view.innerHTML = `
      <div class="row between"><div><h1>Students</h1><p class="sub">Add, edit and search students.</p></div>
        <button class="btn" id="add">＋ Add student</button></div>
      <div class="card">
        <div class="row" style="margin-bottom:14px"><input id="q" type="search" placeholder="Search by name, class or ID…" style="max-width:340px">
          <label class="check"><input type="checkbox" id="inactive"> Show inactive</label></div>
        <div id="list" class="table-wrap"></div>
      </div>`;

    function draw() {
      const q = $('#q').value.trim().toLowerCase();
      const showInactive = $('#inactive').checked;
      const rows = students.filter(s => (showInactive || s.is_active) &&
        (!q || [s.name, s.class_name, s.student_code].some(v => (v || '').toLowerCase().includes(q))));
      $('#list').innerHTML = rows.length ? `<table>
        <thead><tr><th>Name</th><th>Class / Batch</th><th>ID</th><th class="num">Pending</th><th>Status</th><th></th></tr></thead><tbody>
        ${rows.map(s => `<tr>
          <td><b>${esc(s.name)}</b></td><td>${esc(s.class_name || '—')}</td><td>${esc(s.student_code || '—')}</td>
          <td class="num ${s.pending > 0 ? 'pos' : ''}">${money(s.pending)}</td>
          <td><span class="tag ${s.is_active ? 'ok' : 'gray'}">${s.is_active ? 'Active' : 'Inactive'}</span></td>
          <td class="row" style="flex-wrap:nowrap">
            <a class="btn ghost sm" href="#/reports/${s.id}">Account</a>
            <button class="btn ghost sm" data-edit="${s.id}">Edit</button>
            <button class="btn ghost sm" data-toggle="${s.id}">${s.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">No students found</div>';
      $('#list').querySelectorAll('[data-edit]').forEach(b => b.onclick = () => form(students.find(s => s.id === b.dataset.edit)));
      $('#list').querySelectorAll('[data-toggle]').forEach(b => b.onclick = async () => {
        const s = students.find(x => x.id === b.dataset.toggle);
        if (s.is_active && !confirm(`Deactivate ${s.name}? History is kept; they won't appear in new print entries.`)) return;
        try {
          must(await db.from('students').update({ is_active: !s.is_active }).eq('id', s.id));
          await refreshStudents(); draw();
          toast(s.is_active ? 'Student deactivated' : 'Student activated');
        } catch (e) { fail(e); }
      });
    }

    function form(s) {
      const m = openModal(`<h2>${s ? 'Edit student' : 'Add student'}</h2>
        <form id="sf">
          <div class="field"><label>Student name *</label><input name="name" required maxlength="80" value="${esc(s?.name || '')}"></div>
          <div class="field"><label>Class / Batch</label><input name="class_name" maxlength="40" value="${esc(s?.class_name || '')}"></div>
          <div class="field"><label>Student ID</label><input name="student_code" maxlength="40" value="${esc(s?.student_code || '')}"></div>
          <div class="row between"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn">Save</button></div>
        </form>`);
      m.querySelector('#cancel').onclick = closeModal;
      m.querySelector('#sf').onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(e.target);
        const row = { name: f.get('name').trim(), class_name: f.get('class_name').trim() || null, student_code: f.get('student_code').trim() || null };
        try {
          if (s) must(await db.from('students').update(row).eq('id', s.id));
          else must(await db.from('students').insert(row));
          closeModal(); await refreshStudents(); draw();
          toast(s ? 'Student updated' : 'Student added');
        } catch (err) { fail(err); }
      };
    }

    $('#add').onclick = () => form(null);
    $('#q').oninput = draw; $('#inactive').onchange = draw;
    draw();
  }

  /* ---------- Screen 5: Reports ---------- */
  async function reports(id) {
    await refreshStudents();
    return id ? studentReport(id) : overallReport();
  }

  function overallReport() {
    view.innerHTML = `
      <div class="row between"><div><h1>Reports</h1><p class="sub">Balances for all students.</p></div>
        <button class="btn ghost" id="csv">⬇ Export CSV</button></div>
      <div class="card">
        <div class="row" style="margin-bottom:14px">
          <input id="q" type="search" placeholder="Search students…" style="max-width:300px">
          <label class="check"><input type="checkbox" id="pend" checked> Pending only</label>
          <label class="check"><input type="checkbox" id="inactive"> Include inactive</label>
        </div>
        <div id="tbl" class="table-wrap"></div>
      </div>`;
    let rows = [];
    function draw() {
      const q = $('#q').value.trim().toLowerCase();
      rows = students.filter(s => ($('#inactive').checked || s.is_active) && (!$('#pend').checked || s.pending > 0) &&
        (!q || [s.name, s.class_name, s.student_code].some(v => (v || '').toLowerCase().includes(q))));
      const tc = rows.reduce((a, s) => a + s.total_charge, 0), tp = rows.reduce((a, s) => a + s.total_paid, 0);
      $('#tbl').innerHTML = rows.length ? `<table>
        <thead><tr><th>Student</th><th>Class</th><th class="num">Total charge</th><th class="num">Paid</th><th class="num">Pending</th></tr></thead><tbody>
        ${rows.map(s => `<tr class="click" data-id="${s.id}"><td><b>${esc(s.name)}</b></td><td>${esc(s.class_name || '—')}</td>
          <td class="num">${money(s.total_charge)}</td><td class="num">${money(s.total_paid)}</td>
          <td class="num ${s.pending > 0 ? 'pos' : ''}">${money(s.pending)}</td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="2">Total (${rows.length})</td><td class="num">${money(tc)}</td><td class="num">${money(tp)}</td><td class="num">${money(tc - tp)}</td></tr></tfoot></table>`
        : '<div class="empty">No matching students</div>';
      $('#tbl').querySelectorAll('tr.click').forEach(tr => tr.onclick = () => (location.hash = '#/reports/' + tr.dataset.id));
    }
    $('#q').oninput = draw;
    $('#pend').onchange = draw;
    $('#inactive').onchange = draw;
    $('#csv').onclick = () => {
      const csv = [['Student', 'Class', 'Student ID', 'Total Charge', 'Paid', 'Pending'],
        ...rows.map(s => [s.name, s.class_name || '', s.student_code || '', s.total_charge, s.total_paid, s.pending])]
        .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv' }));
      a.download = `print-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click(); URL.revokeObjectURL(a.href);
    };
    draw();
  }

  async function studentReport(id) {
    const s = students.find(x => x.id === id);
    if (!s) { view.innerHTML = '<div class="card empty">Student not found. <a href="#/reports">Back to reports</a></div>'; return; }
    const [prints, pays] = await Promise.all([
      db.from('print_entries').select('*').eq('student_id', id).order('created_at', { ascending: false }).limit(500).then(must),
      db.from('payments').select('*').eq('student_id', id).order('created_at', { ascending: false }).limit(500).then(must)
    ]);
    view.innerHTML = `
      <a class="back" href="#/reports">← All reports</a>
      <div class="row between"><div><h1>${esc(s.name)}</h1>
        <p class="sub">${esc([s.class_name, s.student_code].filter(Boolean).join(' · ') || 'No class / ID')} ${s.is_active ? '' : '· <span class="tag gray">Inactive</span>'}</p></div>
        <div class="row"><a class="btn" href="#/payments">₹ Payments</a></div></div>
      <div class="grid c3">
        <div class="card stat"><small>Total print charges</small><b>${money(s.total_charge)}</b></div>
        <div class="card stat"><small>Total paid</small><b>${money(s.total_paid)}</b></div>
        <div class="card stat ${s.pending > 0 ? 'warn' : ''}"><small>Remaining balance</small><b>${money(s.pending)}</b></div>
      </div>
      <div class="grid c2">
        <div class="card"><h2>Print history</h2>${prints.length ? `<div class="table-wrap"><table>
          <thead><tr><th>When</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>
          ${prints.map(p => `<tr><td>${fmtDate(p.created_at)}</td><td class="num">${p.quantity}</td><td class="num">${money(p.unit_price)}</td><td class="num">${money(p.total_amount)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No prints yet</div>'}</div>
        <div class="card"><h2>Payment history</h2>${pays.length ? `<div class="table-wrap"><table>
          <thead><tr><th>When</th><th class="num">Amount</th><th>Note</th><th>Status</th></tr></thead><tbody>
          ${pays.map(p => `<tr class="${p.status === 'void' ? 'void' : ''}"><td>${fmtDate(p.created_at)}</td><td class="num">${money(p.amount)}</td>
            <td>${esc(p.payment_note || '')}</td><td><span class="tag ${p.status === 'valid' ? 'ok' : 'gray'}">${p.status}</span></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No payments yet</div>'}</div>
      </div>`;
  }

  /* ---------- Screen 6: Settings ---------- */
  function settingsScreen() {
    view.innerHTML = `
      <h1>Settings</h1><p class="sub">Essential settings only.</p>
      <div class="card" style="max-width:480px">
        <div class="field"><label>Price per print portion</label><input id="price" type="number" min="0" step="0.01" value="${esc(settings.price_per_portion)}"></div>
        <div class="field"><label>Currency symbol</label><input id="cur" maxlength="4" value="${esc(settings.currency)}"></div>
        <p class="sub" style="margin-bottom:16px">Price changes apply to new print entries only. Old entries keep the price they were saved with.</p>
        <button class="btn" id="save">Save settings</button>
      </div>`;
    $('#save').onclick = async () => {
      const price = num($('#price').value);
      if (price < 0 || $('#price').value === '') return toast('Enter a valid price', true);
      try {
        must(await db.from('settings').upsert([
          { key: 'price_per_portion', value: String(price) },
          { key: 'currency', value: $('#cur').value.trim() || '₹' }
        ]));
        await loadSettings();
        toast('Settings saved');
      } catch (e) { fail(e); }
    };
  }

  /* ---------- router ---------- */
  const routes = { dashboard, print: printScreen, payments, students: studentsScreen, reports, settings: settingsScreen };

  async function router() {
    const [, name = 'dashboard', arg] = location.hash.replace(/^#/, '').split('/');
    const fn = routes[name] || dashboard;
    document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.r === (routes[name] ? name : 'dashboard')));
    view.innerHTML = '<div class="loading">Loading…</div>';
    window.scrollTo(0, 0);
    try { await fn(arg); } catch (e) { fail(e); view.innerHTML = `<div class="card empty">Could not load this screen: ${esc(e.message)}</div>`; }
  }

  function setupNotice() {
    view.innerHTML = `<div class="card setup"><h1>Connect Supabase</h1>
      <p>Open <code>config.js</code> and paste your <b>Project URL</b> and <b>anon public key</b>, then reload.</p>
      <p>If you haven't yet, run <code>schema.sql</code> in the Supabase SQL Editor first.</p></div>`;
  }

  async function init() {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return setupNotice();
    db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    try { await loadSettings(); } catch (e) { fail(e); }
    window.addEventListener('hashchange', router);
    router();
  }
  init();
})();
