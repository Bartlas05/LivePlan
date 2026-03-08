class ScheduleAPI {
  constructor(url = "plan.json") {
    this.url = url;
    this.data = null;
    this.loaded = false;
    this.currentDay = null; // 'friday', 'saturday', 'sunday'
  }

  async init() {
    try {
      const res = await fetch(this.url);
      this.data = await res.json();
      this.loaded = true;
      
      // Setup current day
      this.currentDay = this.getTodayKey() || 'friday'; // Default to friday if not weekend
      
      return this;
    } catch (e) {
      console.error("Failed to load plan.json", e);
    }
  }

  ensureLoaded() {
    if (!this.loaded) {
      throw new Error("ScheduleAPI not initialized.");
    }
  }

  // --- TIME HELPERS ---
  
  now() {
    return new Date();
  }

  getCurrentTime() {
    const n = this.now();
    return n.getHours() * 60 + n.getMinutes();
  }

  timeToMinutes(t) {
    if(!t) return 0;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  getTodayKey() {
    const day = this.now().getDay();
    if (day === 5) return "friday";
    if (day === 6) return "saturday";
    if (day === 0) return "sunday";
    return null;
  }

  // --- DATA ACCESS ---

  getPlanForDay(dayKey) {
    this.ensureLoaded();
    return this.data[dayKey] || [];
  }

  // --- LIVE LOGIC ---

  getCurrentLesson() {
    if (this.currentDay !== this.getTodayKey()) return null; // Not today
    
    const plan = this.getPlanForDay(this.currentDay);
    const now = this.getCurrentTime();

    for (let lesson of plan) {
      const start = this.timeToMinutes(lesson.start);
      const end = this.timeToMinutes(lesson.end);

      if (now >= start && now < end) {
        return lesson;
      }
    }
    return null;
  }

}

// --- APP CORE ---
const api = new ScheduleAPI();

async function startApp() {
  await api.init();
  
  setupNavigation();
  renderSchedule();
  updateLiveState(); // Initial run
  
  // Loop every 30 seconds
  setInterval(updateLiveState, 30 * 1000); 
}

function setupNavigation() {
  const navButtons = document.querySelectorAll(".scheduleNavButton");
  const navMap = ["friday", "saturday", "sunday"];

  // Initialize active button based on current day
  const defaultIndex = navMap.indexOf(api.currentDay);
  if (defaultIndex !== -1) {
    navButtons.forEach(b => b.classList.remove("scheduleNavButton--focus"));
    navButtons[defaultIndex].classList.add("scheduleNavButton--focus");
  }

  navButtons.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("scheduleNavButton--focus"));
      btn.classList.add("scheduleNavButton--focus");
      
      api.currentDay = navMap[idx];
      renderSchedule();
    });
  });
}

function renderSchedule() {
  const container = document.getElementById("scheduleContent");
  container.innerHTML = ""; // Clear
  
  const plan = api.getPlanForDay(api.currentDay);
  const now = api.getCurrentTime();
  const isToday = api.currentDay === api.getTodayKey();

  if (plan.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding: 20px; color: #a4a4a4;">Brak zajęć w tym dniu.</div>`;
    return;
  }

  plan.forEach(lesson => {
    const startMins = api.timeToMinutes(lesson.start);
    const endMins = api.timeToMinutes(lesson.end);
    
    // Style determinators
    let statusClass = "";
    if (isToday) {
      if (now >= endMins) statusClass = "slot-past";
      else if (now >= startMins && now < endMins) statusClass = "slot-active";
    }

    let html = "";

    if (lesson.break) {
      // BREAK BLOCK
      html = `
        <div class="scheduleSlot ${statusClass}">
            <div class="scheduleSlotTimeWrapper">
                <div class="scheduleSlotTimeWrapperFrom">${lesson.start}</div>
                <div class="scheduleSlotTimeWrapperTo">${lesson.end}</div>
            </div>
            <div class="scheduleSlotBreak">
                <div class="scheduleSlotBreakText">Przerwa</div>
            </div>
        </div>
      `;
    } else {
      // NORMAL OR KEYNOTE BLOCK
      let keynoteHtml = "";
      if (lesson.keynote && (lesson.keynote.title || lesson.keynote.note)) {
        keynoteHtml = `
          <div class="scheduleSlotActivityKeynote">
              <div class="scheduleSlotActivityKeynoteTitle">${lesson.keynote.title}</div>
              <div class="scheduleSlotActivityKeynoteNote">${lesson.keynote.note}</div>
          </div>
        `;
      }

      html = `
        <div class="scheduleSlot ${statusClass}">
            <div class="scheduleSlotTimeWrapper">
                <div class="scheduleSlotTimeWrapperFrom">${lesson.start}</div>
                <div class="scheduleSlotTimeWrapperTo">${lesson.end}</div>
            </div>
            <div class="scheduleSlotActivityWrapper">
                <div class="scheduleSlotActivityName">${lesson.name}</div>
                <div class="scheduleSlotActivityInfo">${lesson.type} • ${lesson.room}</div>
                ${keynoteHtml}
            </div>
        </div>
      `;
    }

    container.insertAdjacentHTML('beforeend', html);
  });
}

function updateLiveState() {
  const lesson = api.getCurrentLesson();
  
  const topWidget = document.getElementById("LiveWidget");
  const bottomDock = document.getElementById("bottomDock");
  
  if (!lesson) {
    // Empty State
    document.querySelectorAll(".ID_name").forEach(el => el.textContent = "Brak zajęć");
    document.querySelectorAll(".ID_type").forEach(el => el.textContent = "-");
    document.querySelectorAll(".ID_room").forEach(el => el.textContent = "-");
    document.querySelectorAll(".ID_teacher").forEach(el => el.textContent = "Czas wolny");
    document.querySelectorAll(".ID_start").forEach(el => el.textContent = "--:--");
    document.querySelectorAll(".ID_end").forEach(el => el.textContent = "--:--");
    
    updateProgress(0); // 0%
    return;
  }
  
  // Fill Data
  if (lesson.break) {
    document.querySelectorAll(".ID_name").forEach(el => el.textContent = "Przerwa");
    document.querySelectorAll(".ID_type").forEach(el => el.textContent = "Przerwa");
    document.querySelectorAll(".ID_room").forEach(el => el.textContent = "-");
    document.querySelectorAll(".ID_teacher").forEach(el => el.textContent = "Odpocznij");
  } else {
    document.querySelectorAll(".ID_name").forEach(el => el.textContent = lesson.name);
    document.querySelectorAll(".ID_type").forEach(el => el.textContent = lesson.type);
    document.querySelectorAll(".ID_room").forEach(el => el.textContent = lesson.room);
    document.querySelectorAll(".ID_teacher").forEach(el => el.textContent = lesson.teacher);
  }
  
  document.querySelectorAll(".ID_start").forEach(el => el.textContent = lesson.start);
  document.querySelectorAll(".ID_end").forEach(el => el.textContent = lesson.end);
  
  // Calculate Progress
  const startMins = api.timeToMinutes(lesson.start);
  const endMins = api.timeToMinutes(lesson.end);
  const now = api.getCurrentTime();
  
  const totalDuration = endMins - startMins;
  const elapsed = now - startMins;
  let perc = (elapsed / totalDuration) * 100;
  if(perc < 0) perc = 0;
  if(perc > 100) perc = 100;
  
  updateProgress(perc);
  
  // Rerender schedule periodically to catch real-time state changes on active slots
  renderSchedule();
}

function updateProgress(percent) {
  document.querySelectorAll(".progressBarSlider").forEach(slider => {
    slider.style.width = percent + "%";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Init App
  startApp();

  // Scroll dock logic
  const el = document.querySelector("#LiveWidget");
  const bottomDock = document.getElementById('bottomDock');

  const observer = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry.intersectionRatio < 0.5) {
      bottomDock.classList.remove('hidden');
      bottomDock.style.display = 'flex';
    } else {
      bottomDock.classList.add('hidden');
      bottomDock.addEventListener('animationend', function handler() {
        if (bottomDock.classList.contains('hidden')) {
          bottomDock.style.display = 'none';
        }
        bottomDock.removeEventListener('animationend', handler);
      });
    }
  }, { threshold: 0.5 });
  
  if (el) {
    observer.observe(el);
  } else if (bottomDock) {
    bottomDock.classList.remove('hidden');
    bottomDock.style.display = 'flex';
  }
});