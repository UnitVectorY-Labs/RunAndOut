(function(){
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
        history: []
      });

      // migrate older versions if found
      (function migrate(){
        const keys = ['kidsBaseballScore_v2','kidsBaseballScore_v1'];
        for (const k of keys){
          try { if (!localStorage.getItem(storeKey) && localStorage.getItem(k)) localStorage.setItem(storeKey, localStorage.getItem(k)); } catch(e){}
        }
      })();

      let state = load() || defaultState();
      let tickTimer = null;

      function save(){ localStorage.setItem(storeKey, JSON.stringify(state)); }
      function load(){ try { return JSON.parse(localStorage.getItem(storeKey)); } catch(e){ return null; } }

      const battingTeam = () => state.half === 'top' ? 'visitor' : 'home';
      function ensureInningArrays(){
        const idx = state.inning - 1;
        ['visitor','home'].forEach(t=>{ while((state.innings[t]||[]).length <= idx) state.innings[t].push(0); });
      }

      function updateTimer(){
        const leftEl = $('#time-left');
        if (!state.started || !state.startTime || !state.gameLengthMin){ leftEl.textContent = '—'; return; }
        const now = Date.now();
        const rem = Math.max(0, state.startTime + state.gameLengthMin*60000 - now);
        const m = Math.floor(rem/60000), s = Math.floor((rem%60000)/1000);
        leftEl.textContent = `${m}:${String(s).padStart(2,'0')}`;
      }

      function render(){
        ensureInningArrays();
        // Title bar & outs
        const isVisitor = state.half === 'top';
        const ord = (n)=>({1:'1st',2:'2nd',3:'3rd'})[n]||`${n}th`;
        const title = $('#title');
        title.textContent = `${isVisitor? 'Top':'Bottom'} of ${ord(state.inning)}`;
        title.classList.toggle('visitor', isVisitor);
        title.classList.toggle('home', !isVisitor);
        ['#out1','#out2','#out3'].forEach((id,i)=> $(id).classList.toggle('filled', i < state.outs));

        $('#run-cap').textContent = state.runCap ? state.runCap : '—';

        // Vertical innings grid (totals embedded in headers)
        const vg = $('#vgrid');
        vg.innerHTML = '';
        const maxInn = Math.max(state.innings.visitor.length, state.innings.home.length);

        const headIn = div('head','In');
        const headV = div('head team-head visitor','Visitor');
        const headH = div('head team-head home','Home');
        // append total badges to headers
        headV.append(childTot(state.totals.visitor));
        headH.append(childTot(state.totals.home));
        vg.append(headIn, headV, headH);

        for (let i=0;i<maxInn;i++){
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
          
          vg.append(div('cell', i+1), visitorCell, homeCell);
        }

        save();
      }

      function childTot(n){ const s=document.createElement('span'); s.className='tot'; s.textContent = `(${n})`; return s; }
      function div(cls, txt){ const d=document.createElement('div'); d.className=cls; d.textContent=txt; return d; }

      // Game logic
      function addRun(){
        ensureInningArrays();
        const team = battingTeam();
        const idx = state.inning - 1;
        state.innings[team][idx] = (state.innings[team][idx]||0) + 1;
        state.totals[team] += 1;
        state.history.push({type:'run', team, inning: state.inning});
        const runs = state.innings[team][idx];
        if (state.runCap && runs >= state.runCap) nextHalf('cap');
        render();
      }

      function addOut(){
        state.outs = Math.min(3, state.outs + 1);
        state.history.push({type:'out'});
        if (state.outs >= 3) nextHalf('threeOuts');
        render();
      }

      function nextHalf(reason){
        const prev = { inning: state.inning, half: state.half, outs: state.outs };
        if (state.half === 'bottom') state.inning += 1;
        state.half = (state.half === 'top') ? 'bottom' : 'top';
        state.outs = 0;
        ensureInningArrays();
        state.history.push({type:'switch', reason, prev});
      }

      function undo(){
        const ev = state.history.pop(); if (!ev) return;
        if (ev.type === 'run'){
          const idx = ev.inning - 1; const t = ev.team;
          state.innings[t][idx] = Math.max(0, (state.innings[t][idx]||0) - 1);
          state.totals[t] = Math.max(0, state.totals[t] - 1);
        } else if (ev.type === 'out'){
          state.outs = Math.max(0, state.outs - 1);
        } else if (ev.type === 'switch'){
          state.inning = ev.prev.inning; state.half = ev.prev.half; state.outs = ev.prev.outs;
        }
        render();
      }

      function newGame(){
        if (!confirm('Start a new game? This will clear the current scoreboard.')) return;
        state = defaultState();
        save();
        openSettings(true);
        render();
      }

      // Settings
      const dlgSettings = $('#cfg');
      function openSettings(first=false){
        $('#run-cap-select').value = String(state.runCap || 0);
        $('#length-select').value = String(state.gameLengthMin || 0);
        dlgSettings.showModal();
        if (first) $('#btn-save').focus();
      }

      $('#btn-save').addEventListener('click', (e)=>{
        const cap = parseInt($('#run-cap-select').value, 10);
        const len = parseInt($('#length-select').value, 10);
        state.runCap = isNaN(cap)?0:cap;
        state.gameLengthMin = isNaN(len)?0:len;
        if (!state.started){ state.started = true; state.startTime = Date.now(); }
        else { state.startTime = Date.now(); }
        dlgSettings.close();
        render();
      });

      // Menu
      const dlgMenu = $('#menu');
      $('#btn-menu').addEventListener('click', ()=> dlgMenu.showModal());
      $('#mi-close').addEventListener('click', ()=> dlgMenu.close());
      $('#mi-settings').addEventListener('click', ()=> { dlgMenu.close(); openSettings(false); });
      $('#mi-undo').addEventListener('click', ()=> { dlgMenu.close(); undo(); });
      $('#mi-new').addEventListener('click', ()=> { dlgMenu.close(); newGame(); });

      // Bottom controls
      $('#btn-add-run').addEventListener('click', addRun);
      $('#btn-add-out').addEventListener('click', addOut);

      // Init
      function boot(){
        if (tickTimer) clearInterval(tickTimer);
        tickTimer = setInterval(updateTimer, 1000);
        if (!state.started) openSettings(true);
        render();
        updateTimer();
      }
      window.addEventListener('visibilitychange', ()=>{ if (!document.hidden) updateTimer(); });
      boot();
    })();