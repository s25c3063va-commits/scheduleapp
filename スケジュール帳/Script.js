// --- PWA Service Worker 登録 ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('ServiceWorker registration note:', err);
    });
  });
}

// --- PWA インストールプロンプト制御 ---
let deferredPrompt;
const pwaInstallBtn = document.getElementById('pwa-install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (pwaInstallBtn) pwaInstallBtn.classList.remove('hidden');
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      pwaInstallBtn.classList.add('hidden');
    }
    deferredPrompt = null;
  });
}

// --- アプリ状態管理 (State) ---
let events = JSON.parse(localStorage.getItem('schedule_book_events')) || [];
let historyTemplates = JSON.parse(localStorage.getItem('schedule_book_history')) || [];
let currentDate = new Date();
let calendarDate = new Date();
let activeView = 'calendar';
let highlightedDateStr = null;
let selectedDateForSheet = null;

const colorMap = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  rose: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', dot: 'bg-rose-500' }
};

// DOM要素
const currentTimeEl = document.getElementById('current-time');
const currentDateEl = document.getElementById('current-date');
const btnCalendarView = document.getElementById('btn-calendar-view');
const btnListView = document.getElementById('btn-list-view');
const calendarViewContainer = document.getElementById('calendar-view-container');
const listViewContainer = document.getElementById('list-view-container');
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');

// ボトムナビ要素
const bottomNavCalendar = document.getElementById('bottom-nav-calendar');
const bottomNavList = document.getElementById('bottom-nav-list');
const bottomNavAdd = document.getElementById('bottom-nav-add');

// モーダル要素
const eventModal = document.getElementById('event-modal');
const modalCard = document.getElementById('modal-card');
const eventForm = document.getElementById('event-form');
const modalTitle = document.getElementById('modal-title');
const btnOpenAddModal = document.getElementById('btn-open-add-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');

// 日別詳細シート要素
const dayDetailSheet = document.getElementById('day-detail-sheet');
const daySheetTitle = document.getElementById('day-sheet-title');
const daySheetCount = document.getElementById('day-sheet-count');
const daySheetItems = document.getElementById('day-sheet-items');
const btnSheetAddEvent = document.getElementById('btn-sheet-add-event');
const btnCloseDaySheet = document.getElementById('btn-close-day-sheet');

const eventIdInput = document.getElementById('event-id');
const eventTitleInput = document.getElementById('event-title-input');
const eventDateInput = document.getElementById('event-date-input');
const eventTimeInput = document.getElementById('event-time-input');
const eventRepeatSelect = document.getElementById('event-repeat-select');
const eventCategoryInput = document.getElementById('event-category-input');
const eventDescriptionInput = document.getElementById('event-description-input');
const quickHistoryChips = document.getElementById('quick-history-chips');
const btnClearHistory = document.getElementById('btn-clear-history');

const filterPeriod = document.getElementById('filter-period');
const filterStatus = document.getElementById('filter-status');

document.addEventListener('DOMContentLoaded', () => {
  startRealtimeClock();
  renderCalendar();
  renderList();
  setupEventListeners();
  renderHistoryChips();
  setupSwipeGesture();
});

// 1. 時計機能
function startRealtimeClock() {
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const updateClock = () => {
    const now = new Date();
    currentDate = now;
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const day = dayNames[now.getDay()];
    
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    if (currentDateEl) currentDateEl.textContent = `${year}/${month}/${date}(${day})`;
    if (currentTimeEl) currentTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
  };

  updateClock();
  setInterval(updateClock, 1000);
}

// 2. イベントリスナー設定
function setupEventListeners() {
  // ビュー切替
  if (btnCalendarView) btnCalendarView.addEventListener('click', () => switchView('calendar'));
  if (btnListView) btnListView.addEventListener('click', () => switchView('list'));

  if (bottomNavCalendar) bottomNavCalendar.addEventListener('click', () => switchView('calendar'));
  if (bottomNavList) bottomNavList.addEventListener('click', () => switchView('list'));
  if (bottomNavAdd) bottomNavAdd.addEventListener('click', () => openModal());

  // 日別シート
  if (btnCloseDaySheet) btnCloseDaySheet.addEventListener('click', closeDaySheet);
  if (dayDetailSheet) {
    dayDetailSheet.addEventListener('click', (e) => {
      if (e.target === dayDetailSheet) closeDaySheet();
    });
  }
  if (btnSheetAddEvent) {
    btnSheetAddEvent.addEventListener('click', () => {
      closeDaySheet();
      openModal(null, selectedDateForSheet);
    });
  }

  // カレンダーナビ
  const btnPrev = document.getElementById('btn-prev-month');
  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      renderCalendar();
    });
  }

  const btnNext = document.getElementById('btn-next-month');
  if (btnNext) {
    btnNext.addEventListener('click', () => {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      renderCalendar();
    });
  }

  const btnToday = document.getElementById('btn-today');
  if (btnToday) {
    btnToday.addEventListener('click', () => {
      calendarDate = new Date();
      highlightedDateStr = formatDateKey(new Date());
      renderCalendar();
    });
  }

  // 検索
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      if (searchClearBtn) searchClearBtn.classList.toggle('hidden', query === '');
      if (query.length > 0 && activeView !== 'list') switchView('list');
      renderList();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.classList.add('hidden');
      renderList();
    });
  }

  if (filterPeriod) filterPeriod.addEventListener('change', renderList);
  if (filterStatus) filterStatus.addEventListener('change', renderList);

  // モーダル
  if (btnOpenAddModal) btnOpenAddModal.addEventListener('click', () => openModal());
  if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
  if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
  if (eventModal) {
    eventModal.addEventListener('click', (e) => {
      if (e.target === eventModal) closeModal();
    });
  }

  if (eventForm) eventForm.addEventListener('submit', handleFormSubmit);

  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', () => {
      historyTemplates = [];
      saveHistory();
      renderHistoryChips();
    });
  }
}

// スワイプジェスチャー（左右フリックで前月・次月）
function setupSwipeGesture() {
  const container = document.getElementById('calendar-grid');
  if (!container) return;

  let touchStartX = 0;
  let touchStartY = 0;

  container.addEventListener('touchstart', (e) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  container.addEventListener('touchend', (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // 水平方向のスワイプが垂直より大きく、かつ50px以上の移動がある場合
    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
      if (diffX > 0) {
        // 右スワイプ -> 前月へ
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
      } else {
        // 左スワイプ -> 次月へ
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderCalendar();
      }
    }
  }, { passive: true });
}

// 3. ビュー切替
function switchView(view) {
  activeView = view;
  if (!calendarViewContainer || !listViewContainer) return;

  if (view === 'calendar') {
    calendarViewContainer.classList.remove('hidden');
    listViewContainer.classList.add('hidden');
    listViewContainer.classList.remove('flex');
    
    if (btnCalendarView) btnCalendarView.className = "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-indigo-600 bg-white shadow-xs flex items-center gap-1";
    if (btnListView) btnListView.className = "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-1";
    
    // ボトムナビ状態
    if (bottomNavCalendar) bottomNavCalendar.className = "flex flex-col items-center justify-center py-1 text-indigo-600 transition-colors";
    if (bottomNavList) bottomNavList.className = "flex flex-col items-center justify-center py-1 text-slate-400 hover:text-slate-600 transition-colors";

    renderCalendar();
  } else {
    calendarViewContainer.classList.add('hidden');
    listViewContainer.classList.remove('hidden');
    listViewContainer.classList.add('flex');
    
    if (btnListView) btnListView.className = "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-indigo-600 bg-white shadow-xs flex items-center gap-1";
    if (btnCalendarView) btnCalendarView.className = "px-3 py-1.5 text-xs font-semibold rounded-lg transition-all text-slate-600 hover:text-slate-900 flex items-center gap-1";
    
    // ボトムナビ状態
    if (bottomNavList) bottomNavList.className = "flex flex-col items-center justify-center py-1 text-indigo-600 transition-colors";
    if (bottomNavCalendar) bottomNavCalendar.className = "flex flex-col items-center justify-center py-1 text-slate-400 hover:text-slate-600 transition-colors";

    renderList();
  }
}

// 4. カレンダー描画
function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  
  const monthYearEl = document.getElementById('calendar-month-year');
  if (monthYearEl) {
    monthYearEl.textContent = `${year}年 ${month + 1}月`;
  }
  
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayKey = formatDateKey(new Date());

  // 前月の余白
  for (let i = firstDay - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const cell = document.createElement('div');
    cell.className = "min-h-[58px] sm:min-h-[90px] p-1 bg-slate-50/50 rounded-xl text-slate-300 text-[10px] sm:text-xs select-none flex flex-col justify-between";
    cell.innerHTML = `<span class="font-medium opacity-60">${dayNum}</span>`;
    grid.appendChild(cell);
  }

  // 当月の日付
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const dateKey = formatDateKey(dateObj);
    const dayEvents = events.filter(e => e.date === dateKey);

    const cell = document.createElement('div');
    const isToday = dateKey === todayKey;
    const isHighlighted = dateKey === highlightedDateStr;

    let borderClass = "border-slate-100";
    let bgClass = "bg-white hover:border-indigo-200 active:bg-slate-50";

    if (isToday) {
      bgClass = "bg-indigo-50/40";
      borderClass = "border-indigo-300 font-bold";
    }

    cell.className = `min-h-[58px] sm:min-h-[90px] p-1 sm:p-1.5 rounded-xl border ${borderClass} ${bgClass} transition-all flex flex-col justify-between group cursor-pointer ${isHighlighted ? 'calendar-day-highlight' : ''}`;
    
    // セルクリック時: スマホでは日別詳細シート、PCでも日別シートまたは追加
    cell.onclick = () => {
      openDaySheet(dateKey, dateObj);
    };

    const dayNumSpan = document.createElement('span');
    dayNumSpan.className = `text-[10px] sm:text-[11px] font-bold inline-block px-1 rounded-md ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'}`;
    dayNumSpan.textContent = day;

    const cellHeader = document.createElement('div');
    cellHeader.className = "flex items-center justify-between mb-0.5";
    cellHeader.appendChild(dayNumSpan);

    // イベント件数インジケーター（スマホ向けドット表示）
    if (dayEvents.length > 0) {
      const dotWrap = document.createElement('div');
      dotWrap.className = "flex items-center gap-0.5 sm:hidden";
      dayEvents.slice(0, 3).forEach(ev => {
        const dot = document.createElement('span');
        const colorObj = colorMap[ev.color] || colorMap.blue;
        dot.className = `w-1.5 h-1.5 rounded-full ${colorObj.dot} ${ev.completed ? 'opacity-30' : ''}`;
        dotWrap.appendChild(dot);
      });
      if (dayEvents.length > 3) {
        const moreDot = document.createElement('span');
        moreDot.className = "text-[7px] text-slate-400 font-bold leading-none";
        moreDot.textContent = `+`;
        dotWrap.appendChild(moreDot);
      }
      cellHeader.appendChild(dotWrap);
    }

    cell.appendChild(cellHeader);

    // デスクトップ用予定テキストチップ
    const eventContainer = document.createElement('div');
    eventContainer.className = "hidden sm:flex flex-col gap-0.5 overflow-hidden flex-1";

    dayEvents.slice(0, 2).forEach(ev => {
      const chip = document.createElement('div');
      const colorObj = colorMap[ev.color] || colorMap.blue;
      const isDone = ev.completed;

      chip.className = `event-chip text-[10px] px-1 py-0.5 rounded border ${colorObj.bg} ${colorObj.text} ${colorObj.border} truncate font-medium flex items-center justify-between cursor-pointer hover:brightness-95 ${isDone ? 'opacity-40 line-through' : ''}`;
      
      let repeatIcon = ev.repeat && ev.repeat !== 'none' ? '<i class="fa-solid fa-rotate-right text-[8px] mr-0.5"></i>' : '';
      
      chip.innerHTML = `<span class="truncate">${repeatIcon}${escapeHtml(ev.title)}</span>`;
      
      chip.onclick = (e) => {
        e.stopPropagation();
        openModal(ev);
      };

      eventContainer.appendChild(chip);
    });

    if (dayEvents.length > 2) {
      const moreBadge = document.createElement('div');
      moreBadge.className = "text-[9px] text-slate-400 font-medium pl-0.5";
      moreBadge.textContent = `+${dayEvents.length - 2}件`;
      eventContainer.appendChild(moreBadge);
    }

    cell.appendChild(eventContainer);
    grid.appendChild(cell);
  }

  // 翌月の余白
  const totalCells = firstDay + daysInMonth;
  const nextMonthDays = (42 - totalCells) % 7; 
  for (let i = 1; i <= nextMonthDays; i++) {
    const cell = document.createElement('div');
    cell.className = "min-h-[58px] sm:min-h-[90px] p-1 bg-slate-50/50 rounded-xl text-slate-300 text-[10px] select-none flex flex-col justify-between";
    cell.innerHTML = `<span class="font-medium opacity-60">${i}</span>`;
    grid.appendChild(cell);
  }
}

// 5. 日別詳細ボトムシート表示
function openDaySheet(dateKey, dateObj = null) {
  selectedDateForSheet = dateKey;
  if (!dateObj) {
    const [y, m, d] = dateKey.split('-').map(Number);
    dateObj = new Date(y, m - 1, d);
  }

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const dayName = dayNames[dateObj.getDay()];
  const [year, month, day] = dateKey.split('-');

  if (daySheetTitle) {
    daySheetTitle.textContent = `${year}年${month}月${day}日 (${dayName})`;
  }

  renderDaySheetItems();

  if (dayDetailSheet) {
    dayDetailSheet.classList.remove('hidden');
  }
}

function closeDaySheet() {
  if (dayDetailSheet) {
    dayDetailSheet.classList.add('hidden');
  }
}

function renderDaySheetItems() {
  if (!daySheetItems) return;
  daySheetItems.innerHTML = '';

  const dayEvents = events.filter(e => e.date === selectedDateForSheet);
  dayEvents.sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  if (daySheetCount) {
    daySheetCount.textContent = `${dayEvents.length}件の予定`;
  }

  if (dayEvents.length === 0) {
    daySheetItems.innerHTML = `
      <div class="py-8 text-center text-slate-400 flex flex-col items-center gap-1.5">
        <i class="fa-regular fa-calendar-plus text-2xl text-slate-300"></i>
        <p class="text-xs">この日の予定はありません</p>
      </div>
    `;
    return;
  }

  dayEvents.forEach(ev => {
    const colorObj = colorMap[ev.color] || colorMap.blue;
    const item = document.createElement('div');
    item.className = `p-2.5 rounded-xl border ${colorObj.border} bg-white shadow-2xs flex items-center justify-between gap-2`;

    item.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <button onclick="toggleEventComplete('${ev.id}', event); renderDaySheetItems();" class="text-base text-slate-300 hover:text-indigo-600 shrink-0">
          <i class="${ev.completed ? 'fa-solid fa-circle-check text-indigo-600' : 'fa-regular fa-circle'}"></i>
        </button>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] font-semibold px-1.5 py-0.2 rounded ${colorObj.bg} ${colorObj.text}">
              ${escapeHtml(ev.category || '予定')}
            </span>
            ${ev.time ? `<span class="text-[10px] text-slate-500 font-bold"><i class="fa-regular fa-clock text-[9px]"></i> ${ev.time}</span>` : ''}
          </div>
          <h4 class="font-bold text-slate-800 text-xs sm:text-sm truncate ${ev.completed ? 'line-through text-slate-400' : ''}">
            ${escapeHtml(ev.title)}
          </h4>
          ${ev.description ? `<p class="text-[10px] text-slate-400 truncate">${escapeHtml(ev.description)}</p>` : ''}
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <button onclick="closeDaySheet(); openModalById('${ev.id}', event);" class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-xs">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteEvent('${ev.id}', event); renderDaySheetItems();" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    daySheetItems.appendChild(item);
  });
}

// 6. リスト表示描画
function renderList() {
  const listContainer = document.getElementById('event-list-items');
  if (!listContainer) return;
  listContainer.innerHTML = '';

  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const periodFilter = filterPeriod ? filterPeriod.value : 'upcoming';
  const statusFilter = filterStatus ? filterStatus.value : 'all';
  const todayKey = formatDateKey(new Date());

  let filtered = events.filter(ev => {
    const matchesQuery = ev.title.toLowerCase().includes(query) || 
                         (ev.description && ev.description.toLowerCase().includes(query)) ||
                         (ev.category && ev.category.toLowerCase().includes(query));
    if (!matchesQuery) return false;

    if (statusFilter === 'pending' && ev.completed) return false;
    if (statusFilter === 'completed' && !ev.completed) return false;

    if (periodFilter === 'today' && ev.date !== todayKey) return false;
    if (periodFilter === 'upcoming' && ev.date < todayKey) return false;
    if (periodFilter === 'past' && ev.date >= todayKey) return false;

    return true;
  });

  filtered.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.time || '').localeCompare(b.time || '');
  });

  const countBadge = document.getElementById('event-count-badge');
  if (countBadge) countBadge.textContent = `${filtered.length}件`;

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="flex flex-col items-center justify-center py-10 text-slate-400">
        <i class="fa-regular fa-calendar-xmark text-3xl mb-1"></i>
        <p class="text-xs">予定はありません</p>
      </div>
    `;
    return;
  }

  filtered.forEach(ev => {
    const colorObj = colorMap[ev.color] || colorMap.blue;
    const card = document.createElement('div');
    
    card.className = `p-3 rounded-xl border ${colorObj.border} bg-white shadow-xs hover:shadow transition-all flex items-center justify-between gap-2 group cursor-pointer`;

    card.onclick = (e) => {
      if (e.target.closest('.no-jump')) return;
      jumpToCalendarDate(ev.date);
    };

    const dateParts = ev.date.split('-');
    const formattedDateStr = `${dateParts[0]}/${dateParts[1]}/${dateParts[2]}`;

    card.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <button onclick="toggleEventComplete('${ev.id}', event)" class="no-jump text-base transition-colors text-slate-300 hover:text-indigo-600 shrink-0">
          <i class="${ev.completed ? 'fa-solid fa-circle-check text-indigo-600' : 'fa-regular fa-circle'}"></i>
        </button>

        <div class="flex flex-col min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="text-[10px] font-semibold px-1.5 py-0.2 rounded ${colorObj.bg} ${colorObj.text}">
              ${escapeHtml(ev.category || '予定')}
            </span>
            ${ev.repeat && ev.repeat !== 'none' ? `<span class="text-[9px] text-slate-500 bg-slate-100 px-1 py-0.2 rounded flex items-center gap-0.5"><i class="fa-solid fa-rotate-right text-indigo-500"></i> ${getRepeatText(ev.repeat)}</span>` : ''}
            <span class="text-[10px] text-slate-500 font-medium">
              ${formattedDateStr} ${ev.time ? ' ' + ev.time : ''}
            </span>
          </div>
          <h3 class="font-bold text-slate-800 text-xs sm:text-sm truncate ${ev.completed ? 'line-through text-slate-400' : ''}">
            ${escapeHtml(ev.title)}
          </h3>
        </div>
      </div>

      <div class="no-jump flex items-center gap-1 shrink-0">
        <button onclick="openModalById('${ev.id}', event)" class="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors text-xs">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button onclick="deleteEvent('${ev.id}', event)" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors text-xs">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    listContainer.appendChild(card);
  });
}

// 7. 日付ジャンプ
function jumpToCalendarDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  calendarDate = new Date(y, m - 1, 1);
  highlightedDateStr = dateStr;
  switchView('calendar');

  setTimeout(() => {
    highlightedDateStr = null;
    renderCalendar();
  }, 3000);
}

// 8. モーダル操作
function openModal(eventObj = null, defaultDateStr = null) {
  if (!eventForm) return;
  eventForm.reset();
  
  if (eventObj) {
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> 予定を編集';
    if (eventIdInput) eventIdInput.value = eventObj.id;
    if (eventTitleInput) eventTitleInput.value = eventObj.title;
    if (eventDateInput) eventDateInput.value = eventObj.date;
    if (eventTimeInput) eventTimeInput.value = eventObj.time || '';
    if (eventRepeatSelect) eventRepeatSelect.value = eventObj.repeat || 'none';
    if (eventCategoryInput) eventCategoryInput.value = eventObj.category || '仕事';
    if (eventDescriptionInput) eventDescriptionInput.value = eventObj.description || '';

    const colorRadio = eventForm.querySelector(`input[name="event-color"][value="${eventObj.color || 'blue'}"]`);
    if (colorRadio) colorRadio.checked = true;
  } else {
    if (modalTitle) modalTitle.innerHTML = '<i class="fa-solid fa-calendar-plus"></i> 予定を追加';
    if (eventIdInput) eventIdInput.value = '';
    if (eventDateInput) eventDateInput.value = defaultDateStr || formatDateKey(new Date());
    if (eventRepeatSelect) eventRepeatSelect.value = 'none';
    const defaultColorRadio = eventForm.querySelector('input[name="event-color"][value="blue"]');
    if (defaultColorRadio) defaultColorRadio.checked = true;
  }

  renderHistoryChips();
  if (eventModal) {
    eventModal.classList.remove('hidden');
    setTimeout(() => {
      eventModal.classList.remove('opacity-0');
      if (modalCard) modalCard.classList.remove('scale-95');
    }, 10);
  }
}

function openModalById(id, e) {
  if (e) e.stopPropagation();
  const ev = events.find(item => item.id === id);
  if (ev) openModal(ev);
}

function closeModal() {
  if (!eventModal) return;
  eventModal.classList.add('opacity-0');
  if (modalCard) modalCard.classList.add('scale-95');
  setTimeout(() => {
    eventModal.classList.add('hidden');
  }, 200);
}



// 10. 保存処理
function handleFormSubmit(e) {
  e.preventDefault();

  const id = (eventIdInput && eventIdInput.value) || generateId();
  const title = eventTitleInput ? eventTitleInput.value.trim() : '';
  const startDate = eventDateInput ? eventDateInput.value : '';
  const time = eventTimeInput ? eventTimeInput.value : '';
  const repeat = eventRepeatSelect ? eventRepeatSelect.value : 'none';
  const category = eventCategoryInput ? eventCategoryInput.value : '仕事';
  const description = eventDescriptionInput ? eventDescriptionInput.value.trim() : '';
  const color = eventForm.querySelector('input[name="event-color"]:checked')?.value || 'blue';

  if (!title || !startDate) return;

  if (eventIdInput && eventIdInput.value) {
    events = events.filter(item => item.id !== id);
  }

  const newEvents = [];
  const repeatGroupId = repeat !== 'none' ? generateId() : null;

  if (repeat === 'none') {
    newEvents.push({
      id,
      title,
      date: startDate,
      time,
      repeat: 'none',
      category,
      color,
      description,
      completed: false
    });
  } else {
    const baseDate = new Date(startDate + 'T00:00:00');
    const limitDate = new Date(baseDate);
    limitDate.setFullYear(limitDate.getFullYear() + 1);

    let curDate = new Date(baseDate);
    let count = 0;

    while (curDate <= limitDate && count < 365) {
      const dateStr = formatDateKey(curDate);
      newEvents.push({
        id: count === 0 ? id : generateId(),
        groupId: repeatGroupId,
        title,
        date: dateStr,
        time,
        repeat,
        category,
        color,
        description,
        completed: false
      });

      if (repeat === 'daily') curDate.setDate(curDate.getDate() + 1);
      else if (repeat === 'weekly') curDate.setDate(curDate.getDate() + 7);
      else if (repeat === 'monthly') curDate.setMonth(curDate.getMonth() + 1);
      else if (repeat === 'yearly') curDate.setFullYear(curDate.getFullYear() + 1);
      count++;
    }
  }

  events.push(...newEvents);
  saveEvents();

  addHistoryTemplate({ title, category, color, description });

  closeModal();
  renderCalendar();
  renderList();
  if (selectedDateForSheet) renderDaySheetItems();
}

// 11. 削除処理
function deleteEvent(id, e) {
  if (e) e.stopPropagation();

  const ev = events.find(item => item.id === id);
  if (!ev) return;

  if (ev.groupId) {
    if (confirm('この予定は繰り返し設定されています。\n・[OK]: 今後のシリーズも全て消去\n・[キャンセル]: この日の予定のみ消去')) {
      events = events.filter(item => item.groupId !== ev.groupId);
    } else {
      events = events.filter(item => item.id !== id);
    }
  } else {
    if (confirm(`予定「${ev.title}」を消去しますか？`)) {
      events = events.filter(item => item.id !== id);
    }
  }

  saveEvents();
  renderCalendar();
  renderList();
  if (selectedDateForSheet) renderDaySheetItems();
}

// 12. 完了トグル処理
function toggleEventComplete(id, e) {
  if (e) e.stopPropagation();
  events = events.map(ev => ev.id === id ? { ...ev, completed: !ev.completed } : ev);
  saveEvents();
  renderCalendar();
  renderList();
}

// 13. 履歴処理
function addHistoryTemplate(template) {
  historyTemplates = historyTemplates.filter(item => item.title !== template.title);
  historyTemplates.unshift(template);
  if (historyTemplates.length > 6) historyTemplates.pop();
  saveHistory();
}

function renderHistoryChips() {
  if (!quickHistoryChips) return;
  quickHistoryChips.innerHTML = '';
  if (historyTemplates.length === 0) {
    quickHistoryChips.innerHTML = '<span class="text-[10px] text-slate-400">過去の履歴がここに表示されます</span>';
    return;
  }

  historyTemplates.forEach(tmpl => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'text-[11px] bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-100 px-2 py-0.5 rounded-md font-medium transition-colors flex items-center gap-1 shadow-2xs';
    chip.innerHTML = `<i class="fa-solid fa-plus-circle text-[9px] text-indigo-500"></i> ${escapeHtml(tmpl.title)}`;
    
    chip.onclick = () => {
      if (eventTitleInput) eventTitleInput.value = tmpl.title;
      if (eventCategoryInput && tmpl.category) eventCategoryInput.value = tmpl.category;
      if (eventDescriptionInput && tmpl.description) eventDescriptionInput.value = tmpl.description;
      if (tmpl.color && eventForm) {
        const radio = eventForm.querySelector(`input[name="event-color"][value="${tmpl.color}"]`);
        if (radio) radio.checked = true;
      }
    };

    quickHistoryChips.appendChild(chip);
  });
}

function saveEvents() {
  localStorage.setItem('schedule_book_events', JSON.stringify(events));
}

function saveHistory() {
  localStorage.setItem('schedule_book_history', JSON.stringify(historyTemplates));
}

function formatDateKey(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const date = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, match => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[match]);
}

function getRepeatText(repeat) {
  switch (repeat) {
    case 'daily': return '毎日';
    case 'weekly': return '毎週';
    case 'monthly': return '毎月';
    case 'yearly': return '毎年';
    default: return '';
  }
}
