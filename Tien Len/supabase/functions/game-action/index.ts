import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const suits = ['spades', 'clubs', 'diamonds', 'hearts'];
type Card = { id: string; rank: string; suit: string };
type Combo = { type: string; count: number; power: number; label: string };
const rankOf = (card: Card) => ranks.indexOf(card.rank);
const suitOf = (card: Card) => suits.indexOf(card.suit);
const sortCards = (cards: Card[]) => [...cards].sort((a, b) => rankOf(a) - rankOf(b) || suitOf(a) - suitOf(b));
const nextSeat = (seat: number) => (seat + 1) % 4;
const nextEligible = (players: any[], fromSeat: number, eligible: (player: any) => boolean) => {
  for (let offset = 1; offset <= 4; offset++) { const player = players.find((item) => item.seat === (fromSeat + offset) % 4); if (player && eligible(player)) return player; }
  return null;
};
const randomCode = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
const deck = (): Card[] => ranks.flatMap((rank) => suits.map((suit) => ({ id: `${rank}-${suit}`, rank, suit })));
const shuffle = <T>(items: T[]) => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };

function combo(cards: Card[]): Combo | null {
  const sorted = sortCards(cards); const values = sorted.map(rankOf); const groups = [...new Set(values)]; const same = groups.length === 1;
  if (cards.length === 1) return { type: 'single', count: 1, power: values[0] * 4 + suitOf(sorted[0]), label: 'a single' };
  if (cards.length === 2 && same) return { type: 'pair', count: 2, power: values[0], label: 'a pair' };
  if (cards.length === 3 && same) return { type: 'triple', count: 3, power: values[0], label: 'three of a kind' };
  if (cards.length === 4 && same) return { type: 'four', count: 4, power: values[0], label: 'four of a kind' };
  if (cards.length >= 3 && cards.length % 2 === 0 && groups.length === cards.length / 2 && groups.every((v) => values.filter((x) => x === v).length === 2) && groups.every((v, i) => i === 0 || v === groups[i - 1] + 1) && !groups.includes(12)) return { type: 'pair-run', count: cards.length, power: groups.at(-1)!, label: `${cards.length / 2} consecutive pairs` };
  if (cards.length >= 3 && groups.length === cards.length && !values.includes(12) && groups.every((v, i) => i === 0 || v === values[i - 1] + 1)) return { type: 'straight', count: cards.length, power: values.at(-1)!, label: 'a straight' };
  if (cards.length === 5) {
    const counts = groups.map((v) => values.filter((x) => x === v).length).sort();
    const flush = new Set(sorted.map((c) => c.suit)).size === 1;
    if (counts.join(',') === '2,3') return { type: 'full-house', count: 5, power: groups.find((v) => values.filter((x) => x === v).length === 3)!, label: 'a full house' };
    if (counts.join(',') === '1,4') return { type: 'four-plus', count: 5, power: groups.find((v) => values.filter((x) => x === v).length === 4)!, label: 'four of a kind' };
    if (flush) return { type: 'flush', count: 5, power: Math.max(...values) * 4 + Math.max(...sorted.map(suitOf)), label: 'a flush' };
  }
  return null;
}
// Bomb strength: four-of-a-kind ranked by card rank; longer chains of consecutive pairs rank
// above shorter chains and above four-of-a-kind. Returns -1 for a non-bomb combination.
const bombRank = (c: Combo) => c.type === 'four' ? 1000 + c.power : (c.type === 'pair-run' && c.count >= 6) ? 2000 + c.count * 10 + c.power : -1;
function beats(candidate: Combo, previous: Combo | null): boolean {
  if (!previous) return true;
  if (candidate.count === previous.count && candidate.type === previous.type) return candidate.power > previous.power;
  const candidateBomb = bombRank(candidate);
  if (candidateBomb < 0) return false;
  // Any bomb can cover a single 2, a pair of 2s, or a triple of 2s.
  const targetIsTwo = (previous.type === 'single' && previous.power >= 48) || ((previous.type === 'pair' || previous.type === 'triple') && previous.power === 12);
  if (targetIsTwo) return true;
  const previousBomb = bombRank(previous);
  return previousBomb >= 0 && candidateBomb > previousBomb;
}
function candidates(hand: Card[]) { const all: Card[][] = hand.map((c) => [c]); for (const rank of ranks) { const group = hand.filter((c) => c.rank === rank); for (let size = 2; size <= Math.min(group.length, 4); size++) all.push(group.slice(0, size)); } return all.filter((cards) => combo(cards)).sort((a, b) => (combo(a)!.power - combo(b)!.power) || a.length - b.length); }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const authHeader = request.headers.get('Authorization'); if (!authHeader) throw new Error('Missing authorization.');
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser(); if (authError || !user) throw new Error('Your session has expired. Please sign in again.');
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await request.json(); const action = body.action as string;
    const profileResult = await admin.from('profiles').select('*').eq('id', user.id).single(); if (profileResult.error) throw new Error('Profile unavailable.'); const profile = profileResult.data;

    if (action === 'create_room') {
      const name = String(body.name || '').trim(); const visibility = body.visibility === 'private' ? 'private' : 'public'; if (name.length < 2 || name.length > 40) throw new Error('Table names need 2–40 characters.');
      let room: any = null; for (let attempt = 0; attempt < 4 && !room; attempt++) { const result = await admin.from('rooms').insert({ code: randomCode(), name, visibility, owner_id: user.id }).select().single(); if (!result.error) room = result.data; }
      if (!room) throw new Error('Could not reserve a table code. Please try again.');
      const { error } = await admin.from('room_members').insert({ room_id: room.id, user_id: user.id, display_name: profile.display_name, avatar_path: profile.avatar_path }); if (error) throw error;
      return respond({ room_id: room.id });
    }
    if (action === 'join_room') {
      let query = admin.from('rooms').select('*').eq('status', 'waiting'); query = body.room_id ? query.eq('id', body.room_id) : query.eq('code', String(body.code || '').toUpperCase()); const { data: room, error } = await query.maybeSingle(); if (error || !room) throw new Error('That table is not accepting players.');
      if (room.visibility === 'private' && body.room_id) throw new Error('Private tables can only be joined with their invite code.');
      const { count } = await admin.from('room_members').select('*', { count: 'exact', head: true }).eq('room_id', room.id); const { data: already } = await admin.from('room_members').select('user_id').eq('room_id', room.id).eq('user_id', user.id).maybeSingle(); if (!already && (count || 0) >= 4) throw new Error('That table is full.');
      if (!already) { const inserted = await admin.from('room_members').insert({ room_id: room.id, user_id: user.id, display_name: profile.display_name, avatar_path: profile.avatar_path }); if (inserted.error) throw inserted.error; }
      return respond({ room_id: room.id });
    }
    if (action === 'leave_room') {
      const roomId = String(body.room_id); const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).single(); if (!room) throw new Error('Table not found.'); if (room.status !== 'waiting') throw new Error('A running game cannot be left from the lobby.');
      if (room.owner_id === user.id) { await admin.from('rooms').delete().eq('id', roomId); } else { const { error } = await admin.from('room_members').delete().eq('room_id', roomId).eq('user_id', user.id); if (error) throw error; }
      return respond({ ok: true });
    }
    if (action === 'start_game') {
      const roomId = String(body.room_id); const { data: room } = await admin.from('rooms').select('*').eq('id', roomId).single(); if (!room || room.owner_id !== user.id) throw new Error('Only the host can deal this table.'); if (room.status !== 'waiting') throw new Error('This table has already started.');
      const { data: members } = await admin.from('room_members').select('*').eq('room_id', roomId).order('joined_at'); if (!members?.length) throw new Error('Invite at least yourself to the table.');
      const players = members.map((m, seat) => ({ player_key: m.user_id, user_id: m.user_id, display_name: m.display_name, avatar_path: m.avatar_path, seat, is_bot: false }));
      while (players.length < 4) { const seat = players.length; players.push({ player_key: `bot-${crypto.randomUUID()}`, user_id: null, display_name: ['Bamboo','Jade','Saffron'][seat] || `Bot ${seat + 1}`, avatar_path: null, seat, is_bot: true }); }
      const deal = shuffle(deck()); const starter = players.find((player, index) => deal.slice(index * 13, index * 13 + 13).some((card) => card.id === '3-clubs'))!;
      const { data: game, error } = await admin.from('games').insert({ room_id: roomId, current_player_key: starter.player_key, leader_player_key: starter.player_key }).select().single(); if (error) throw error;
      const playerRows = players.map((player) => ({ ...player, game_id: game.id, hand_count: 13 })); const insertedPlayers = await admin.from('game_players').insert(playerRows); if (insertedPlayers.error) throw insertedPlayers.error;
      const hands = players.map((player, index) => ({ game_id: game.id, player_key: player.player_key, cards: sortCards(deal.slice(index * 13, index * 13 + 13)) })); const insertedHands = await admin.from('game_hands').insert(hands); if (insertedHands.error) throw insertedHands.error;
      await admin.from('rooms').update({ status: 'playing' }).eq('id', roomId); await safeRunBots(admin, game.id); return respond({ game_id: game.id });
    }
    if (action === 'play' || action === 'pass') {
      const gameId = String(body.game_id); const { data: game, error } = await admin.from('games').select('*').eq('id', gameId).single(); if (error || !game || game.status !== 'playing') throw new Error('That hand is no longer active.'); if (game.current_player_key !== user.id) throw new Error('It is not your turn.');
      const { data: player } = await admin.from('game_players').select('*').eq('game_id', gameId).eq('player_key', user.id).single(); if (!player) throw new Error('You are not seated in this game.');
      if (action === 'pass') { if (!game.last_play) throw new Error('You lead this trick, so you must play.'); await pass(admin, game, player); } else { await makePlay(admin, game, player, body.card_ids); }
      await safeRunBots(admin, gameId); return respond({ ok: true });
    }
    throw new Error('Unknown game action.');
  } catch (error) { console.error(error); return respond({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 400); }
});

async function makePlay(admin: any, game: any, player: any, ids: unknown) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 13) throw new Error('Choose cards to play.');
  const { data: hand } = await admin.from('game_hands').select('cards').eq('game_id', game.id).eq('player_key', player.player_key).single(); const cards: Card[] = hand?.cards || []; const chosen = ids.map(String).map((id) => cards.find((card) => card.id === id)); if (chosen.some((card) => !card) || new Set(ids).size !== ids.length) throw new Error('Those cards are not in your hand.');
  const candidate = combo(chosen as Card[]); const previous = game.last_play?.combo as Combo | undefined; if (!candidate) throw new Error('That is not a legal Tien Len combination.'); if (!beats(candidate, previous || null)) throw new Error('That does not beat the current play.');
  if (game.opening && !(chosen as Card[]).some((card) => card.id === '3-clubs')) throw new Error('The opening play must include the 3 of clubs.');
  const remaining = cards.filter((card) => !ids.includes(card.id)); const { data: players } = await admin.from('game_players').select('*').eq('game_id', game.id); if (!players) throw new Error('Players unavailable.');
  await admin.from('game_hands').update({ cards: sortCards(remaining) }).eq('game_id', game.id).eq('player_key', player.player_key); await admin.from('game_players').update({ hand_count: remaining.length, passed: false }).eq('game_id', game.id).eq('player_key', player.player_key);
  if (!remaining.length) { await admin.from('games').update({ status: 'finished', pile: chosen, winner_name: player.display_name, last_play: { player_name: player.display_name, combo: candidate, passed_players: [] }, updated_at: new Date().toISOString() }).eq('id', game.id); await admin.from('rooms').update({ status: 'finished' }).eq('id', game.room_id); return; }
  const next = nextEligible(players, player.seat, (candidate: any) => candidate.hand_count > 0 && !candidate.passed); if (!next) throw new Error('No eligible next player.'); await admin.from('games').update({ current_player_key: next.player_key, leader_player_key: player.player_key, opening: false, pile: chosen, last_play: { player_name: player.display_name, combo: candidate, label: candidate.label, passed_players: [] }, updated_at: new Date().toISOString() }).eq('id', game.id);
}
async function pass(admin: any, game: any, player: any) {
  const { data: players } = await admin.from('game_players').select('*').eq('game_id', game.id);
  const active = (players || []).filter((p: any) => p.hand_count > 0);
  await admin.from('game_players').update({ passed: true }).eq('game_id', game.id).eq('player_key', player.player_key);
  const passed = [...(game.last_play?.passed_players || []), player.display_name];
  const leader = active.find((p: any) => p.player_key === game.leader_player_key);
  const next = nextEligible(active, player.seat, (candidate: any) => candidate.player_key !== player.player_key && !candidate.passed);
  // If everyone else has passed, or (defensively) no eligible next player can be found due to a
  // transient state mismatch, hand the trick back to the leader instead of failing the request.
  if ((passed.length >= active.length - 1 || !next) && leader) {
    await admin.from('game_players').update({ passed: false }).eq('game_id', game.id);
    await admin.from('games').update({ current_player_key: leader.player_key, pile: [], last_play: null, updated_at: new Date().toISOString() }).eq('id', game.id);
  } else if (next) {
    await admin.from('games').update({ current_player_key: next.player_key, last_play: { ...game.last_play, passed_players: passed }, updated_at: new Date().toISOString() }).eq('id', game.id);
  }
}
async function runBots(admin: any, gameId: string) {
  for (let safety = 0; safety < 12; safety++) { const { data: game } = await admin.from('games').select('*').eq('id', gameId).single(); if (!game || game.status !== 'playing') return; const { data: bot } = await admin.from('game_players').select('*').eq('game_id', gameId).eq('player_key', game.current_player_key).single(); if (!bot?.is_bot) return; const { data: handRow } = await admin.from('game_hands').select('cards').eq('game_id', gameId).eq('player_key', bot.player_key).single(); const options = candidates(handRow?.cards || []); const previous = game.last_play?.combo as Combo | undefined; const pick = options.find((option) => beats(combo(option)!, previous || null)); if (pick) await makePlay(admin, game, bot, pick.map((card) => card.id)); else await pass(admin, game, bot); }
}
// Bot turns run after every human action. A bot hiccup must never turn a player's own
// successful move into a reported failure, so bot processing failures are swallowed here.
async function safeRunBots(admin: any, gameId: string) {
  try { await runBots(admin, gameId); } catch (error) { console.error('bot turn failed', error); }
}
function respond(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...cors, 'Content-Type': 'application/json' } }); }
