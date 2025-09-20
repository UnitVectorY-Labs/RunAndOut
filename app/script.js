(function () {
  const $ = (s) => document.querySelector(s);
  const storeKey = 'kidsBaseballScore_v3';
  const defaultState = () => ({
    started: false,
    startTime: null,
    gameLengthMin: 60,
    runCap: 6,
    inning: 1,
    half: 'top',
    outs: 0,
    totals: { visitor: 0, home: 0 },
    innings: { visitor: [0], home: [0] },
    history: [],
    // Recording features
    recordingEnabled: true,
    recordingStarted: false,
    recordingStartTime: null,
    gameTimerStarted: false,
    timestamps: [],
    lastTimestampTime: 0
  });

  // migrate older versions if found
  (function migrate() {
    const keys = ['kidsBaseballScore_v2', 'kidsBaseballScore_v1'];
    for (const k of keys) {
      try { if (!localStorage.getItem(storeKey) && localStorage.getItem(k)) localStorage.setItem(storeKey, localStorage.getItem(k)); } catch (e) { }
    }
  })();

  let state = load() || defaultState();
  let tickTimer = null;
  let cooldownTimer = null;

  function save() { localStorage.setItem(storeKey, JSON.stringify(state)); }
  function load() { try { return JSON.parse(localStorage.getItem(storeKey)); } catch (e) { return null; } }

  const battingTeam = () => state.half === 'top' ? 'visitor' : 'home';
  function ensureInningArrays() {
    const idx = state.inning - 1;
    ['visitor', 'home'].forEach(t => { while ((state.innings[t] || []).length <= idx) state.innings[t].push(0); });
  }

  function updateTimer() {
    const leftEl = $('#time-left');

    // Game timer (countdown)
    if (!state.gameTimerStarted || !state.startTime || !state.gameLengthMin) {
      leftEl.textContent = '—';
    } else {
      const now = Date.now();
      const rem = Math.max(0, state.startTime + state.gameLengthMin * 60000 - now);
      const m = Math.floor(rem / 60000), s = Math.floor((rem % 60000) / 1000);
      leftEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
  }

  function render() {
    ensureInningArrays();
    // Title bar & outs
    const isVisitor = state.half === 'top';
    const ord = (n) => ({ 1: '1st', 2: '2nd', 3: '3rd' })[n] || `${n}th`;
    const title = $('#title');
    title.textContent = `${isVisitor ? 'Top' : 'Bottom'} of ${ord(state.inning)}`;
    title.classList.toggle('visitor', isVisitor);
    title.classList.toggle('home', !isVisitor);
    ['#out1', '#out2', '#out3'].forEach((id, i) => $(id).classList.toggle('filled', i < state.outs));

    $('#run-cap').textContent = state.runCap ? state.runCap : '—';

    // Show/hide timer controls based on recording enabled and configuration completed
    const timerControls = $('#timer-controls');
    const timerControlsBottom = $('#timer-controls-bottom');
    const controls = $('.controls');
    const mainContent = $('.main-content');
    const gameConfigured = state.runCap !== undefined && state.gameLengthMin !== undefined;

    // Show timer controls if recording is enabled OR if game timer is available
    const hasGameTimer = state.gameLengthMin > 0;
    const showTimerControls = (state.recordingEnabled || hasGameTimer) && gameConfigured;

    if (showTimerControls) {
      timerControls.style.display = 'block';
      timerControlsBottom.style.display = 'grid';

      // Calculate grid columns based on visible buttons
      let visibleButtons = [];

      // Show/hide individual timer buttons based on state
      const startRecordingBtn = $('#btn-start-recording');
      const startGameBtn = $('#btn-start-game');
      const markTimestampBtn = $('#btn-mark-timestamp');

      // Show recording button only if recording is enabled and not started
      if (state.recordingEnabled && !state.recordingStarted) {
        startRecordingBtn.style.display = 'block';
        visibleButtons.push('recording');
      } else {
        startRecordingBtn.style.display = 'none';
      }

      // Show game timer button if there's actually a game timer and it's not started
      if (hasGameTimer && !state.gameTimerStarted) {
        startGameBtn.style.display = 'block';
        visibleButtons.push('game');
      } else {
        startGameBtn.style.display = 'none';
      }

      // Only show Mark Timestamp if recording is enabled and started, and not in cooldown
      const now = Date.now();
      const inCooldown = state.lastTimestampTime && (now - state.lastTimestampTime < 10000);

      if (state.recordingEnabled && state.recordingStarted && !inCooldown) {
        markTimestampBtn.style.display = 'block';
        visibleButtons.push('timestamp');
      } else {
        markTimestampBtn.style.display = 'none';
      }

      // Set grid columns based on number of visible buttons
      const columns = visibleButtons.length;
      if (columns > 0) {
        timerControlsBottom.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        // Add class to adjust main content padding
        if (mainContent) mainContent.classList.add('timer-controls-visible');
      } else {
        // Hide timer controls if no buttons are visible
        timerControlsBottom.style.display = 'none';
        if (mainContent) mainContent.classList.remove('timer-controls-visible');
      }

      $('#timestamps').style.display = state.recordingStarted && state.timestamps.length > 0 ? 'block' : 'none';
    } else {
      timerControls.style.display = 'none';
      timerControlsBottom.style.display = 'none';
      // Remove class when timer controls are hidden
      if (mainContent) mainContent.classList.remove('timer-controls-visible');
    }

    // Vertical innings grid (totals embedded in headers)
    const vg = $('#vgrid');
    vg.innerHTML = '';
    const maxInn = Math.max(state.innings.visitor.length, state.innings.home.length);

    const headIn = div('head', 'In');
    const headV = div('head team-head visitor', 'Visitor');
    const headH = div('head team-head home', 'Home');
    // append total badges to headers
    headV.append(childTot(state.totals.visitor));
    headH.append(childTot(state.totals.home));
    vg.append(headIn, headV, headH);

    for (let i = 0; i < maxInn; i++) {
      const isCurrentInning = (i + 1) === state.inning;
      const visitorCell = div('cell', state.innings.visitor[i] ?? 0);
      const homeCell = div('cell', state.innings.home[i] ?? 0);

      // Highlight the current inning cell for the batting team
      if (isCurrentInning) {
        if (state.half === 'top') {
          visitorCell.classList.add('current-inning');
        } else {
          homeCell.classList.add('current-inning');
        }
      }

      vg.append(div('cell', i + 1), visitorCell, homeCell);
    }

    renderTimestamps();
    save();
  }

  function renderTimestamps() {
    const container = $('#timestamps-container');
    if (!container) return;

    container.innerHTML = '';
    state.timestamps.forEach((ts, index) => {
      const tsDiv = document.createElement('div');
      tsDiv.className = 'timestamp-item';
      tsDiv.innerHTML = `
            <span class="timestamp-time">${ts.time}</span>
            <span class="timestamp-context">${ts.half === 'top' ? 'Top' : 'Bottom'} ${ts.inning}</span>
            <span class="timestamp-real">${ts.realTime}</span>
          `;
      container.appendChild(tsDiv);
    });

    // Force a re-render of the timestamps section visibility
    const timestampsSection = $('#timestamps');
    if (timestampsSection) {
      timestampsSection.style.display = state.recordingStarted && state.timestamps.length > 0 ? 'block' : 'none';
    }
  }

  function childTot(n) { const s = document.createElement('span'); s.className = 'tot'; s.textContent = `(${n})`; return s; }
  function div(cls, txt) { const d = document.createElement('div'); d.className = cls; d.textContent = txt; return d; }

  // Game logic
  function addRun() {
    ensureInningArrays();
    const team = battingTeam();
    const idx = state.inning - 1;
    state.innings[team][idx] = (state.innings[team][idx] || 0) + 1;
    state.totals[team] += 1;
    state.history.push({ type: 'run', team, inning: state.inning });
    const runs = state.innings[team][idx];
    if (state.runCap && runs >= state.runCap) nextHalf('cap');
    render();
  }

  function addOut() {
    state.outs = Math.min(3, state.outs + 1);
    state.history.push({ type: 'out' });
    if (state.outs >= 3) nextHalf('threeOuts');
    render();
  }

  function nextHalf(reason) {
    const prev = { inning: state.inning, half: state.half, outs: state.outs };
    if (state.half === 'bottom') state.inning += 1;
    state.half = (state.half === 'top') ? 'bottom' : 'top';
    state.outs = 0;
    ensureInningArrays();
    state.history.push({ type: 'switch', reason, prev });
  }

  function undo() {
    const ev = state.history.pop(); if (!ev) return;
    if (ev.type === 'run') {
      const idx = ev.inning - 1; const t = ev.team;
      state.innings[t][idx] = Math.max(0, (state.innings[t][idx] || 0) - 1);
      state.totals[t] = Math.max(0, state.totals[t] - 1);
    } else if (ev.type === 'out') {
      state.outs = Math.max(0, state.outs - 1);
    } else if (ev.type === 'switch') {
      state.inning = ev.prev.inning; state.half = ev.prev.half; state.outs = ev.prev.outs;
    }
    render();
  }

  function newGame() {
    if (!confirm('Start a new game? This will clear the current scoreboard.')) return;
    if (cooldownTimer) clearTimeout(cooldownTimer);
    state = defaultState();
    save();
    openSettings(true);
    render();
  }

  // Timer control functions
  function startRecordingTimer() {
    if (state.recordingStarted) return;
    state.recordingStarted = true;
    state.recordingStartTime = Date.now();
    $('#btn-start-recording').style.display = 'none';
    $('#btn-mark-timestamp').style.display = 'block';
    $('#timestamps').style.display = 'block';
    $('#chip-recording').style.display = 'block';
    render();
  }

  function startGameTimer() {
    if (state.gameTimerStarted) return;
    state.gameTimerStarted = true;
    state.started = true;
    state.startTime = Date.now();
    $('#btn-start-game').style.display = 'none';
    render();
  }

  function markTimestamp() {
    if (!state.recordingStarted || !state.recordingStartTime) return;

    const now = Date.now();

    // Check 10-second cooldown
    if (now - state.lastTimestampTime < 10000) {
      return; // Do nothing if cooldown is active
    }

    const elapsed = now - state.recordingStartTime;
    const totalSec = Math.floor(elapsed / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const timeStr = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const timestamp = {
      time: timeStr,
      elapsed: elapsed,
      realTime: new Date(now).toLocaleTimeString(),
      inning: state.inning,
      half: state.half
    };

    state.timestamps.push(timestamp);
    state.lastTimestampTime = now;

    // Re-render to hide button and adjust layout
    render();
    save();

    // Set timer to re-render when cooldown expires
    if (cooldownTimer) clearTimeout(cooldownTimer);
    cooldownTimer = setTimeout(() => {
      render(); // This will show the button again
    }, 10000);
  }

  // Settings
  const dlgSettings = $('#cfg');
  function openSettings(first = false) {
    $('#run-cap-select').value = String(state.runCap || 0);
    $('#length-select').value = String(state.gameLengthMin || 0);
    $('#recording-enabled').checked = state.recordingEnabled || false;
    dlgSettings.showModal();
    if (first) $('#btn-save').focus();
  }

  $('#btn-save').addEventListener('click', (e) => {
    const cap = parseInt($('#run-cap-select').value, 10);
    const len = parseInt($('#length-select').value, 10);
    const recording = $('#recording-enabled').checked;

    state.runCap = isNaN(cap) ? 0 : cap;
    state.gameLengthMin = isNaN(len) ? 0 : len;
    state.recordingEnabled = recording;

    // Don't auto-start the game timer anymore - just mark game as configured
    if (!state.gameTimerStarted) {
      state.started = false;
      state.startTime = null;
    }

    dlgSettings.close();
    render();
  });

  // Menu
  const dlgMenu = $('#menu');
  $('#btn-menu').addEventListener('click', () => dlgMenu.showModal());
  $('#mi-close').addEventListener('click', () => dlgMenu.close());
  $('#mi-settings').addEventListener('click', () => { dlgMenu.close(); openSettings(false); });
  $('#mi-undo').addEventListener('click', () => { dlgMenu.close(); undo(); });
  $('#mi-new').addEventListener('click', () => { dlgMenu.close(); newGame(); });

  // Bottom controls
  $('#btn-add-run').addEventListener('click', addRun);
  $('#btn-add-out').addEventListener('click', addOut);

  // Timer controls
  $('#btn-start-recording').addEventListener('click', startRecordingTimer);
  $('#btn-start-game').addEventListener('click', startGameTimer);
  $('#btn-mark-timestamp').addEventListener('click', markTimestamp);

  // Init
  function boot() {
    if (tickTimer) clearInterval(tickTimer);
    if (cooldownTimer) clearTimeout(cooldownTimer);
    tickTimer = setInterval(updateTimer, 1000);

    // Only open settings if game is completely unconfigured
    const gameConfigured = state.runCap !== undefined && state.gameLengthMin !== undefined;
    if (!gameConfigured) openSettings(true);

    render();
    updateTimer();
  }
  window.addEventListener('visibilitychange', () => { if (!document.hidden) updateTimer(); });
  boot();
})();