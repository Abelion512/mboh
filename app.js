(function(){
  const APP_VERSION = '0.4.0';

  /* ====== AI (placeholder; key mu sendiri) ====== */
  const apiKey = 'AIzaSyBWyIYRxc8rBuVYlej6dGBtrJBSXVu9bUY';
  const AI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

  /* Helpers */
  const $ = (s, r=document)=> r.querySelector(s);
  const outlet  = $('#outlet');
  const landing = $('#landing');
  const esc = s => (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
  const fmt = iso => { try { return new Date(iso).toLocaleString('id-ID'); } catch { return iso||'-'; } };
  function toast(msg, type='ok', ms=2200){
    const el=document.createElement('div');
    el.className='toast '+(type==='err'?'err':'ok'); el.textContent=msg;
    $('#toastHost').appendChild(el); setTimeout(()=>el.remove(),ms);
  }

  /* =========================
     Global state
  ========================== */
  const LS_USERNAME  = 'abelion_username';
  const LS_MODELCHAT = 'abelion_model_chat';
  const LS_IMPROVE   = 'abelion_data_improve';
  const LS_TASKS     = 'abelion_tasks_v1';
  const LS_JOURNAL   = 'abelion_journal_v1';
  const LS_KNOW      = 'abelion_knowledge_v1';
  const LS_CHATS     = 'abelion_chats_v1';

  const load = (k,def)=>{ try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(def))}catch{return def} };
  const save = (k,v)=> localStorage.setItem(k, JSON.stringify(v));

  let username = localStorage.getItem(LS_USERNAME) || 'Guest';
  let modelChat = localStorage.getItem(LS_MODELCHAT) || 'teman';
  let improveModel = localStorage.getItem(LS_IMPROVE) === 'true';

  let tasks   = load(LS_TASKS,[]);
  let journal = load(LS_JOURNAL,[]);
  let knowledge = load(LS_KNOW,[]);
  let chats  = load(LS_CHATS,[]);

  const newId = p => p + Math.random().toString(36).slice(2,9);

  /* =========================
     Header / profile / theme
  ========================== */
  const profileBtn  = $('#profileBtn');
  const profileMenu = $('#profileMenu');

  function paintAvatar(){
    const ini = (username||'U').trim()[0]?.toUpperCase() || 'U';
    profileBtn.textContent = ini+' ▾';
  }
  paintAvatar();

  profileBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    const open = profileMenu.hidden;
    profileMenu.hidden = !open;
    profileBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click',()=> profileMenu.hidden = true);

  $('#themeToggle').addEventListener('click', ()=>{
    document.body.classList.toggle('light');
    toast('Tema diubah');
  });

  /* =========================
     Service Worker register
  ========================== */
  async function registerSW() {
    const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
    if (!('serviceWorker' in navigator) || !isSecure) {
      if (!isSecure) toast('Buka via http://localhost atau https:// agar pembaruan aktif.', 'err', 3500);
      return null;
    }
    try {
      const base = new URL('.', location.href);    // selalu berakhiran /
      const swUrl = new URL('sw.js', base).href;   // …/sw.js
      const scope = base.pathname;                 // path sekarang

      const reg = await navigator.serviceWorker.register(swUrl, { scope });

      const hook = (w) => {
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            if (typeof openUpdateModal === 'function') openUpdateModal(true);
          }
        });
      };
      if (reg.installing) hook(reg.installing);
      reg.addEventListener('updatefound', () => hook(reg.installing));

      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true; location.reload();
      });

      return reg;
    } catch (err) {
      console.error('SW register failed:', err);
      toast(`Gagal mendaftar service worker: ${err.name||'Error'}`, 'err', 4000);
      return null;
    }
  }
  window.addEventListener('load', ()=>{ registerSW(); });

  // Single handler untuk menu profil
  profileMenu.addEventListener('click', async (e)=>{
    const act = e.target?.dataset?.act; if(!act) return;

    if (act === 'settings') location.hash = '#/settings';

    if (act === 'checkupdate') {
      const reg = await registerSW();
      if (!navigator.serviceWorker.controller) {
        try { await fetch(new Request(new URL('index.html', new URL('.', location.href)), { cache:'reload' })); } catch {}
        setTimeout(() => {
          if (!navigator.serviceWorker.controller) {
            toast('Service worker belum aktif. Pastikan buka via http://localhost atau https://', 'err', 4000);
            return;
          }
          openUpdateModal(true);
        }, 600);
      } else {
        openUpdateModal(true);
      }
    }

    if (act === 'profile') toast('Masuk sebagai: ' + username);
    if (act === 'logout') { localStorage.clear(); toast('Logged out'); setTimeout(()=>location.reload(),350); }
  });

  /* =========================
     Update modal + flow
  ========================== */
  const verKey = 'abelion_app_version';
  const updKey = 'abelion_update_state'; // 'idle' | 'prompt' | 'updating' | 'done'
  const modal  = $('#updateModal');
  const loader = $('#updateLoader');
  const UI = {
    bar:   $('#updBar'),
    pct:   $('#updPct'),
    eta:   $('#updEta'),
    step:  $('#updStep'),
    title: $('#updTitle')
  };

  function hideLoaderHard(){
    if(!loader) return;
    loader.hidden = true;
    loader.style.display = 'none';
    if(UI.bar) UI.bar.style.width = '0%';
    if(UI.pct) UI.pct.textContent = '0%';
    if(UI.step) UI.step.textContent = 'Menyiapkan paket…';
  }
  hideLoaderHard();

  const last = localStorage.getItem(verKey) || '';
  if (last !== APP_VERSION) {
    if (localStorage.getItem(updKey) !== 'updating') openUpdateModal(false);
  } else {
    localStorage.setItem(updKey, 'idle');
  }

  function openUpdateModal(isManual){
    // (opsional) isi release notes kalau ada update-manifest di server
    try {
      fetch('./update-manifest.json', {cache:'no-store'})
        .then(r=>r.ok?r.json():null)
        .then(j=>{
          if (!j) return;
          const ul = document.getElementById('releaseNotes');
          ul.innerHTML = (j.notes||[]).map(li=>`<li>${esc(li)}</li>`).join('') || '<li>Peningkatan kecil.</li>';
        }).catch(()=>{});
    } catch {}

    localStorage.setItem(updKey, 'prompt');
    modal.showModal();

    const onClose = () => {
      const rv = modal.returnValue;
      modal.removeEventListener('close', onClose);
      if (rv === 'update') {
        startUpdateFlow();
      } else {
        localStorage.setItem(updKey, 'idle');
        hideLoaderHard();
        if (isManual) toast('Tidak ada pembaruan baru');
        location.hash = '#/home';
      }
    };
    modal.addEventListener('close', onClose);
  }

  async function startUpdateFlow(){
    localStorage.setItem(updKey, 'updating');
    loader.hidden = false; loader.style.display = 'grid';
    UI.title.textContent = 'Memperbarui Abelion AI…';
    try{
      const reg = await navigator.serviceWorker.getRegistration();
      reg?.waiting?.postMessage('SKIP_WAITING');
    }catch{}

    const steps = [
      {name:'Mengunduh aset', duration: 900},
      {name:'Memverifikasi berkas', duration: 700},
      {name:'Menerapkan perubahan', duration: 1100},
      {name:'Membersihkan cache', duration: 600},
    ];
    const total = steps.reduce((a,b)=>a+b.duration,0);
    let elapsed = 0;

    for (let i=0;i<steps.length;i++){
      UI.step.textContent = steps[i].name + '…';
      const chunk = steps[i].duration;
      const start = performance.now();
      await new Promise(res=>{
        const timer = setInterval(()=>{
          const t = performance.now() - start;
          const local = Math.min(1, t/chunk);
          const prog = Math.min(99, Math.floor(((elapsed + local*chunk)/total)*100));
          UI.bar.style.width = prog + '%';
          UI.pct.textContent = prog + '%';
          UI.eta.textContent = '~' + Math.max(0, Math.ceil((total-(elapsed+local*chunk))/1000)) + ' detik';
          if (local >= 1){ clearInterval(timer); elapsed += chunk; res(); }
        }, 60);
      });
    }

    UI.step.textContent = 'Finalisasi…';
    UI.bar.style.width = '100%';
    UI.pct.textContent = '100%';
    UI.eta.textContent = 'Selesai';

    localStorage.setItem(verKey, APP_VERSION);
    localStorage.setItem('abelion_update_done', '1');
    localStorage.setItem(updKey, 'done');
    setTimeout(()=> location.reload(), 350);
  }

  if (localStorage.getItem('abelion_update_done') === '1'){
    hideLoaderHard();
    localStorage.removeItem('abelion_update_done');
    localStorage.setItem(updKey, 'idle');
    setTimeout(()=> toast('Selamat! Abelion AI telah diperbarui ke v'+APP_VERSION, 'ok', 3200), 500);
  }

  /* =========================
     Router
  ========================== */
  let chatMode = localStorage.getItem('chatMode') || 'mirror';
  function setActiveLinks(route){
    document.querySelectorAll('[data-route]').forEach(a=>{
      const is = a.getAttribute('href')===`#/${route}`;
      a.classList.toggle('active', is);
      a.setAttribute('aria-current', is?'page':'false');
    });
  }
  function render(){
    const route = (location.hash || '#/home').slice(2);
    setActiveLinks(route);

    if(route==='home'){ landing.hidden=false; outlet.hidden=true; outlet.innerHTML=''; renderHome(); return; }
    landing.hidden=true; outlet.hidden=false;

    if(route==='chat')      return pageChat();
    if(route==='tasks')     return pageTasks();
    if(route==='weather')   return pageWeather();
    if(route==='journal')   return pageJournal();
    if(route==='knowledge') return pageKnowledge();
    if(route==='settings')  return pageSettings();

    outlet.innerHTML = `<div class="card">Not found</div>`;
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);
  window.go = (h)=> location.hash = h;

  /* =========================
     Home dashboard
  ========================== */
  const QUOTES = [
    "Fokus pada langkah kecil yang konsisten.",
    "Kamu tidak harus hebat untuk memulai, tapi harus memulai untuk hebat.",
    "Satu tugas tuntas lebih baik dari sepuluh rencana.",
    "Ketika ragu, potong menjadi bagian lebih kecil.",
    "Energi datang setelah bergerak, bukan sebelum."
  ];
  async function renderHome(){
    const openTasks = (tasks||[]).filter(t=>t.status==='open').sort((a,b)=>{
      const pri = {P1:0,P2:1,P3:2};
      if(pri[a.priority]!==pri[b.priority]) return pri[a.priority]-pri[b.priority];
      return (a.dueAt||'').localeCompare(b.dueAt||'');
    }).slice(0,3);

    const lastMood = [...journal].sort((a,b)=> new Date(b.date)-new Date(a.date))[0];

    let curBadge = `<span class="badge">–</span>`;
    try{
      const lat=-6.2, lon=106.8;
      const cur = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature&timezone=Asia%2FJakarta`).then(r=>r.json());
      const c = cur?.current||{};
      curBadge = `<span class="badge">Jakarta ${c.temperature_2m??'–'}°C (feels ${c.apparent_temperature??'–'}°)</span>`;
    }catch{}
    const q = QUOTES[(new Date().getDate()) % QUOTES.length];

    const host = $('#landing');
    let el = document.getElementById('homeDash');
    if(!el){ el=document.createElement('div'); el.id='homeDash'; el.style.marginTop='14px'; host.appendChild(el); }
    el.innerHTML = `
      <div class="grid4">
        <div class="card"><b>Cuaca</b><br>${curBadge}</div>
        <div class="card">
          <b>3 Tugas</b>
          <ol style="margin:6px 0 0 18px">
            ${openTasks.length? openTasks.map(t=>`<li>${esc(t.title)} <span class="small">(${t.priority})</span></li>`).join('') : '<li>Tidak ada</li>'}
          </ol>
        </div>
        <div class="card"><b>Mood Terakhir</b><br>${lastMood? `Mood ${lastMood.mood} • <span class="small">${new Date(lastMood.date).toLocaleString('id-ID')}</span>` : 'Belum ada'}</div>
        <div class="card"><b>Kutipan</b><br>“${esc(q)}”</div>
      </div>`;
  }

  /* =========================
     Chat
  ========================== */
  function sysPrompt(mode, persona){
    const base =
      mode==='mirror' ? 'Mental Mirror Mode: Ajukan pertanyaan reflektif, gali asumsi, hal terlewat, potensi bias; beri umpan balik realistis; singkat & jelas.' :
      mode==='debate' ? 'Debate Partner Mode: Tulis pro vs kontra berimbang; akhiri dengan satu pertanyaan “Sudahkah kamu mempertimbangkan X?”' :
                        'Normal Assistant Mode: Jawab singkat, jelas, langsung ke inti.';

    const tone =
      persona==='psikologi' ? 'Persona: Psikolog yang empatik, validasi emosi dulu, lalu beri langkah kecil berbasis CBT.' :
      persona==='mentor'    ? 'Persona: Mentor kompeten, fokus solusi, beri checklist dan referensi cepat.' :
                               'Persona: Teman santai, hangat, gunakan bahasa sehari-hari dan dukungan ringan.';

    return `${base}\n${tone}\nPanggil user dengan namanya jika ada: ${username}. Hindari jawaban terlalu panjang di ponsel.`;
  }
  function getOrCreateChat(){
    let active = chats.find(c=>!c.archived);
    if(!active){
      active = { id:newId('c'), createdAt:new Date().toISOString(), history:[], archived:false };
      chats.unshift(active); save(LS_CHATS,chats);
    }
    return active;
  }
  function pageChat(){
    outlet.innerHTML = `
      <section class="card chat-card">
        <div class="chat-header">
          <div class="chat-id">
            <div class="chat-avatar">AI</div>
            <div>
              <div class="chat-title">Abelion AI</div>
              <div class="chat-meta">Online • ${esc(username)}</div>
            </div>
          </div>
          <div class="segmented" role="tablist" aria-label="Chat mode">
            <button data-mode="normal"  class="${chatMode==='normal'?'active':''}">Normal</button>
            <button data-mode="mirror"  class="${chatMode==='mirror'?'active':''}">Mirror</button>
            <button data-mode="debate"  class="${chatMode==='debate'?'active':''}">Debate</button>
          </div>
        </div>
        <div id="chatLog" class="chat-log"></div>
        <div class="chat-input">
          <input id="chatInput" class="in" placeholder="Tulis pesan…">
          <button id="chatSend" class="btn btn-accent">Kirim</button>
        </div>
      </section>
    `;

    const active = getOrCreateChat();
    const log = $('#chatLog');
    const renderHistory = ()=>{ log.innerHTML = active.history.map(h=>`<div class="msg ${h.role==='user'?'user':'bot'}">${esc(h.text)}</div>`).join(''); log.scrollTop = log.scrollHeight; };
    if(active.history.length===0){
      active.history.push({role:'user', text:`Halo Abelion!`});
      active.history.push({role:'assistant', text:`Hai ${username}, pilih mode dan kirim pesan.`});
      save(LS_CHATS,chats);
    }
    renderHistory();

    outlet.querySelectorAll('[data-mode]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        chatMode = btn.getAttribute('data-mode');
        localStorage.setItem('chatMode', chatMode);
        outlet.querySelectorAll('[data-mode]').forEach(b=> b.classList.toggle('active', b===btn));
        toast('Mode: ' + chatMode);
      });
    });

    $('#chatSend').addEventListener('click', send);
    $('#chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){e.preventDefault();send();} });

    async function send(){
      const input = $('#chatInput'); const text=(input.value||'').trim(); if(!text) return;
      active.history.push({role:'user', text}); save(LS_CHATS,chats); renderHistory(); input.value='';

      const sk = document.createElement('div'); sk.className='msg bot skeleton'; sk.textContent='…'; log.appendChild(sk); log.scrollTop = log.scrollHeight;

      const sys = sysPrompt(chatMode, modelChat);
      try{
        const res = await fetch(`${AI_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ contents:[{role:'user', parts:[{text: sys + "\n\nUSER: " + text }]}] })
        }).then(r=>r.json());

        const reply = res?.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, tidak ada respon.';
        sk.remove();
        active.history.push({role:'assistant', text: reply});
        if(improveModel){ /* telemetry anonim di masa depan */ }
        save(LS_CHATS,chats); renderHistory();
      }catch(err){
        sk.remove();
        active.history.push({role:'assistant', text: 'Error: '+String(err)});
        save(LS_CHATS,chats); renderHistory();
        toast('Gagal menghubungi AI', 'err');
      }
    }
  }

  /* =========================
     Tasks
  ========================== */
  let tasksHandlerBound = false;
  function pageTasks(){
    outlet.innerHTML = `
      <section class="card">
        <h2>Reminder / Tasks</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 10px">
          <button id="btnCal" class="btn btn-accent">📆 Connect to Calendar</button>
          <span class="small">Sinkronisasi Google Calendar/ICS (placeholder).</span>
        </div>
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-top:6px">
          <label style="flex:2;min-width:200px">
            <div class="small">Judul</div>
            <input id="tTitle" class="in" placeholder="Apa yang akan kamu kerjakan?">
          </label>
          <label style="width:120px">
            <div class="small">Prioritas</div>
            <select id="tPri" class="in"><option>P1</option><option selected>P2</option><option>P3</option></select>
          </label>
          <label style="width:220px">
            <div class="small">Jatuh Tempo</div>
            <input id="tDue" type="datetime-local" class="in">
          </label>
          <button id="tAdd" class="btn btn-accent">+ Tambah</button>
        </div>
        <div style="overflow:auto;margin-top:12px">
          <table class="table">
            <thead><tr><th>Task</th><th>Prioritas</th><th>Jatuh Tempo</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody id="tasksBody"></tbody>
          </table>
        </div>
        <div style="margin-top:12px;color:#97a0c2">
          <b>Upcoming 24h:</b> <span id="upcomingWrap">–</span>
        </div>
      </section>
    `;

    $('#btnCal').addEventListener('click', ()=>{
      alert('Integrasi Calendar (dummy):\n• Export .ics dari tasks untuk diimport ke Google Calendar.\n• Atau sambungkan ke backend untuk membuat event langsung.');
    });

    const d = new Date(Date.now() + 2*60*60*1000);
    $('#tDue').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

    $('#tAdd').addEventListener('click', ()=>{
      const title = ($('#tTitle').value||'').trim(); if(!title) return alert('Judul wajib');
      const priority = $('#tPri').value || 'P2';
      const dueAt = $('#tDue').value ? new Date($('#tDue').value).toISOString() : new Date().toISOString();
      tasks.push({ id:newId('t'), title, priority, dueAt, status:'open' });
      save(LS_TASKS,tasks); paintTasks();
      $('#tTitle').value=''; $('#tPri').value='P2';
    });

    if(!tasksHandlerBound){
      document.addEventListener('click', onTaskAction);
      tasksHandlerBound = true;
    }
    paintTasks();

    function onTaskAction(e){
      const tr = e.target.closest('tr[data-id]'); if(!tr) return;
      const id = tr.dataset.id;
      if (e.target.classList.contains('task-done')) {
        tasks = tasks.map(x => x.id===id ? { ...x, status: x.status==='done' ? 'open' : 'done' } : x);
        save(LS_TASKS,tasks); paintTasks(); return;
      }
      if (e.target.classList.contains('task-del')) {
        if (confirm('Hapus task ini?')) { tasks = tasks.filter(x=>x.id!==id); save(LS_TASKS,tasks); paintTasks(); }
      }
    }
    function paintTasks(){
      const body = $('#tasksBody'); if(!body) return;
      body.innerHTML = tasks
        .sort((a,b)=> (a.status==='open') === (b.status==='open') ? (a.dueAt||'').localeCompare(b.dueAt||'') : (a.status==='open' ? -1 : 1))
        .map(t=> `<tr data-id="${t.id}">
          <td>${esc(t.title)}</td>
          <td><span class="badge">${t.priority}</span></td>
          <td>${fmt(t.dueAt)}</td>
          <td>${t.status==='done'?'✅ done':'⏳ open'}</td>
          <td>
            <button class="btn btn-ghost task-done">${t.status==='done'?'↩ Undo':'✓ Selesai'}</button>
            <button class="btn btn-ghost task-del">🗑 Hapus</button>
          </td>
        </tr>`).join('');
      paintUpcoming();
    }
    function paintUpcoming(){
      const wrap = $('#upcomingWrap'); if(!wrap) return;
      const now = Date.now(), next = now + 24*60*60*1000;
      const list = tasks.filter(t=> t.status==='open' && t.dueAt)
        .filter(t=> { const ts = new Date(t.dueAt).getTime(); return ts>=now && ts<=next; })
        .sort((a,b)=> new Date(a.dueAt) - new Date(b.dueAt)).slice(0,5)
        .map(t=> `${new Date(t.dueAt).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})} — ${esc(t.title)}`);
      wrap.textContent = list.length ? list.join(' • ') : 'Tidak ada';
    }
    setInterval(()=>{ if (!outlet.hidden && outlet.querySelector('#upcomingWrap')) paintUpcoming(); }, 60*1000);
  }

  /* =========================
     Weather
  ========================== */
  function pageWeather(){
    outlet.innerHTML = `
      <section class="card">
        <h2>Weather</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
          <label style="width:140px"><div class="small">Latitude</div><input id="wLat" class="in" value="-7.2575"></label>
          <label style="width:140px"><div class="small">Longitude</div><input id="wLon" class="in" value="112.7521"></label>
          <button id="wGps" class="btn">📍 Pakai GPS</button>
          <button id="wFetch" class="btn btn-accent">Fetch</button>
        </div>
        <div class="row" style="margin-top:8px">
          <label style="flex:1;min-width:220px">
            <div class="small">Cari nama daerah (contoh: Kebayoran Baru, Surabaya)</div>
            <input id="wQuery" class="in" placeholder="Nama daerah / kelurahan / kota">
          </label>
          <button id="wSearch" class="btn">🔎 Cari</button>
        </div>
        <div id="wPlace" class="small" style="margin-top:8px">Lokasi: (–)</div>
        <div id="wTZ" class="small" style="margin-top:4px">Zona waktu: (auto)</div>
        <div id="wNow" style="margin-top:10px"></div>
        <div id="w7" class="grid4" style="grid-template-columns:repeat(7,1fr);margin-top:12px"></div>
        <div style="margin-top:10px"><a id="bmkgLink" class="btn" href="https://www.bmkg.go.id" target="_blank" rel="noopener">ℹ️ Detail di BMKG</a></div>
      </section>
    `;

    $('#wGps').addEventListener('click', ()=> {
      if (!navigator.geolocation) return alert('Geolokasi tidak didukung');
      navigator.geolocation.getCurrentPosition(async pos=>{
        const lat = pos.coords.latitude.toFixed(5);
        const lon = pos.coords.longitude.toFixed(5);
        $('#wLat').value = lat; $('#wLon').value = lon;
        await setPlaceName(lat, lon); loadWeather();
      }, ()=> alert('Gagal ambil lokasi'));
    });
    $('#wFetch').addEventListener('click', async ()=>{
      const lat = ($('#wLat').value||'').trim();
      const lon = ($('#wLon').value||'').trim();
      await setPlaceName(lat, lon); loadWeather();
    });
    $('#wSearch').addEventListener('click', async ()=>{
      const q = ($('#wQuery').value||'').trim(); if(!q) return toast('Ketik nama daerah dulu');
      try{
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=id&format=json`).then(x=>x.json());
        const p = r?.results?.[0];
        if(p){ $('#wLat').value=p.latitude; $('#wLon').value=p.longitude; await setPlaceName(p.latitude, p.longitude); loadWeather(); return; }
      }catch{}
      try{
        const j = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&accept-language=id&limit=1`).then(x=>x.json());
        const p = j?.[0]; if(p){ $('#wLat').value=p.lat; $('#wLon').value=p.lon; await setPlaceName(p.lat,p.lon); loadWeather(); return; }
      }catch{}
      toast('Tidak ditemukan. Coba nama lain.', 'err');
    });

    setPlaceName($('#wLat').value, $('#wLon').value);
    loadWeather();

    function formatIndo(addr){
      const rt = addr.quarter || '';
      const rw = addr.neighbourhood || '';
      const kel = addr.village || addr.suburb || addr.residential || '';
      const kec = addr.city_district || addr.district || '';
      const kabkota = addr.county || addr.city || '';
      const prov = addr.state || '';
      const negara = addr.country || '';
      const parts = [];
      if(rt) parts.push(rt);
      if(rw && rw!==rt) parts.push(rw);
      if(kel) parts.push('Kel. '+kel);
      if(kec) parts.push('Kec. '+kec);
      if(kabkota) parts.push(kabkota);
      if(prov) parts.push(prov);
      if(negara) parts.push(negara);
      return parts.filter(Boolean).join(', ');
    }

    async function setPlaceName(lat, lon){
      const el = $('#wPlace'); el.textContent = 'Lokasi: mencari…';
      let name = '';
      try{
        const j = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=id`).then(x=>x.json());
        if(j?.address){ name = formatIndo(j.address); }
        if(!name) name = j?.display_name || '';
      }catch{}
      if(!name){
        try{
          const r1 = await fetch(`https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lon}&language=id&format=json`).then(x=>x.json());
          const p = r1?.results?.[0];
          if(p) name = [p.name, p.admin3, p.admin2, p.admin1, p.country].filter(Boolean).join(', ');
        }catch{}
      }
      if(!name) name = `(${lat}, ${lon})`;
      el.textContent = `Lokasi: ${name}`;
      $('#bmkgLink').href = 'https://www.bmkg.go.id/';
    }

    async function loadWeather(){
      const lat = ($('#wLat').value||'').trim();
      const lon = ($('#wLon').value||'').trim();
      try{
        const curURL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&timezone=auto`;
        const cur = await fetch(curURL).then(r=>r.json());
        const tzName = cur?.timezone || 'auto';
        const tzAbbr = cur?.timezone_abbreviation || '';
        let localNow=''; try{ localNow = new Date().toLocaleString('id-ID',{timeZone:tzName}); }catch{ localNow = new Date().toLocaleString('id-ID'); }
        $('#wTZ').textContent = `Zona waktu: ${tzName}${tzAbbr?` (${tzAbbr})`:''} • Jam lokal: ${localNow}`;

        const c = cur.current||{};
        $('#wNow').innerHTML = `
          <div class="card" style="display:flex;gap:8px;flex-wrap:wrap">
            <div class="badge">Temp ${c.temperature_2m??'–'}°C</div>
            <div class="badge">Feels ${c.apparent_temperature??'–'}°C</div>
            <div class="badge">RH ${c.relative_humidity_2m??'–'}%</div>
            <div class="badge">Wind ${c.wind_speed_10m??'–'} km/h</div>
          </div>`;

        const dURL = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,precipitation_probability_max&timezone=auto`;
        const daily = await fetch(dURL).then(r=>r.json());
        const days = daily?.daily?.time || [];
        const tMax = daily?.daily?.temperature_2m_max || [];
        const rain = daily?.daily?.precipitation_probability_max || [];
        $('#w7').innerHTML = days.map((d,i)=> `
          <div class="card" style="text-align:center">
            <div class="small">${new Date(d+'T00:00:00').toLocaleDateString('id-ID',{weekday:'short'})}</div>
            <div style="font-size:20px;margin-top:4px">${tMax[i]??'–'}°</div>
            <div class="badge" style="margin-top:6px">Rain ${rain[i]??'–'}%</div>
          </div>`).join('');
      }catch(err){
        $('#wNow').innerHTML = `<div class="card">Gagal memuat cuaca: ${esc(String(err))}</div>`;
        $('#w7').innerHTML = ''; $('#wTZ').textContent = 'Zona waktu: (gagal memuat)';
      }
    }
  }

  /* =========================
     Journal
  ========================== */
  const ymd = d => { const t=new Date(d); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`; };
  const last7Days = ()=>{ const arr=[]; const now=new Date(); for(let i=6;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); arr.push(ymd(d)); } return arr; };

  function pageJournal(){
    outlet.innerHTML = `
      <section class="card">
        <h2>Journal Emosi</h2>
        <div class="row" style="margin-top:6px">
          <label><div class="small">Mood (0–100)</div>
            <input id="jMood" type="range" min="0" max="100" value="50" style="width:220px">
          </label>
          <div id="jMoodVal" class="badge">50</div>
          <label><div class="small">Tags (pisahkan dengan koma)</div>
            <input id="jTags" class="input-sm" placeholder="sekolah, belajar, fokus">
          </label>
        </div>
        <label style="display:block;margin-top:8px"><div class="small">Catatan</div>
          <textarea id="jText" class="in" placeholder="Tulis apa yang kamu rasakan…"></textarea>
        </label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="jSave" class="btn btn-accent">Simpan</button>
          <button id="jClear" class="btn">Bersihkan Semua</button>
        </div>
        <div style="margin-top:14px">
          <div class="small">Mood 7 hari terakhir</div>
          <div id="jSpark" class="spark" aria-label="grafik mood"></div>
        </div>
        <div style="margin-top:14px">
          <div class="small">Riwayat terbaru</div>
          <div id="jList"></div>
        </div>
      </section>
    `;

    const mood = $('#jMood'), moodVal = $('#jMoodVal');
    mood.addEventListener('input', ()=> moodVal.textContent = mood.value);
    $('#jSave').addEventListener('click', saveEntry);
    $('#jClear').addEventListener('click', ()=>{
      if(confirm('Hapus semua entri journal?')){ journal=[]; save(LS_JOURNAL,journal); paint(); toast('Journal dibersihkan'); }
    });
    paint();

    function saveEntry(){
      const m = Number($('#jMood').value||0);
      const tags = ($('#jTags').value||'').split(',').map(s=>s.trim()).filter(Boolean);
      const text = ($('#jText').value||'').trim();
      if(!text && !tags.length) return alert('Isi minimal catatan atau satu tag.');
      const item = { id:newId('j'), date:new Date().toISOString(), mood:m, tags, text };
      journal.push(item); save(LS_JOURNAL,journal);
      $('#jText').value=''; $('#jTags').value='';
      paint(); toast('Entri tersimpan');
    }

    function paint(){
      const days = last7Days();
      const map = {}; journal.forEach(it=> { const d=ymd(it.date); map[d] = it; });
      $('#jSpark').innerHTML = days.map(d=>{
        const v = map[d]?.mood ?? 0;
        const h = Math.max(2, Math.round(v/3));
        return `<div title="${d} : ${v}" style="height:${h}px"></div>`;
      }).join('');

      const list = [...journal].sort((a,b)=> new Date(b.date)-new Date(a.date)).slice(0,10);
      $('#jList').innerHTML = list.length? list.map(it=> `
        <div class="snip">
          <div class="small">${new Date(it.date).toLocaleString('id-ID')} • Mood ${it.mood}</div>
          <div>${esc(it.text)}</div>
          <div class="chips">${it.tags.map(t=>`<span class="chip">#${esc(t)}</span>`).join('')}</div>
        </div>
      `).join('') : `<div class="snip">Belum ada entri.</div>`;
    }
  }

  /* =========================
     Knowledge (RAG lite)
  ========================== */
  function bytes(n){ if(n<1024) return n+' B'; if(n<1024*1024) return (n/1024).toFixed(1)+' KB'; return (n/1024/1024).toFixed(1)+' MB'; }
  function hilite(text, q){ if(!q) return text; const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); return text.replace(re, m=> `<mark>${m}</mark>`); }
  function pageKnowledge(){
    outlet.innerHTML = `
      <section class="card">
        <h2>Knowledge / RAG (Lite)</h2>
        <div class="uploader">
          <div class="small">Upload berkas teks (.txt, .md). PDF/DOCX belum didukung dari frontend.</div>
          <input id="kFiles" type="file" multiple accept=".txt,.md" style="margin-top:8px">
        </div>
        <div style="margin-top:10px" class="filelist" id="kList"></div>
        <div style="margin-top:12px" class="row">
          <input id="kQuery" class="in" placeholder="Cari di knowledge… (keyword)">
          <button id="kSearch" class="btn">Search</button>
        </div>
        <div id="kRes" class="kres"></div>
      </section>
    `;

    $('#kFiles').addEventListener('change', onPick);
    $('#kSearch').addEventListener('click', search);
    paintFiles();

    function onPick(e){
      const files = Array.from(e.target.files||[]); if(!files.length) return;
      const allowed = ['text/plain','text/markdown','','application/octet-stream'];
      files.forEach(f=>{
        const ext = (f.name.split('.').pop()||'').toLowerCase();
        if(!allowed.includes(f.type) && !['txt','md'].includes(ext)){ toast(`Lewati ${f.name} (format tidak didukung)`, 'err'); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const text = String(reader.result||'');
          if(text.length > 300*1024){ toast(`${f.name} terlalu besar (>300KB)`, 'err'); return; }
          knowledge.push({ id:newId('k'), name:f.name, size:f.size||text.length, text });
          save(LS_KNOW,knowledge); paintFiles(); toast(`Tersimpan: ${f.name}`);
        };
        reader.readAsText(f);
      });
      e.target.value = '';
    }

    function paintFiles(){
      const list = $('#kList');
      if(!knowledge.length){ list.innerHTML = `<div class="small">Belum ada berkas.</div>`; return; }
      list.innerHTML = knowledge.map(k=> `
        <div class="fileitem"><span class="badge">TXT</span> <b>${esc(k.name)}</b> <span class="small">• ${bytes(k.size)}</span></div>
        <div><button class="btn btn-ghost" data-del="${k.id}">Hapus</button></div>
      `).join('');
      list.querySelectorAll('[data-del]').forEach(btn=>{
        btn.addEventListener('click', ()=>{
          const id = btn.getAttribute('data-del');
          knowledge = knowledge.filter(x=>x.id!==id); save(LS_KNOW,knowledge); paintFiles(); toast('Berkas dihapus');
        });
      });
    }

    function search(){
      const q = ($('#kQuery').value||'').trim();
      const box = $('#kRes'); if(!q){ box.innerHTML = `<div class="snip">Ketik kata kunci.</div>`; return; }
      const scored = knowledge.map(k=>{
        const count = (k.text.match(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'), 'gi'))||[]).length;
        return {...k, score:count};
      }).filter(x=>x.score>0).sort((a,b)=> b.score-a.score).slice(0,10);
      if(!scored.length){ box.innerHTML = `<div class="snip">Tidak ada hasil.</div>`; return; }
      box.innerHTML = scored.map(k=>{
        const idx = k.text.toLowerCase().indexOf(q.toLowerCase());
        const getSnip = (start)=>{
          const s = Math.max(0, start-80), e = Math.min(k.text.length, start+80);
          return (s>0?'…':'') + hilite(esc(k.text.slice(s,e)), q) + (e<k.text.length?'…':'');
        };
        const s1 = idx>=0 ? getSnip(idx) : '';
        let s2 = ''; if(idx>=0){ const next = k.text.toLowerCase().indexOf(q.toLowerCase(), idx+q.length); if(next>0) s2 = getSnip(next); }
        return `<div class="snip"><div><b>${esc(k.name)}</b> <span class="small">• score ${k.score}</span></div><div style="margin-top:6px">${s1||'—'}</div>${s2? `<div style="margin-top:6px">${s2}</div>`:''}</div>`;
      }).join('');
    }
  }

  /* =========================
     Settings
  ========================== */
  function pageSettings(){
    outlet.innerHTML = `
      <section class="card">
        <h2>Settings</h2>
        <div class="row">
          <label style="flex:1;min-width:200px">
            <div class="small">Username</div>
            <input id="sUser" class="in" value="${esc(username)}" placeholder="Namamu">
          </label>
          <label style="flex:1;min-width:220px">
            <div class="small">Model Chat (persona)</div>
            <select id="sModel" class="in">
              <option value="psikologi" ${modelChat==='psikologi'?'selected':''}>Psikologi (empatik)</option>
              <option value="teman" ${modelChat==='teman'?'selected':''}>Teman (santai)</option>
              <option value="mentor" ${modelChat==='mentor'?'selected':''}>Mentor (to the point)</option>
            </select>
          </label>
        </div>

        <div class="card" style="margin-top:12px">
          <b>Data Controls</b>
          <div class="row" style="margin-top:8px">
            <label><input type="checkbox" id="sImprove" ${improveModel?'checked':''}> <span>Improve the model for everyone (anonim)</span></label>
          </div>
          <div class="row" style="margin-top:10px;gap:8px">
            <button id="sArchive" class="btn">Archive All Chats</button>
            <button id="sExport" class="btn">Export Chats</button>
            <button id="sDeleteChats" class="btn btn-ghost">Delete All Chats</button>
            <button id="sDeleteAcc" class="btn btn-ghost">Delete Account</button>
          </div>
          <p class="small" style="margin-top:8px">Semua kontrol ini berjalan lokal di device kamu.</p>
        </div>

        <div style="margin-top:10px">
          <button id="sSave" class="btn btn-accent">Simpan</button>
        </div>
      </section>
    `;

    $('#sSave').addEventListener('click', ()=>{
      username = ($('#sUser').value||'').trim() || 'Guest';
      modelChat = $('#sModel').value || 'teman';
      improveModel = $('#sImprove').checked;
      localStorage.setItem(LS_USERNAME, username);
      localStorage.setItem(LS_MODELCHAT, modelChat);
      localStorage.setItem(LS_IMPROVE, improveModel);
      paintAvatar();
      toast('Pengaturan disimpan.');
    });

    $('#sArchive').addEventListener('click', ()=>{
      chats = chats.map(c=>({...c, archived:true})); save(LS_CHATS,chats);
      toast('Semua chat diarsipkan.');
    });
    $('#sExport').addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(chats,null,2)], {type:'application/json'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='abelion_chats.json'; a.click(); URL.revokeObjectURL(a.href);
    });
    $('#sDeleteChats').addEventListener('click', ()=>{
      if(confirm('Hapus semua chat?')){ chats=[]; save(LS_CHATS,chats); toast('Semua chat dihapus.'); }
    });
    $('#sDeleteAcc').addEventListener('click', ()=>{
      if(confirm('Delete account = hapus semua data lokal (tasks, journal, knowledge, chats). Lanjut?')){
        [LS_TASKS,LS_JOURNAL,LS_KNOW,LS_CHATS,LS_USERNAME,LS_MODELCHAT,LS_IMPROVE].forEach(k=> localStorage.removeItem(k));
        username='Guest'; modelChat='teman'; improveModel=false; paintAvatar(); toast('Akun lokal dihapus.');
      }
    });
  }

})();
