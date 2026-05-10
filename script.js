// ==================== SCHEDULE API ====================
class ScheduleAPI {
  constructor() {
    this.allLessons = [];
    this.filteredLessons = [];
    this.zjazdy = [];
    this.weeks = [];
    this.loaded = false;
    this.currentZjazdIndex = 0;
    this.currentDayDate = null;
    this.profile = null;
    this.uniqueKierunki = [];
  }

  async init() {
    try {
      const res = await fetch('main.json');
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid data');
      this.allLessons = data;
      this.allLessons.sort((a, b) => {
        const dA = new Date((a._SYS_NW_dataOd || a.dataZajec.substring(0, 10)) + 'T' + a.godzinaOd);
        const dB = new Date((b._SYS_NW_dataOd || b.dataZajec.substring(0, 10)) + 'T' + b.godzinaOd);
        return dA - dB;
      });
      this.uniqueKierunki = this.getUniqueValues(this.allLessons, 'kierunek');
      this.loaded = true;
    } catch (e) {
      console.error('Failed to load main.json', e);
    }
  }

  // Helpers
  getUniqueValues(lessons, key) {
    return [...new Set(lessons.filter(l => l[key]).map(l => l[key]))].sort();
  }

  getLessonDate(l) {
    return (l._SYS_NW_dataOd || l._SYS_NW_data_od || l.dataZajec || '').substring(0, 10);
  }

  now() { return new Date(); }

  getCurrentTime() {
    const n = this.now();
    return n.getHours() * 60 + n.getMinutes();
  }

  timeToMinutes(t) {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  }

  getTodayStr() {
    const n = this.now();
    return n.toISOString().substring(0, 10);
  }

  // Filter by profile
  applyProfile(profile) {
    this.profile = profile;
    if (!profile || !profile.grupa) { this.filteredLessons = []; return; }

    const { wydzial: w, kierunek: k, forma: f, specjalnosc: s, grupa: g } = profile;

    const getGroupSignature = (gn) => {
      if (!gn) return '';
      // Remove common prefix words but keep years/markers
      let str = gn.toLowerCase().replace(/[.,_]/g, ' ').replace(/\s+/g, ' ');
      const stops = ['ćwiczeniowa','cwiczeniowa','wykładowa','wykladowa','laboratoryjna','lab',
        'grupa','gr','stopnia','z','l','s','dzienna','zaoczne','stac','nst','ns',
        'stacjonarne','niestacjonarne','informatyka','ekonomia','zarządzanie',
        'rolnictwo','pedagogika','i','ii','iii','iv','v'];
      
      // Filter out stop words and single digits (group numbers)
      return str.trim().split(' ').filter(w => {
        return w.length > 1 && !stops.includes(w);
      }).join(' ');
    };

    this.filteredLessons = this.allLessons.filter(l => {
      if (l.wydzial !== w || l.forma !== f) return false;

      const lType = (l.typPrzedmiotu || '').toLowerCase();
      const lGroup = (l.grupa || '').toLowerCase();
      
      const isLecture = lType.includes('wykład') || lType.includes('wyklad') || 
                        lGroup.includes('wykład') || lGroup.includes('wyklad') || lGroup.includes('wykladowa');

      // 1. Direct match (exact group and exact specialty)
      if (l.grupa === g && l.specjalnosc === s) return true;

      // 2. Logic for lectures and shared classes
      // Check if specialty matches or is general
      const specMatch = (l.specjalnosc === s || l.specjalnosc.toLowerCase().includes('ogóln') || l.specjalnosc.toLowerCase().includes('ogoln'));
      
      if (specMatch) {
        // If it's a lecture, it might be for the whole year (Wykładowa)
        if (isLecture) {
          const lSig = getGroupSignature(l.grupa);
          const tSig = getGroupSignature(g);
          
          // If signatures match (e.g., both contain "2023/24"), it's likely the same year/cohort
          if (lSig && tSig && (lSig === tSig || tSig.includes(lSig) || lSig.includes(tSig))) {
            return true;
          }
          
          // Fallback: if it's a lecture for the same major/form and contains "wykład"
          // we show it if the major matches (already checked via wydzial/forma/kierunek earlier)
          if (l.kierunek === k && (lGroup.includes('wykład') || lGroup.includes('wyklad'))) {
             // We still need to check the year to avoid seeing lectures from other years
             // The signature check above is the primary way for that.
          }
        }
      }
      
      return false;
    });

    if (f === 'niestacjonarne') {
      this.buildZjazdy();
    } else {
      this.buildWeeks();
    }
  }

  buildZjazdy() {
    this.zjazdy = [];
    let cur = [], lastDate = null;
    this.filteredLessons.forEach(l => {
      const ds = this.getLessonDate(l);
      const d = new Date(ds);
      if (!lastDate) { cur.push(l); }
      else {
        const diff = Math.abs(d - lastDate) / (1000 * 60 * 60 * 24);
        if (diff <= 3) cur.push(l);
        else { this.zjazdy.push(cur); cur = [l]; }
      }
      if (!lastDate || lastDate.getTime() !== d.getTime()) lastDate = d;
    });
    if (cur.length > 0) this.zjazdy.push(cur);
  }

  buildWeeks() {
    this.weeks = [];
    const byWeek = {};
    this.filteredLessons.forEach(l => {
      const ds = this.getLessonDate(l);
      const d = new Date(ds);
      const mon = new Date(d);
      mon.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const key = mon.toISOString().substring(0, 10);
      if (!byWeek[key]) byWeek[key] = [];
      byWeek[key].push(l);
    });
    this.weeks = Object.keys(byWeek).sort().map(k => byWeek[k]);
  }

  getGroups() {
    return this.profile?.forma === 'niestacjonarne' ? this.zjazdy : this.weeks;
  }

  getDaysInGroup(groupIdx) {
    const groups = this.getGroups();
    if (!groups[groupIdx]) return [];
    const dates = [...new Set(groups[groupIdx].map(l => this.getLessonDate(l)))].sort();
    return dates;
  }

  getLessonsForDay(groupIdx, dateStr) {
    const groups = this.getGroups();
    if (!groups[groupIdx]) return [];
    return groups[groupIdx].filter(l => this.getLessonDate(l) === dateStr)
      .sort((a, b) => a.godzinaOd.localeCompare(b.godzinaOd));
  }

  getGroupLabel(groupIdx) {
    const groups = this.getGroups();
    if (!groups[groupIdx]) return '';
    const days = this.getDaysInGroup(groupIdx);
    const first = new Date(days[0]);
    const months = ['Styczeń','Luty','Marzec','Kwiecień','Maj','Czerwiec','Lipiec','Sierpień','Wrzesień','Październik','Listopad','Grudzień'];
    if (this.profile?.forma === 'niestacjonarne') {
      return `${months[first.getMonth()]} / zjazd ${groupIdx + 1}`;
    } else {
      return `Tydzień ${groupIdx + 1}`;
    }
  }

  findCurrentGroupIndex() {
    const today = this.getTodayStr();
    const groups = this.getGroups();
    // Find group containing today
    for (let i = 0; i < groups.length; i++) {
      const days = this.getDaysInGroup(i);
      if (days.includes(today)) return i;
    }
    // Find nearest future group
    for (let i = 0; i < groups.length; i++) {
      const days = this.getDaysInGroup(i);
      if (days.length && days[days.length - 1] >= today) return i;
    }
    return groups.length > 0 ? groups.length - 1 : 0;
  }

  getCurrentLesson() {
    const today = this.getTodayStr();
    const now = this.getCurrentTime();
    const groups = this.getGroups();
    for (let i = 0; i < groups.length; i++) {
      const lessons = this.getLessonsForDay(i, today);
      for (const l of lessons) {
        const s = this.timeToMinutes(l.godzinaOd);
        const e = this.timeToMinutes(l.godzinaDo);
        if (now >= s && now < e) return l;
      }
    }
    return null;
  }
}

// ==================== APP ====================
const api = new ScheduleAPI();
let profileFormDataLoaded = false;

async function startApp() {
  showLoader(true);
  await api.init();
  showLoader(false);

  const saved = localStorage.getItem('userProfile');
  if (saved) {
    const profile = JSON.parse(saved);
    api.applyProfile(profile);
    updateProgramLabel(profile);
    setupZjazdSelector();
    const idx = api.findCurrentGroupIndex();
    api.currentZjazdIndex = idx;
    selectZjazd(idx);
    updateLiveState();
    setInterval(updateLiveState, 30000);
  } else {
    showNoProfile();
  }
}

function showLoader(show) {
  const c = document.getElementById('scheduleContent');
  if (show) {
    c.innerHTML = '<div class="scheduleLoader"><div class="spinner"></div><p>Ładowanie bazy danych...</p></div>';
  }
}

function showNoProfile() {
  const c = document.getElementById('scheduleContent');
  if (c) {
    c.innerHTML = `<div class="scheduleEmptyState">
      <i class="fa-solid fa-user-graduate"></i>
      <p>Ustaw swój profil, aby zobaczyć plan zajęć</p>
      <button onclick="openProfileSection()">Wybierz grupę</button>
    </div>`;
  }
  const prog = document.getElementById('scheduleProgram');
  if (prog) prog.textContent = '';
  const zs = document.getElementById('zjazdSelect');
  if (zs) zs.style.display = 'none';
}

function updateProgramLabel(profile) {
  const tag = profile.forma === 'niestacjonarne' ? 'NS' : 'S';
  const prog = document.getElementById('scheduleProgram');
  if (prog) prog.textContent = `${profile.kierunek} ${tag}`;
}

// ==================== ZJAZD SELECTOR ====================
function setupZjazdSelector() {
  const sel = document.getElementById('zjazdSelect');
  sel.style.display = '';
  sel.innerHTML = '';
  const groups = api.getGroups();
  groups.forEach((_, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = api.getGroupLabel(i);
    sel.appendChild(opt);
  });
  sel.addEventListener('change', () => selectZjazd(parseInt(sel.value)));
}

function selectZjazd(idx) {
  api.currentZjazdIndex = idx;
  const sel = document.getElementById('zjazdSelect');
  if (sel) sel.value = idx;

  const days = api.getDaysInGroup(idx);
  const sDate = document.getElementById('scheduleDate');
  const sSem = document.getElementById('scheduleSemester');
  
  if (days.length > 0) {
    const d = new Date(days[0]);
    const monthsPl = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
    if (sDate) sDate.textContent = `${d.getDate()} ${monthsPl[d.getMonth()]} ${d.getFullYear()}`;
    if (sSem) sSem.textContent = d.getMonth() >= 1 && d.getMonth() <= 7 ? 'Semestr Letni' : 'Semestr Zimowy';
  }

  setupDayNav(days);

  // Select today if in this group, else first day
  const today = api.getTodayStr();
  const dayToSelect = days.includes(today) ? today : (days[0] || null);
  if (dayToSelect) selectDay(dayToSelect);
  else if (document.getElementById('scheduleContent')) {
    document.getElementById('scheduleContent').innerHTML = '<div class="scheduleEmptyState"><p>Brak zajęć w tym zjeździe</p></div>';
  }
}

// ==================== DAY NAV ====================
function setupDayNav(daysWithClasses) {
  const nav = document.getElementById('scheduleNav');
  if (!nav) return;
  const buttons = nav.querySelectorAll('.scheduleNavButton');
  const dayOfWeekSet = new Set(daysWithClasses.map(d => new Date(d).getDay()));

  buttons.forEach(btn => {
    const dayNum = parseInt(btn.dataset.day);
    btn.classList.remove('scheduleNavButton--focus', 'scheduleNavButton--disabled');
    if (dayOfWeekSet.has(dayNum)) {
      btn.onclick = () => {
        const target = daysWithClasses.find(d => new Date(d).getDay() === dayNum);
        if (target) {
          buttons.forEach(b => b.classList.remove('scheduleNavButton--focus'));
          btn.classList.add('scheduleNavButton--focus');
          selectDay(target);
        }
      };
    } else {
      btn.classList.add('scheduleNavButton--disabled');
      btn.onclick = null;
    }
  });
}

function selectDay(dateStr) {
  api.currentDayDate = dateStr;
  const d = new Date(dateStr);
  const dayNum = d.getDay();
  const buttons = document.querySelectorAll('.scheduleNavButton');
  buttons.forEach(b => {
    b.classList.remove('scheduleNavButton--focus');
    if (parseInt(b.dataset.day) === dayNum) b.classList.add('scheduleNavButton--focus');
  });

  const sDate = document.getElementById('scheduleDate');
  if (sDate) {
    const monthsPl = ['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'];
    sDate.textContent = `${d.getDate()} ${monthsPl[d.getMonth()]} ${d.getFullYear()}`;
  }

  renderSchedule();
}

// ==================== RENDER SCHEDULE ====================
function renderSchedule() {
  const container = document.getElementById('scheduleContent');
  if (!container) return;
  container.innerHTML = '';

  const lessons = api.getLessonsForDay(api.currentZjazdIndex, api.currentDayDate);
  const now = api.getCurrentTime();
  const isToday = api.currentDayDate === api.getTodayStr();

  if (lessons.length === 0) {
    container.innerHTML = '<div class="scheduleEmptyState"><p>Brak zajęć w tym dniu</p></div>';
    return;
  }

  // Detect breaks between lessons
  const slots = [];
  for (let i = 0; i < lessons.length; i++) {
    slots.push({ type: 'lesson', data: lessons[i] });
    if (i < lessons.length - 1) {
      const curEnd = lessons[i].godzinaDo;
      const nextStart = lessons[i + 1].godzinaOd;
      if (curEnd && nextStart && curEnd < nextStart) {
        slots.push({ type: 'break', start: curEnd.substring(0, 5), end: nextStart.substring(0, 5) });
      }
    }
  }

  slots.forEach((slot, idx) => {
    const isLast = idx === slots.length - 1;

    if (slot.type === 'break') {
      const startM = api.timeToMinutes(slot.start);
      const endM = api.timeToMinutes(slot.end);
      let sc = '';
      if (isToday) {
        if (now >= endM) sc = 'slot-past';
        else if (now >= startM && now < endM) sc = 'slot-active';
      }
      container.insertAdjacentHTML('beforeend', `
        <div class="scheduleSlot ${sc}">
          <div class="slotTimeline">
            <div class="slotTimelineDot"></div>
            ${isLast ? '' : '<div class="slotTimelineLine"></div>'}
          </div>
          <div class="slotTime">
            <div class="slotTimeFrom">${slot.start}</div>
            <div class="slotTimeTo">${slot.end}</div>
          </div>
          <div class="slotBreakCard">Przerwa</div>
        </div>
      `);
      return;
    }

    const l = slot.data;
    const startM = api.timeToMinutes(l.godzinaOd);
    const endM = api.timeToMinutes(l.godzinaDo);
    let sc = '';
    if (isToday) {
      if (now >= endM) sc = 'slot-past';
      else if (now >= startM && now < endM) sc = 'slot-active';
    }

    let badgeClass = 'badge-wyklad';
    const tp = (l.typPrzedmiotu || '').toLowerCase();
    if (tp.includes('ćwiczenia') || tp.includes('cwiczenia')) badgeClass = 'badge-cwiczenia';
    else if (tp.includes('laborator')) badgeClass = 'badge-laboratorium';
    else if (tp.includes('lektorat') || tp.includes('język')) badgeClass = 'badge-lektorat';

    const badgeText = l.typPrzedmiotu || 'Zajęcia';
    const startTime = l.godzinaOd ? l.godzinaOd.substring(0, 5) : '--:--';
    const endTime = l.godzinaDo ? l.godzinaDo.substring(0, 5) : '--:--';

    container.insertAdjacentHTML('beforeend', `
      <div class="scheduleSlot ${sc}">
        <div class="slotTimeline">
          <div class="slotTimelineDot"></div>
          ${isLast ? '' : '<div class="slotTimelineLine"></div>'}
        </div>
        <div class="slotTime">
          <div class="slotTimeFrom">${startTime}</div>
          <div class="slotTimeTo">${endTime}</div>
        </div>
        <div class="slotCard">
          <div class="slotCardHeader">
            <span class="slotCardName">${l.przedmiot || 'Nieznany przedmiot'}</span>
            <span class="slotCardBadge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="slotCardTeacher">${l.dydaktyk || 'Brak informacji'}</div>
          <div class="slotCardMeta">
            <span><i class="fa-solid fa-location-dot"></i> ${l.lokalizacja || ''}</span>
            <span><i class="fa-solid fa-door-closed"></i> ${l.nazwaSali || '?'}</span>
          </div>
        </div>
      </div>
    `);
  });
}

// ==================== LIVE STATE ====================
function updateLiveState() {
  const lesson = api.getCurrentLesson();

  if (!lesson) {
    document.querySelectorAll('.ID_name').forEach(el => el.textContent = 'Brak zajęć');
    document.querySelectorAll('.ID_type').forEach(el => el.textContent = '-');
    document.querySelectorAll('.ID_room').forEach(el => el.textContent = '-');
    document.querySelectorAll('.ID_teacher').forEach(el => el.textContent = 'Czas wolny');
    document.querySelectorAll('.ID_start').forEach(el => el.textContent = '--:--');
    document.querySelectorAll('.ID_end').forEach(el => el.textContent = '--:--');
    document.querySelectorAll('.ID_countdown').forEach(el => el.textContent = '');
    updateProgress(0);
    return;
  }

  document.querySelectorAll('.ID_name').forEach(el => el.textContent = lesson.przedmiot || 'Zajęcia');
  document.querySelectorAll('.ID_type').forEach(el => el.textContent = lesson.typPrzedmiotu || 'Zajęcia');
  document.querySelectorAll('.ID_room').forEach(el => el.textContent = lesson.nazwaSali || '?');
  document.querySelectorAll('.ID_teacher').forEach(el => el.textContent = lesson.dydaktyk || '');
  const st = lesson.godzinaOd ? lesson.godzinaOd.substring(0, 5) : '--:--';
  const en = lesson.godzinaDo ? lesson.godzinaDo.substring(0, 5) : '--:--';
  document.querySelectorAll('.ID_start').forEach(el => el.textContent = st);
  document.querySelectorAll('.ID_end').forEach(el => el.textContent = en);

  const startM = api.timeToMinutes(lesson.godzinaOd);
  const endM = api.timeToMinutes(lesson.godzinaDo);
  const now = api.getCurrentTime();
  const remaining = endM - now;
  document.querySelectorAll('.ID_countdown').forEach(el => el.textContent = `${remaining} min do końca`);

  const total = endM - startM;
  const elapsed = now - startM;
  let perc = (elapsed / total) * 100;
  if (perc < 0) perc = 0;
  if (perc > 100) perc = 100;
  updateProgress(perc);
  renderSchedule();
}

function updateProgress(percent) {
  document.querySelectorAll('.progressBarSlider').forEach(s => s.style.width = percent + '%');
}

// ==================== PROFILE FORM ====================
function initProfileForm() {
  if (profileFormDataLoaded) return;
  if (!api.loaded) return;
  profileFormDataLoaded = true;

  const ws = document.getElementById('wydzial-select');
  const ks = document.getElementById('kierunek-select');
  const fs = document.getElementById('forma-select');
  const ss = document.getElementById('specjalnosc-select');
  const gs = document.getElementById('grupa-select');
  const saveBtn = document.getElementById('profileSaveBtn');

  function populate(sel, vals, def) {
    sel.innerHTML = `<option value="">${def}</option>`;
    vals.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
  }

  const wydzialy = api.getUniqueValues(api.allLessons, 'wydzial');
  populate(ws, wydzialy, '-- Wybierz wydział --');

  // Load saved values
  const saved = localStorage.getItem('userProfile');
  if (saved) {
    const p = JSON.parse(saved);
    ws.value = p.wydzial || '';
    if (p.wydzial) { ws.dispatchEvent(new Event('change')); }
    setTimeout(() => {
      ks.value = p.kierunek || '';
      if (p.kierunek) ks.dispatchEvent(new Event('change'));
      setTimeout(() => {
        fs.value = p.forma || '';
        if (p.forma) fs.dispatchEvent(new Event('change'));
        setTimeout(() => {
          ss.value = p.specjalnosc || '';
          if (p.specjalnosc) ss.dispatchEvent(new Event('change'));
          setTimeout(() => {
            gs.value = p.grupa || '';
            if (p.grupa) saveBtn.disabled = false;
          }, 50);
        }, 50);
      }, 50);
    }, 50);
  }

  ws.addEventListener('change', () => {
    const v = ws.value;
    ks.disabled = true; fs.disabled = true; ss.disabled = true; gs.disabled = true; saveBtn.disabled = true;
    ks.innerHTML = '<option value="">-- Wybierz kierunek --</option>';
    fs.innerHTML = '<option value="">-- Wybierz formę --</option>';
    ss.innerHTML = '<option value="">-- Wybierz specjalność --</option>';
    gs.innerHTML = '<option value="">-- Wybierz grupę --</option>';
    if (v) {
      const filtered = api.allLessons.filter(l => l.wydzial === v);
      populate(ks, api.getUniqueValues(filtered, 'kierunek'), '-- Wybierz kierunek --');
      ks.disabled = false;
    }
  });

  ks.addEventListener('change', () => {
    const w = ws.value, k = ks.value;
    fs.disabled = true; ss.disabled = true; gs.disabled = true; saveBtn.disabled = true;
    fs.innerHTML = '<option value="">-- Wybierz formę --</option>';
    ss.innerHTML = '<option value="">-- Wybierz specjalność --</option>';
    gs.innerHTML = '<option value="">-- Wybierz grupę --</option>';
    if (k) {
      const filtered = api.allLessons.filter(l => l.wydzial === w && l.kierunek === k);
      populate(fs, api.getUniqueValues(filtered, 'forma'), '-- Wybierz formę --');
      fs.disabled = false;
    }
  });

  fs.addEventListener('change', () => {
    const w = ws.value, k = ks.value, f = fs.value;
    ss.disabled = true; gs.disabled = true; saveBtn.disabled = true;
    ss.innerHTML = '<option value="">-- Wybierz specjalność --</option>';
    gs.innerHTML = '<option value="">-- Wybierz grupę --</option>';
    if (f) {
      const filtered = api.allLessons.filter(l => l.wydzial === w && l.kierunek === k && l.forma === f);
      populate(ss, api.getUniqueValues(filtered, 'specjalnosc'), '-- Wybierz specjalność --');
      ss.disabled = false;
    }
  });

  ss.addEventListener('change', () => {
    const w = ws.value, k = ks.value, f = fs.value, s = ss.value;
    gs.disabled = true; saveBtn.disabled = true;
    gs.innerHTML = '<option value="">-- Wybierz grupę --</option>';
    if (s) {
      const filtered = api.allLessons.filter(l => l.wydzial === w && l.kierunek === k && l.forma === f && l.specjalnosc === s);
      let grupy = api.getUniqueValues(filtered, 'grupa');
      const otherMajors = api.uniqueKierunki.filter(m => m.toLowerCase() !== k.toLowerCase());
      grupy = grupy.filter(g => {
        const gL = g.toLowerCase();
        const foreign = otherMajors.some(om => gL.includes(om.toLowerCase()));
        if (foreign) return gL.includes(k.toLowerCase());
        return true;
      });
      populate(gs, grupy, '-- Wybierz grupę --');
      gs.disabled = false;
    }
  });

  gs.addEventListener('change', () => { saveBtn.disabled = !gs.value; });

  saveBtn.addEventListener('click', () => {
    const profile = {
      wydzial: ws.value, kierunek: ks.value, forma: fs.value,
      specjalnosc: ss.value, grupa: gs.value
    };
    localStorage.setItem('userProfile', JSON.stringify(profile));
    api.applyProfile(profile);
    updateProgramLabel(profile);
    setupZjazdSelector();
    const idx = api.findCurrentGroupIndex();
    api.currentZjazdIndex = idx;
    selectZjazd(idx);
    updateLiveState();
    setInterval(updateLiveState, 30000);
    closeProfileSection();
  });
}

// ==================== PROFILE SECTION UI ====================
function openProfileSection() {
  document.getElementById('profileSection').style.display = 'block';
  document.body.style.overflow = 'hidden';
  initProfileForm();
}

function closeProfileSection() {
  document.getElementById('profileSection').style.display = 'none';
  document.body.style.overflow = '';
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  startApp();

  // Scroll dock logic
  const el = document.querySelector('#LiveWidget');
  const bottomDock = document.getElementById('bottomDock');
  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.intersectionRatio < 0.5) {
      bottomDock.classList.remove('hidden');
      bottomDock.style.display = 'flex';
    } else {
      bottomDock.classList.add('hidden');
      bottomDock.addEventListener('animationend', function handler() {
        if (bottomDock.classList.contains('hidden')) bottomDock.style.display = 'none';
        bottomDock.removeEventListener('animationend', handler);
      });
    }
  }, { threshold: 0.5 });
  if (el) observer.observe(el);
  else if (bottomDock) { bottomDock.classList.remove('hidden'); bottomDock.style.display = 'flex'; }

  // Profile buttons
  document.getElementById('profileSectionButton').addEventListener('click', openProfileSection);
  document.getElementById('closeProfileButton').addEventListener('click', closeProfileSection);
  const navProfileBtn = document.getElementById('navProfileBtn');
  if (navProfileBtn) navProfileBtn.addEventListener('click', openProfileSection);
});