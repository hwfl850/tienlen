import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

const app = document.querySelector('#app');
const configured = !SUPABASE_URL.includes('YOUR_PROJECT_REF') && !SUPABASE_ANON_KEY.includes('YOUR_');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
}) : null;
const suitSymbol = { clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠' };
const redSuits = new Set(['diamonds', 'hearts']);
const state = { session: null, profile: null, view: 'auth', rooms: [], room: null, members: [], game: null, players: [], hand: [], selected: [], channel: null, avatarUrl: null };

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' }[char]));
const initials = (name = '?') => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
const mine = () => state.session?.user?.id;
const isOwner = () => state.room?.owner_id === mine();
const toast = (message, kind = '') => {
  let stack = document.querySelector('.toast-stack');
  if (!stack) { stack = document.createElement('div'); stack.className = 'toast-stack'; document.body.append(stack); }
  const item = document.createElement('div'); item.className = `toast ${kind}`; item.textContent = message; stack.append(item); setTimeout(() => item.remove(), 4200);
};
const avatar = (name, url, className = '') => `<div class="avatar ${className}">${url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(name)}" />` : escapeHtml(initials(name))}</div>`;
const topbar = () => `<header class="topbar"><button class="wordmark link-btn" data-action="home"><span class="brand-mark">十三</span><span>Lantern Table</span></button>${state.session ? `<div class="top-actions"><span class="top-name">${escapeHtml(state.profile?.display_name || state.session.user.email)}</span>${avatar(state.profile?.display_name || '?', state.avatarUrl)}<button class="btn icon-btn" data-action="profile" aria-label="Profile">⚙</button><button class="btn" data-action="signout">Leave</button></div>` : ''}</header>`;

function render() {
  if (!configured) { app.innerHTML = setupScreen(); return; }
  if (!state.session) { app.innerHTML = authScreen(); return; }
  const content = state.view === 'profile' ? profileScreen() : state.view === 'room' ? roomScreen() : state.view === 'game' ? gameScreen() : lobbyScreen();
  app.innerHTML = `${topbar()}${content}`;
}

function setupScreen() { return `<section class="auth-layout"><div class="hero"><div class="brand-mark">十三</div><p class="eyebrow">One small setup step</p><h1>Connect your table to Supabase.</h1><p>Copy <code>supabase-config.example.js</code> to <code>supabase-config.js</code>, then add your project URL and publishable key. The README includes the database and Edge Function deployment steps.</p></div><div class="panel auth-card"><h2>Safe by design</h2><p class="subtle">The publishable key belongs in a static app. Row Level Security and the server-side game function enforce access.</p></div></section>`; }
function authScreen() { return `<section class="auth-layout"><div class="hero"><div class="brand-mark">十三</div><p class="eyebrow">Vietnamese climbing card game</p><h1>A calm table. Sharp play.</h1><p>Play Tien Len privately with friends or find a public seat. Every hand is dealt and validated on the server—your cards never travel to another player’s browser.</p><div class="rule-pills"><span>4 seats</span><span>Private rooms</span><span>Server-authoritative</span></div></div><form class="panel auth-card" id="auth-form"><h2>Welcome in</h2><p class="subtle">Use an email and a strong password to save your identity and table history.</p><label class="field">EMAIL<input required name="email" type="email" autocomplete="email" placeholder="you@example.com" /></label><label class="field">PASSWORD<input required name="password" type="password" minlength="8" autocomplete="current-password" placeholder="At least 8 characters" /></label><p class="form-error" id="auth-error"></p><button class="btn btn-primary" type="submit">Sign in</button><p class="switch-copy">New at the table? <button type="button" class="link-btn" data-action="signup-mode">Create an account</button></p></form></section>`; }
function signupScreen() { return `<section class="auth-layout"><div class="hero"><div class="brand-mark">十三</div><p class="eyebrow">Your place at the table</p><h1>Make it yours.</h1><p>Your profile remains private; your chosen display name and avatar are shared only with people seated in the same room.</p></div><form class="panel auth-card" id="signup-form"><h2>Create account</h2><p class="subtle">We’ll send a confirmation email before the first sign-in, if email confirmation is enabled in Supabase.</p><label class="field">DISPLAY NAME<input required name="displayName" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}" placeholder="e.g. Mai Nguyen" /></label><label class="field">EMAIL<input required name="email" type="email" autocomplete="email" placeholder="you@example.com" /></label><label class="field">PASSWORD<input required name="password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters" /></label><p class="form-error" id="auth-error"></p><button class="btn btn-primary" type="submit">Create account</button><p class="switch-copy">Already have an account? <button type="button" class="link-btn" data-action="signin-mode">Sign in</button></p></form></section>`; }

function lobbyScreen() { const rooms = state.rooms.map((room) => `<article class="lobby-row"><div><h3>${escapeHtml(room.name)}</h3><div class="lobby-meta"><span class="status-dot"></span>${room.member_count || 1}/4 seated · <b>${escapeHtml(room.owner_name || 'Host')}</b></div></div><button class="btn" data-action="join-public" data-room="${room.id}">Join table</button></article>`).join(''); return `<main class="page"><div class="page-head"><div><p class="eyebrow">The foyer</p><h1>Choose a table</h1></div><div class="page-actions"><button class="btn" data-action="refresh-rooms">Refresh</button><button class="btn btn-primary" data-action="create-room">Create table</button></div></div><section class="lobby-grid"><div class="panel lobby-list">${rooms || '<div class="empty">No public tables are waiting. Start one, or join friends with a code.</div>'}</div><aside class="panel side-card"><h3>Have a code?</h3><p class="subtle">Private tables stay off the public list.</p><div class="join-code"><input id="invite-code" maxlength="6" placeholder="ABC123" aria-label="Invite code" /><button class="btn btn-primary" data-action="join-code">Join</button></div><hr/><p class="subtle">A host can start with fewer than four people. Empty seats are filled with quick, courteous bots.</p></aside></section></main>`; }
function roomScreen() { if (!state.room) return lobbyScreen(); const people = state.members.map((member) => `<div class="seat">${avatar(member.display_name, member.avatar_url)}<div><div class="seat-name">${escapeHtml(member.display_name)}</div><div class="seat-detail">Seated ${member.user_id === mine() ? '· you' : ''}</div></div>${member.user_id === state.room.owner_id ? '<span class="host-tag">HOST</span>' : ''}</div>`).join(''); const empty = Array.from({ length: Math.max(0, 4 - state.members.length) }, (_, i) => `<div class="seat"><div class="avatar">＋</div><div><div class="seat-name">Open seat</div><div class="seat-detail">Will become Bot ${i + 1} when play starts</div></div></div>`).join(''); return `<main class="page"><div class="page-head"><div><p class="eyebrow">${state.room.visibility === 'private' ? 'Private table' : 'Public table'}</p><h1>${escapeHtml(state.room.name)}</h1></div><div class="btn-row">${isOwner() ? '<button class="btn" data-action="delete-room">Delete table</button>' : ''}<button class="btn" data-action="leave-room">Leave table</button></div></div><section class="room-layout"><div class="panel room-card"><div class="room-code"><span>${escapeHtml(state.room.code)}</span><button class="link-btn" data-action="copy-code">Copy</button></div><p class="subtle" style="margin-top:13px">Share this code with your friends. Only invited players can find this table.</p><div class="seat-list">${people}${empty}</div></div><aside class="panel room-side"><h3>${isOwner() ? 'You’re hosting' : 'Waiting for host'}</h3><p class="subtle">${isOwner() ? 'Start whenever you’re ready. The table will automatically fill any empty seats with bots.' : 'The host can begin as soon as they’re ready.'}</p><hr/><p class="subtle"><b>${state.members.length}</b> human ${state.members.length === 1 ? 'player' : 'players'} seated</p>${isOwner() ? '<button class="btn btn-primary" data-action="start-game">Deal the cards</button>' : ''}<button class="btn" data-action="refresh-room">Refresh seats</button></aside></section></main>`; }
function gameScreen() { if (!state.game) return `<main class="page"><div class="empty">Loading the table…</div></main>`; const bySeat = [0,1,2,3].map((seat) => state.players.find((player) => player.seat === seat)).filter(Boolean); const me = state.players.find((p) => p.user_id === mine()); const mySeat = me ? me.seat : 0;
      // Always render the human player at the bottom of the table, with the remaining three
      // seats placed clockwise in turn order (left, then top, then right) regardless of which
      // absolute seat numbers they hold — otherwise seating looked shuffled/reversed relative
      // to actual turn order.
      const others = [1, 2, 3].map((offset) => bySeat.find((player) => player.seat === (mySeat + offset) % 4)).filter(Boolean);
      const positions = ['left', 'top', 'right']; const opponentHtml = others.map((player, i) => `<div class="opponent ${positions[i] || 'top'} ${state.game.current_player_key === player.player_key ? 'turn-ring' : ''}">${avatar(player.display_name, player.avatar_url)}<div class="opponent-info"><div class="op-name">${escapeHtml(player.display_name)}</div><div class="card-count">${player.hand_count} cards${player.passed ? ' · passed' : ''}</div></div></div>`).join(''); const pile = (state.game.pile || []).map(cardFace).join(''); const myTurn = state.game.status === 'playing' && state.game.current_player_key === mine(); const cards = state.hand.map((card) => `<button class="card ${redSuits.has(card.suit) ? 'red' : ''} ${state.selected.includes(card.id) ? 'selected' : ''}" data-action="toggle-card" data-card="${card.id}" ${myTurn ? '' : 'disabled'}>${card.rank}<span>${suitSymbol[card.suit]}</span></button>`).join(''); const pileNote = state.game.last_play ? `${escapeHtml(state.game.last_play.player_name)} played ${state.game.last_play.label}` : 'New trick — any legal combination leads'; const result = state.game.status === 'finished' ? `<div class="modal-backdrop"><section class="modal panel"><p class="eyebrow">Round complete</p><h2>${escapeHtml(state.game.winner_name || 'A player')} goes out!</h2><p class="subtle">A new hand can be started by the host from the lobby.</p><div class="btn-row"><button class="btn btn-primary" data-action="back-lobby">Back to foyer</button></div></section></div>` : ''; return `<main class="table"><div class="table-top"><button class="btn" data-action="back-lobby">← Leave table</button><div class="game-title"><span class="status-dot"></span>${escapeHtml(state.room?.name || 'Tien Len')} · ${state.game.status === 'playing' ? 'In play' : state.game.status}</div><button class="btn icon-btn" data-action="refresh-game" aria-label="Refresh game">↻</button></div><section class="table-felt">${opponentHtml}<div class="center-play"><div class="pile">${pile || '<span class="subtle">The cards are waiting</span>'}</div><div class="pile-note">${pileNote}</div>${state.game.last_play?.passed_players?.length ? `<div class="pass-note">${state.game.last_play.passed_players.length} passed</div>` : ''}</div></section><section class="hand-zone"><div class="hand">${cards}</div></section><div class="game-controls">${myTurn ? `<button class="btn" data-action="pass" ${state.game.last_play ? '' : 'disabled'}>Pass</button><button class="btn btn-primary" data-action="play" ${state.selected.length ? '' : 'disabled'}>Play ${state.selected.length ? `(${state.selected.length})` : ''}</button>` : `<span class="hint">${state.game.status === 'finished' ? 'Round complete' : `Waiting for ${escapeHtml(state.players.find((p) => p.player_key === state.game.current_player_key)?.display_name || 'the next player')}…`}</span>`}</div>${result}</main>`; }
function profileScreen() { const p = state.profile || {}; return `<main class="page"><section class="panel profile-card"><div class="profile-head">${avatar(p.display_name || '?', state.avatarUrl, 'large')}<div><p class="eyebrow">Private profile</p><h1>Account settings</h1><p class="subtle">Your email and original avatar file are accessible only to you. Seated players receive a temporary image URL only while sharing a table.</p></div></div><form id="profile-form"><label class="field">DISPLAY NAME<input required name="displayName" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}" value="${escapeHtml(p.display_name || '')}" /></label><label class="field">PROFILE PHOTO<input name="avatar" type="file" accept="image/png,image/jpeg,image/webp" /><span class="upload-row">Images are resized in your browser to 320px WebP before upload.</span></label><p class="form-error" id="profile-error"></p><div class="page-actions" style="margin-top:19px"><button class="btn" type="button" data-action="home">Cancel</button><button class="btn btn-primary" type="submit">Save profile</button></div></form><p class="danger-copy">For account deletion, use the authenticated deletion endpoint you deploy alongside your Supabase project; never expose the service-role key to this app.</p></section></main>`; }
function cardFace(card) { return `<div class="played-card ${redSuits.has(card.suit) ? 'red' : ''}">${escapeHtml(card.rank)}<span>${suitSymbol[card.suit]}</span></div>`; }

async function requireSession() { if (!supabase || !state.session) throw new Error('Please sign in first.'); }
async function invoke(action, body = {}) { await requireSession(); const { data, error } = await supabase.functions.invoke('game-action', { body: { action, ...body } }); if (error) { let message = error.message || 'Something went wrong.'; const ctx = error.context; if (ctx && typeof ctx.json === 'function') { try { const parsed = await ctx.json(); if (parsed?.error) message = parsed.error; } catch (_) { /* response already read or not JSON */ } } throw new Error(message); } if (data?.error) throw new Error(data.error); return data; }
async function loadProfile() { const { data, error } = await supabase.from('profiles').select('display_name, avatar_path').eq('id', mine()).single(); if (error) throw error; state.profile = data; state.avatarUrl = await signedAvatar(data?.avatar_path); }
const avatarCache = new Map();
async function signedAvatar(path) { if (!path) return null; const cached = avatarCache.get(path); const now = Date.now(); if (cached && cached.expires > now) return cached.url; const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600); const url = data?.signedUrl || null; if (url) avatarCache.set(path, { url, expires: now + 55 * 60 * 1000 }); return url; }
// Batched sibling of signedAvatar: seats/players are always resolved together, so one
// createSignedUrls call (still respecting the same cache) replaces N sequential requests.
async function signedAvatarsFor(rows) {
  const now = Date.now();
  const paths = [...new Set((rows || []).map((row) => row.avatar_path).filter(Boolean))];
  const toFetch = paths.filter((path) => !(avatarCache.get(path)?.expires > now));
  if (toFetch.length) {
    const { data } = await supabase.storage.from('avatars').createSignedUrls(toFetch, 3600);
    (data || []).forEach((entry, i) => { if (entry?.signedUrl) avatarCache.set(toFetch[i], { url: entry.signedUrl, expires: now + 55 * 60 * 1000 }); });
  }
  return (rows || []).map((row) => ({ ...row, avatar_url: row.avatar_path ? (avatarCache.get(row.avatar_path)?.url || null) : null }));
}
async function loadRooms() { const { data, error } = await supabase.from('room_directory').select('*').order('created_at', { ascending: false }).limit(30); if (error) throw error; state.rooms = data || []; }
async function loadRoom(id = state.room?.id) {
  if (!id) return;
  // Room and its member list are independent reads keyed only by id — fetch them together
  // instead of waiting on one before starting the other.
  const [{ data: room, error }, { data: members, error: memberError }] = await Promise.all([
    supabase.from('rooms').select('id, code, name, visibility, owner_id, status').eq('id', id).single(),
    supabase.from('room_members').select('room_id, user_id, display_name, avatar_path, joined_at').eq('room_id', id).order('joined_at')
  ]);
  if (error) throw error; if (memberError) throw memberError;
  state.room = room;
  state.members = await signedAvatarsFor(members || []);
}
async function loadGame(forceHand = false) {
  if (!state.room) return;
  const { data: game, error } = await supabase.from('games').select('*').eq('room_id', state.room.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error; if (!game) { state.view = 'room'; return; }
  // My own hand only changes when I play/pass or a fresh deal starts — never because another
  // seat moved. Skip the extra round trip unless the caller knows the hand may have changed.
  const needHand = forceHand || !state.game || state.game.id !== game.id || !state.hand.length;
  state.game = game;
  const queries = [supabase.from('game_players').select('seat, player_key, user_id, display_name, avatar_path, hand_count, passed, is_bot').eq('game_id', game.id).order('seat')];
  if (needHand) queries.push(supabase.from('game_hands').select('cards').eq('game_id', game.id).eq('player_key', mine()).maybeSingle());
  const [{ data: players, error: playerError }, handResult] = await Promise.all(queries);
  if (playerError) throw playerError; if (handResult?.error) throw handResult.error;
  state.players = await signedAvatarsFor(players || []);
  if (needHand) state.hand = (handResult?.data?.cards || []).sort(sortCards);
  state.selected = state.selected.filter((id) => state.hand.some((card) => card.id === id));
  state.view = 'game';
}
function sortCards(a, b) { const ranks = ['3','4','5','6','7','8','9','10','J','Q','K','A','2']; const suits = ['spades','clubs','diamonds','hearts']; return ranks.indexOf(a.rank) - ranks.indexOf(b.rank) || suits.indexOf(a.suit) - suits.indexOf(b.suit); }
function clearChannel() { if (state.channel && supabase) supabase.removeChannel(state.channel); state.channel = null; }
// Realtime notifications (especially a run of bot moves) can arrive as several separate
// events a few dozen ms apart — too far apart for the in-flight mutex below to coalesce on
// its own. Debounce them into a single refresh so a burst of table changes costs one round
// trip instead of one per event.
let debounceTimer = null; let debounceScope = null;
function scheduleRefresh(scope) {
  debounceScope = debounceScope ? { room: debounceScope.room || scope.room, game: debounceScope.game || scope.game } : scope;
  if (debounceTimer) return;
  debounceTimer = setTimeout(() => { debounceTimer = null; const next = debounceScope; debounceScope = null; refreshActive(next); }, 150);
}
function watchRoom() { clearChannel(); if (!state.room) return; state.channel = supabase.channel(`table-${state.room.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${state.room.id}` }, () => scheduleRefresh({ room: true, game: false })).on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${state.room.id}` }, () => scheduleRefresh({ room: true, game: false })).on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `room_id=eq.${state.room.id}` }, () => { scheduleRefresh({ room: false, game: true }); stepBotsIfNeeded(); }).subscribe(); }
// Bots resolve one turn per server call so their moves can be shown one at a time (each seat
// lighting up in clockwise order) instead of an entire multi-bot cascade collapsing into a
// single, instant board update between two human turns. This loop drives that stepping from
// whichever browser is looking at the table; `stepping` keeps a single browser from starting
// two overlapping cascades on itself.
let stepping = false;
async function stepBotsIfNeeded() {
  if (stepping) return; stepping = true;
  try {
    for (let safety = 0; safety < 20; safety++) {
      if (state.view !== 'game' || state.game?.status !== 'playing') break;
      const current = state.players.find((p) => p.player_key === state.game.current_player_key);
      if (!current?.is_bot) break;
      await new Promise((resolve) => setTimeout(resolve, 650));
      if (state.view !== 'game' || !state.game) break;
      const { moved } = await invoke('advance_bot', { game_id: state.game.id });
      await loadGame(false);
      render();
      if (!moved) break;
    }
  } catch (error) { console.error('bot step failed', error); }
  finally { stepping = false; }
}
let refreshing = false; let pendingRefresh = null;
async function refreshActive(scope = { room: true, game: true }) {
  if (!state.room) return;
  if (refreshing) { pendingRefresh = pendingRefresh ? { room: pendingRefresh.room || scope.room, game: pendingRefresh.game || scope.game, forceHand: pendingRefresh.forceHand || scope.forceHand } : scope; return; }
  refreshing = true;
  try { if (scope.room) await loadRoom(); if (scope.game || state.view === 'game') await loadGame(scope.forceHand); render(); } catch (error) { console.error(error); }
  finally { refreshing = false; if (pendingRefresh) { const next = pendingRefresh; pendingRefresh = null; await refreshActive(next); } }
}
async function goHome() { clearChannel(); state.room = null; state.members = []; state.game = null; state.players = []; state.hand = []; state.selected = []; state.view = 'lobby'; await loadRooms(); render(); }
async function openRoom(id) { state.room = { id }; await Promise.all([loadRoom(id), loadGame(true)]); watchRoom(); render(); }
async function resizeAvatar(file) { if (!file || !file.type.startsWith('image/')) throw new Error('Please choose a PNG, JPEG, or WebP image.'); if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8 MB.'); const bitmap = await createImageBitmap(file); const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', .8)); if (!blob) throw new Error('Your browser could not prepare that image.'); return blob; }

document.addEventListener('submit', async (event) => { event.preventDefault(); const form = event.target; try { if (form.id === 'auth-form') { const fd = new FormData(form); const { error } = await supabase.auth.signInWithPassword({ email: fd.get('email'), password: fd.get('password') }); if (error) throw error; toast('Welcome back.'); } else if (form.id === 'signup-form') { const fd = new FormData(form); const displayName = fd.get('displayName').trim(); const { data, error } = await supabase.auth.signUp({ email: fd.get('email'), password: fd.get('password'), options: { data: { display_name: displayName } } }); if (error) throw error; if (!data.session) toast('Check your inbox to confirm your account.'); else toast('Account created.'); } else if (form.id === 'profile-form') { const fd = new FormData(form); const displayName = fd.get('displayName').trim(); let avatarPath = state.profile?.avatar_path || null; const file = fd.get('avatar'); if (file?.size) { const blob = await resizeAvatar(file); avatarPath = `${mine()}/avatar.webp`; const { error: uploadError } = await supabase.storage.from('avatars').upload(avatarPath, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: true }); if (uploadError) throw uploadError; } const { error } = await supabase.from('profiles').update({ display_name: displayName, avatar_path: avatarPath, updated_at: new Date().toISOString() }).eq('id', mine()); if (error) throw error; await loadProfile(); state.view = 'lobby'; await loadRooms(); render(); toast('Profile saved.'); } } catch (error) { const target = form.querySelector('.form-error'); if (target) target.textContent = error.message || 'Something went wrong.'; else toast(error.message || 'Something went wrong.', 'error'); } });
const busyActions = new Set(['confirm-create', 'join-public', 'join-code', 'leave-room', 'delete-room', 'start-game', 'play', 'pass', 'signout']);
let busy = false;
document.addEventListener('click', async (event) => { const button = event.target.closest('[data-action]'); if (!button) return; const action = button.dataset.action; if (busyActions.has(action)) { if (busy) return; busy = true; button.disabled = true; } try { if (action === 'signup-mode') { app.innerHTML = signupScreen(); return; } if (action === 'signin-mode') { app.innerHTML = authScreen(); return; } if (action === 'home' || action === 'back-lobby') { await goHome(); return; } if (action === 'profile') { state.view = 'profile'; render(); return; } if (action === 'signout') { clearChannel(); await supabase.auth.signOut(); return; } if (action === 'refresh-rooms') { await loadRooms(); render(); return; } if (action === 'create-room') { showCreateModal(); return; } if (action === 'join-public') { await invoke('join_room', { room_id: button.dataset.room }); await openRoom(button.dataset.room); return; } if (action === 'join-code') { const code = document.querySelector('#invite-code').value.trim().toUpperCase(); if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Enter the 6-character table code.'); const data = await invoke('join_room', { code }); await openRoom(data.room_id); return; } if (action === 'leave-room') { await invoke('leave_room', { room_id: state.room.id }); await goHome(); return; } if (action === 'refresh-room' || action === 'refresh-game') { await refreshActive({ room: true, game: true, forceHand: true }); return; } if (action === 'copy-code') { await navigator.clipboard.writeText(state.room.code); toast('Invite code copied.'); return; } if (action === 'start-game') { await invoke('start_game', { room_id: state.room.id }); await refreshActive({ room: true, game: true, forceHand: true }); stepBotsIfNeeded(); return; } if (action === 'toggle-card') { const id = button.dataset.card; state.selected = state.selected.includes(id) ? state.selected.filter((card) => card !== id) : [...state.selected, id]; updateHandSelectionUI(button); return; } if (action === 'play') { await invoke('play', { game_id: state.game.id, card_ids: state.selected }); state.selected = []; await refreshActive({ room: false, game: true, forceHand: true }); stepBotsIfNeeded(); return; } if (action === 'pass') { await invoke('pass', { game_id: state.game.id }); state.selected = []; await refreshActive({ room: false, game: true, forceHand: true }); stepBotsIfNeeded(); return; } if (action === 'delete-room') { if (!confirm('Delete this table? This cannot be undone.')) return; await invoke('delete_room', { room_id: state.room.id }); await goHome(); return; } if (action === 'close-modal') { document.querySelector('.modal-backdrop')?.remove(); return; } if (action === 'confirm-create') { const name = document.querySelector('#room-name').value.trim(); const visibility = document.querySelector('input[name="visibility"]:checked').value; if (name.length < 2) throw new Error('Give your table a name (2 characters or more).'); const data = await invoke('create_room', { name, visibility }); document.querySelector('.modal-backdrop')?.remove(); await openRoom(data.room_id); return; } } catch (error) { toast(error.message || 'Something went wrong.', 'error'); } finally { if (busyActions.has(action)) { busy = false; if (button.isConnected) button.disabled = false; } } });
// Selecting a card is the most frequent click in the app (players fan a hand out before
// playing) and previously rebuilt the entire screen — topbar, opponents, pile, and all other
// cards — on every tap. Toggling the one button plus the Play button's state avoids that.
function updateHandSelectionUI(button) {
  button.classList.toggle('selected');
  const playBtn = document.querySelector('[data-action="play"]');
  if (playBtn) { playBtn.disabled = !state.selected.length; playBtn.textContent = state.selected.length ? `Play (${state.selected.length})` : 'Play'; }
}
function showCreateModal() { document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop"><section class="modal panel"><p class="eyebrow">New table</p><h2>Set the room</h2><label class="field">TABLE NAME<input id="room-name" maxlength="40" value="${escapeHtml(state.profile?.display_name || 'My')}’s table" /></label><div class="radio-row"><label><input type="radio" name="visibility" value="public" checked />Public<br/><small>Listed in the foyer</small></label><label><input type="radio" name="visibility" value="private" />Private<br/><small>Code only</small></label></div><div class="btn-row"><button class="btn" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="confirm-create">Open table</button></div></section></div>`); }

async function bootstrap() { if (!configured) { render(); return; } if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {}); const { data: { session } } = await supabase.auth.getSession(); state.session = session; if (session) { try { await loadProfile(); await goHome(); } catch (error) { console.error(error); toast('Could not load your profile.', 'error'); render(); } } else render(); supabase.auth.onAuthStateChange(async (event, sessionNow) => { state.session = sessionNow; if (event === 'SIGNED_OUT' || !sessionNow) { clearChannel(); state.profile = null; state.avatarUrl = null; state.view = 'auth'; render(); return; } if (event !== 'SIGNED_IN') return; try { await loadProfile(); await goHome(); } catch (error) { console.error(error); } }); }
bootstrap();
