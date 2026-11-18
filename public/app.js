import { BASE_RATING, previewElo } from './elo.js';
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state = { players: [], matches: [] }, view = 'leaderboard', importInput;
let toastTimer;
const fmt = number => Math.round(number).toLocaleString();
const signed = n => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
const date = iso => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const time = iso => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const initials = name => name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
const nameOf = id => state.players.find(p => p.id === id)?.name ?? 'Unknown player';
function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4500);
}
async function api(path, input) {
  const response = await fetch(path, input === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'Could not save. Please try again.');
  return value;
}
function accept(next) {
  state = next;
  $('#match-count').textContent = fmt(state.matches.length);
  $('#player-count').textContent = fmt(state.players.length);
  const leader = state.players.find(p => p.played);
  $('#top-rating').textContent = leader ? fmt(leader.rating) : '—';
  $('#top-player').textContent = leader ? leader.name : 'No saved games yet';
  $('#history-badge').textContent = fmt(state.matches.length);
  $('#save-status').textContent = `SQLite connected · ${state.revisionCount} saved actions`;
  syncFriendChoices();
  render();
  renderRecent();
}
function render() {
  const query = $('#search').value.toLowerCase().trim();
  $('#recent-section').hidden=view!=='leaderboard';
  if(view==='friends') {
    $('#panel-eyebrow').textContent='THE PEOPLE YOU PLAY WITH';$('#panel-title').textContent='Your friend group.';$('#search').placeholder='Find a friend…';
    const friends=[...state.players].sort((a,b)=>a.name.localeCompare(b.name)).filter(p=>p.name.toLowerCase().includes(query));
    $('#main-content').innerHTML=friends.length?`<div class="friend-grid">${friends.map(p=>`<button class="friend-card" data-profile="${esc(p.id)}"><span class="avatar">${esc(initials(p.name))}</span><strong>${esc(p.name)}</strong><span>${p.played?`${fmt(p.rating)} Elo · ${p.wins}W ${p.losses}L`:'Unranked · no games yet'}</span><small>${p.played?`${p.played} recorded games`:'Play a saved game to earn a rank'}</small></button>`).join('')}</div>`:`<div class="empty"><strong>${state.players.length?'No matching friends.':'Your group starts with real people.'}</strong>${state.players.length?'Try another name.':'Add the friends you actually play with. No sample players are added.'}</div>`;
    return;
  }
  if (view === 'leaderboard') {
    const rows = state.players.filter(p => p.name.toLowerCase().includes(query));
    $('#panel-eyebrow').textContent = 'THE ALL-TIME STANDINGS';
    $('#panel-title').textContent = 'Individual Elo. Real results.';
    $('#search').placeholder = 'Search players…';
    $('#main-content').innerHTML = friendLeaderboard(rows);
  } else {
    $('#panel-eyebrow').textContent = 'EVERY GAME, KEPT';
    $('#panel-title').textContent = 'The full story.';
    $('#search').placeholder = 'Player or event…';
    const matches = state.matches.filter(m => [m.event, ...m.teamA.map(nameOf), ...m.teamB.map(nameOf)].join(' ').toLowerCase().includes(query));
    $('#main-content').innerHTML = !matches.length ? `<div class="empty"><strong>${state.matches.length ? 'No matching games.' : 'No games lost to memory.'}</strong>${state.matches.length ? 'Try a different player or event.' : 'Submit a score to start your archive. You can import older games.'}</div>` : matches.slice(0, 200).map(m => `<article class="match-item"><div class="match-meta"><span>${esc(date(m.playedAt))} · ${esc(time(m.playedAt))}${m.event ? ` <span class="match-event">/ ${esc(m.event)}</span>` : ''}</span><button class="edit" data-edit="${esc(m.id)}">Correct result</button></div><div class="match-teams">${side(m,'A')}<span class="vs">VS</span>${side(m,'B')}</div><div class="match-margin">${m.scoreA !== undefined ? `${Math.abs(m.scoreA-m.scoreB)}-point margin · ${m.multiplier.toFixed(2)}× Elo weight` : 'Legacy result · score not recorded · standard Elo weight'}</div></article>`).join('') + (matches.length > 200 ? '<p class="history-count">Showing the latest 200 matches. Search a player or event to narrow the archive. Backups include every game.</p>' : '');
  }
}
function friendLeaderboard(rows) {
  if(!state.players.length)return '<div class="empty"><strong>No friends. No made-up rankings.</strong>Add the real friends you play with.<br>Your first saved 2v2 game starts the real leaderboard.</div>';
  if(!rows.length)return '<p class="empty">No friends match your search.</p>';
  const hasRanked=state.players.some(p=>p.played>0);
  return `${hasRanked?'':'<div class="unranked-note"><strong>No rankings yet.</strong> Friends below are real profiles. A starting rating is used for calculations, but nobody earns a rank until a game is saved.</div>'}<table><thead><tr><th>#</th><th>FRIEND</th><th>RECORD</th><th class="hide-mobile">GAMES</th><th>INDIVIDUAL ELO</th><th>LAST</th></tr></thead><tbody>${rows.map(p=>`<tr><td class="rank">${p.rank===null?'—':String(p.rank).padStart(2,'0')}</td><td><div class="player-cell"><span class="avatar">${esc(initials(p.name))}</span><button class="name-button" data-profile="${esc(p.id)}">${esc(p.name)}<small>${p.played?`${p.played} real games`:'No saved games'}</small></button></div></td><td class="record-cell">${p.wins}W · ${p.losses}L${p.draws?` · ${p.draws}D`:''}</td><td class="record-cell hide-mobile">${p.played}</td><td class="${p.played?'rating':'unranked-label'}">${p.played?fmt(p.rating):'Unranked'}</td><td><span class="change ${p.lastChange>=0?'positive':'negative'}">${p.played?signed(p.lastChange):'—'}</span></td></tr>`).join('')}</tbody></table>`;
}
function renderRecent() {
  $('#recent-games').innerHTML=state.matches.length?state.matches.slice(0,5).map(m=>`<article class="match-item"><div class="match-meta"><span>${esc(date(m.playedAt))} · ${esc(m.event || 'BFL with friends')}</span><span>Saved</span></div><div class="match-teams">${side(m,'A')}<span class="vs">VS</span>${side(m,'B')}</div></article>`).join(''):'<div class="empty"><strong>Your first game goes here.</strong>Only saved results appear. Nothing is filled in for you.</div>';
}
function syncFriendChoices() {
  const friends=[...state.players].sort((a,b)=>a.name.localeCompare(b.name));
  for(const id of ['a1','a2','b1','b2']) {
    const field=$('#'+id),previous=field.value;
    field.innerHTML='<option value="">Choose a friend</option>'+friends.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');field.value=previous;
  }
}
function side(m, team) {
  const ids = team === 'A' ? m.teamA : m.teamB;
  const delta = m.changes[ids[0]].delta;
  const score=team==='A'?m.scoreA:m.scoreB;
  return `<div class="side"><strong>${ids.map(id => esc(nameOf(id))).join(' + ')}</strong>${score!==undefined?`<b class="point-score">${score}</b>`:''}<span class="change ${delta >= 0 ? 'positive' : 'negative'}">${signed(delta)} Elo${ids.length > 1 ? ' each' : ''}</span>${m.winner === team ? '<div class="winner-mark">WINNER</div>' : m.winner === 'DRAW' ? '<div class="winner-mark">DRAW</div>' : ''}</div>`;
}
function showDialog(id) {
  const dialog = $(id); dialog.querySelector('.form-error')?.replaceChildren(); dialog.showModal();
}
function openRecord(match) {
  $('#record-form').reset();
  $('#match-id').value = match?.id || '';
  $('#record-title').textContent = match ? 'Correct a result' : 'Record a 2v2 game';
  const played = match ? new Date(match.playedAt) : new Date();
  $('#played-at').value = new Date(played.getTime() - played.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  // Preserve the exact timestamp when editing without changing the datetime input.
  $('#played-at').dataset.original = match?.playedAt || '';
  $('#played-at').dataset.local = $('#played-at').value;
  $('#event').value = match?.event || '';
  ['a1','a2','b1','b2'].forEach((field, i) => {
    const team = i < 2 ? match?.teamA : match?.teamB;
    $(`#${field}`).value = team?.[i % 2] ? nameOf(team[i % 2]) : '';
  });
  $('#winner').value = match?.winner || 'A';
  $('#score-a').value = match?.scoreA ?? ''; $('#score-b').value = match?.scoreB ?? '';
  $('#record-form').dataset.revision=match?.revision ?? '';
  const legacy=!!match && match.scoreA===undefined;
  $('#a2').required=!match || match.teamA.length===2;$('#b2').required=!match || match.teamB.length===2;
  $('#legacy-result').hidden=!legacy; $('#score-a').required=!legacy; $('#score-b').required=!legacy;
  $('#correction-reason').hidden=!match; $('#reason').required=!!match;
  $('#record-help').textContent=match?'The previous score and correction reason stay in history. Every later rating is recalculated.':state.players.length<4?'Add four real friends before recording a 2v2 game.':'Choose four friends and enter the final football score. Elo updates when you save.';
  $('#record-form button[type="submit"]').textContent=match?'Save correction & rebuild Elo':'Save score';
  $('#record-form button[type="submit"]').disabled=!match && state.players.length<4;
  updateEloPreview();
  showDialog('#record-dialog');
}
function updateEloPreview() {
  const box=$('#elo-preview');
  const normalize=name=>name.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  const find=name=>state.players.find(p=>normalize(p.name)===normalize(name));
  const namesA=[$('#a1').value,$('#a2').value].filter(name=>name.trim());
  const namesB=[$('#b1').value,$('#b2').value].filter(name=>name.trim());
  if(namesA.length!==2 || namesB.length!==2) {
    box.innerHTML='<h3>Your individual Elo</h3><p class="fine">Choose four friends to see the rating change for each possible result. These pairs apply only to this game.</p>';return;
  }
  const allNames=[...namesA,...namesB].map(normalize);
  if(new Set(allNames).size!==allNames.length) {box.textContent='Choose different players for each spot to preview Elo.';return;}
  const a=namesA.map(find),b=namesB.map(find);
  if([...a,...b].some(p=>!p)) {box.textContent='Choose players from the league roster to preview Elo.';return;}
  const average=team=>team.reduce((sum,p)=>sum+p.rating,0)/team.length;
  const aRating=average(a),bRating=average(b);
  const scoreA=$('#score-a').value,scoreB=$('#score-b').value;
  const scored=scoreA!=='' && scoreB!=='' && Number.isInteger(Number(scoreA)) && Number.isInteger(Number(scoreB)) && Number(scoreA)>=0 && Number(scoreB)>=0 && Number(scoreA)<=1000 && Number(scoreB)<=1000;
  const stakes=previewElo(aRating,bRating,scored?{scoreA:Number(scoreA),scoreB:Number(scoreB)}:{});
  const label=team=>team.map(p=>esc(p.name)).join(' + ');
  const outcome=(heading,change)=>`<div class="stake-outcome"><span>${heading}</span><span>Pair 1 <b class="${change.a>=0?'positive':'negative'}">${signed(change.a)}</b> · Pair 2 <b class="${change.b>=0?'positive':'negative'}">${signed(change.b)}</b></span></div>`;
  const tie=scored && Number(scoreA)===Number(scoreB);
  box.innerHTML=`<h3>Individual Elo · ${scored?`${Math.abs(Number(scoreA)-Number(scoreB))}-point margin · ${stakes.multiplier.toFixed(2)}×`:'standard weight'}</h3><div class="stake-teams"><span><strong>Pair 1 · ${fmt(aRating)} average</strong>${label(a)}<small>${(stakes.expectedA*100).toFixed(0)}% expected result</small></span><span><strong>Pair 2 · ${fmt(bRating)} average</strong>${label(b)}<small>${((1-stakes.expectedA)*100).toFixed(0)}% expected result</small></span></div>${tie?outcome('If the game is a draw',stakes.draw):outcome('If Pair 1 wins',stakes.aWins)+outcome('If Pair 2 wins',stakes.bWins)}<p class="fine">Changes shown per person. ${[...a,...b].some(p=>!p.played)?'Unranked friends use the starting Elo of 1,000 for this estimate. ':''}${!scored?'Enter final scores to include the margin bonus. ':''}Estimate at current ratings. Backdated games and corrections recalculate later results.</p>`;
}
$('#record-form').addEventListener('input',updateEloPreview);
async function submit(form, action, success) {
  const button = form.querySelector('button[type="submit"]') || $('#confirm-import');
  const error = form.querySelector('.form-error');
  error.textContent = ''; button.disabled = true;
  try { const result = await action(); accept(result.state); form.closest('dialog').close(); toast(success(result)); }
  catch (e) { error.textContent = e.message; }
  finally { button.disabled = false; }
}
$('#record-form').addEventListener('submit', event => {
  event.preventDefault();
  const id = $('#match-id').value;
  const input = $('#played-at');
  const playedAt = input.dataset.original && input.value === input.dataset.local ? input.dataset.original : new Date(input.value).toISOString();
  const match = { playedAt, event: $('#event').value,
    teamA: [$('#a1').value, $('#a2').value].filter(s => s.trim()),
    teamB: [$('#b1').value, $('#b2').value].filter(s => s.trim()),
    ...($('#score-a').value!=='' || $('#score-b').value!=='' ? {scoreA:$('#score-a').value===''?null:Number($('#score-a').value),scoreB:$('#score-b').value===''?null:Number($('#score-b').value)} : {winner:$('#winner').value}),
    ...(id ? { id,revision:Number(event.currentTarget.dataset.revision),reason:$('#reason').value } : {}) };
  submit(event.currentTarget, () => api(id ? '/api/correct' : '/api/matches', match), () => id ? 'Score corrected. Every later rating has been rebuilt.' : 'Score saved. Elo updated.');
});
$('#player-form').addEventListener('submit', event => {
  event.preventDefault();
  submit(event.currentTarget, () => api('/api/players', { name: $('#player-name').value }), () => 'Player added to the roster.');
});
$('#open-record').onclick = () => openRecord();
$('#open-import').onclick = () => {
  importInput = null; $('#import-file').value = ''; $('#import-preview').textContent = ''; $('#confirm-import').disabled = true;
  showDialog('#import-dialog');
};
$('#add-player').onclick = () => { $('#player-form').reset(); showDialog('#player-dialog'); };
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => {
  setView(button.dataset.view);
});
function setView(next) {view=next;$('#search').value='';document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));render();}
document.querySelectorAll('[data-all-history]').forEach(button=>button.onclick=()=>{setView('history');$('.workspace-header').scrollIntoView({behavior:'smooth',block:'start'});});
$('#search').addEventListener('input', render);
$('#main-content').addEventListener('click', e => {
  const button = e.target.closest('button');
  if (!button) return;
  if (button.dataset.edit) openRecord(state.matches.find(m => m.id === button.dataset.edit));
  if (button.dataset.profile) showProfile(button.dataset.profile);
  if (button.dataset.action === 'record') openRecord();
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0];
  const error = $('#import-dialog .form-error'); error.textContent = '';
  importInput = null; $('#confirm-import').disabled = true; $('#import-preview').textContent = '';
  if (!file) return;
  try {
    if (file.size > 3_900_000) throw new Error('Choose a file smaller than 3.9 MB.');
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const backup = JSON.parse(text);
      if (backup.format !== 'pong-royale-history' || backup.version !== 1 || !Array.isArray(backup.matches)) throw new Error('Choose a Pong Royale backup JSON file.');
      importInput = { backup };
      $('#import-preview').textContent = `${file.name}: ${backup.matches.length} matches ready to validate and import.`;
    } else {
      importInput = { csv: text };
      $('#import-preview').textContent = `${file.name} selected. All rows will be validated together before anything is saved.`;
    }
    $('#confirm-import').disabled = false;
  } catch (e) { error.textContent = e.message; }
});
$('#confirm-import').onclick = () => {
  if (!importInput) return;
  submit($('#import-dialog'), () => api('/api/import', importInput), result => `${result.result.added} games imported; ${result.result.skipped} duplicates skipped. Ratings rebuilt.`);
};
function showProfile(id) {
  const p = state.players.find(player => player.id === id);
  $('#profile-name').textContent = p.name;
  const games = state.matches.filter(m => [...m.teamA,...m.teamB].includes(id));
  const values = [BASE_RATING, ...p.history.map(h => h.rating)];
  const min = Math.min(...values) - 15, max = Math.max(...values) + 15;
  const points = values.map((value, i) => [15 + (i / Math.max(1, values.length - 1)) * 450, 150 - ((value-min)/(max-min)) * 125]);
  const baseline = 150 - ((1000-min)/(max-min))*125;
  $('#profile-content').innerHTML = `<div class="profile-summary"><strong>${fmt(p.rating)}</strong><span>${p.wins} wins · ${p.losses} losses · ${p.draws} draws<br>${p.played} games played</span></div>${p.history.length ? `<svg class="chart" viewBox="0 0 480 170" role="img" aria-label="Elo progression, starting at 1,000 and ending at ${fmt(p.rating)}"><line x1="15" y1="${baseline}" x2="465" y2="${baseline}"></line><polyline points="${points.map(point => point.join(',')).join(' ')}"></polyline><circle cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="4"></circle></svg><div class="chart-caption"><span>First game · ${esc(date(p.history[0].playedAt))}</span><span>Latest · ${esc(date(p.history.at(-1).playedAt))}</span></div>` : '<p class="fine">Their rating story starts with game one.</p>'}${games.slice(0,50).map(m => { const isA = m.teamA.includes(id); const opponent = (isA ? m.teamB : m.teamA).map(nameOf).join(' + '); const outcome = m.winner === 'DRAW' ? 'Draw' : (m.winner === 'A') === isA ? 'Win' : 'Loss'; const change = m.changes[id]; return `<div class="profile-match"><span>${esc(outcome)} vs ${esc(opponent)}<small>${esc(date(m.playedAt))}${m.event ? ` · ${esc(m.event)}` : ''}</small></span><span class="${change.delta >= 0 ? 'positive' : 'negative'}">${signed(change.delta)}<small>${fmt(change.before)} → ${fmt(change.after)}</small></span></div>`; }).join('')}${games.length > 50 ? '<p class="fine">Latest 50 results shown. The chart and rating include the full history.</p>' : ''}`;
  showDialog('#profile-dialog');
  if(!p.played) {
    $('#profile-content').innerHTML='<div class="empty"><strong>Unranked</strong>No saved games yet.<br>The Elo calculation starts at 1,000 when they play.<br>There is no made-up history or ranking.</div>';
  } else {
    const partners=new Map();
    for(const m of games){const ownSide=m.teamA.includes(id)?m.teamA:m.teamB;const partner=ownSide.find(pid=>pid!==id);if(!partner)continue;const entry=partners.get(partner)||{games:0,wins:0};entry.games++;if((m.winner==='A'&&m.teamA.includes(id))||(m.winner==='B'&&m.teamB.includes(id)))entry.wins++;partners.set(partner,entry);}
    const list=[...partners.entries()].sort((a,b)=>b[1].games-a[1].games);
    if(list.length)$('#profile-content').insertAdjacentHTML('beforeend',`<h3 class="partner-heading">Partners in past games</h3>${list.map(([pid,stats])=>`<div class="profile-match"><span>${esc(nameOf(pid))}</span><span>${stats.games} games · ${stats.wins} wins together</span></div>`).join('')}`);
  }
}
try {
  accept(await api('/api/state'));
}
catch (e) { $('#save-status').textContent = 'League unavailable'; $('#main-content').innerHTML = `<p class="empty">${esc(e.message)}<br>Please refresh or restart the local server.</p>`; }

// Refresh shared results without disrupting a form that is currently being edited.
setInterval(async()=>{if(document.hidden || document.querySelector('dialog[open]'))return;try{accept(await api('/api/state'));}catch{}},20000);
