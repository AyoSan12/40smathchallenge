export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': 'https://40smathchallenge.vercel.app',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SEASON = 1;
const MODE = 'hard-40-mixed';
const DURATION_MS = 40_000;
const COUNTDOWN_MS = 3_000;
const MIN_ANSWER_INTERVAL_MS = 320;
const RANKS = ['Rookie', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Master', 'Grandmaster', 'Mathematician'];
const COLORS = ['#8a8aa8','#a66a3f','#c0c0c0','#f0d84a','#40e0d0','#5a8cff','#b06cff','#f06ca8','#ff8a40'];
const BOT_NAMES = [
  'Aoi','Ren','Yuki','Haru','Sora','Mio','Rin','Kaito','Hina','Kota','Mei','Riku','Nana','Suzu','Yuna','Rei','Kai','Noa','Mika','Kazu',
  'Ayaka','Emi','Hinata','Itsuki','Jun','Kei','Maki','Nagi','Rena','Shota','Toma','Yui','Yuya','Akari','Arata','Chihiro','Daiki','Ema','Fumi','Hikari',
  'Io','Kanon','Kohaku','Mao','Mari','Naoki','Rio','Saya','Shin','Taiga','Tsubasa','Wakana','Yuto','Akio','Asahi','Chika','Fuka','Hana','Issei','Koki',
  'Misaki','Nene','Osamu','Ryo','Saki','Takumi','Uta','Wataru','Yori','Zen','Aki','Erika','Hiro','Kumi','Mina','Nori','Rika','Shinobu','Takeshi','Yuma'
];

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function env() {
  return {
    url: (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_URL) || (typeof process !== 'undefined' && process.env?.KV_REST_API_URL) || globalThis.__env__?.UPSTASH_REDIS_REST_URL || globalThis.__env__?.KV_REST_API_URL,
    token: (typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_TOKEN) || (typeof process !== 'undefined' && process.env?.KV_REST_API_TOKEN) || globalThis.__env__?.UPSTASH_REDIS_REST_TOKEN || globalThis.__env__?.KV_REST_API_TOKEN,
    secret: (typeof process !== 'undefined' && process.env?.SESSION_SECRET) || globalThis.__env__?.SESSION_SECRET,
  };
}

async function redis(cmd, args = []) {
  const { url, token } = env();
  if (!url || !token) throw new Error('Redis unavailable');
  const path = [cmd, ...args.map(v => encodeURIComponent(String(v)))].join('/');
  const res = await fetch(`${url}/${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  const data = await res.json();
  return data.result;
}

async function sign(payload, secret) {
  const data = new TextEncoder().encode(payload);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name:'HMAC', hash:'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
}

async function issueToken(playerId, username, secret) {
  const payload = `${playerId}.${username}.${SEASON}`;
  return `${payload}.${await sign(payload, secret)}`;
}

async function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [playerId, username, season, sig] = parts;
  if (!/^\d+$/.test(season) || Number(season) !== SEASON) return null;
  if (!/^[a-z0-9_]{2,20}$/.test(username)) return null;
  const payload = `${playerId}.${username}.${season}`;
  const expected = await sign(payload, secret);
  if (sig !== expected) return null;
  return { playerId, username };
}

function rankName(rankIndex) {
  if (rankIndex < 0) return 'Placement';
  if (rankIndex >= 24) return 'Mathematician';
  const r = RANKS[Math.floor(rankIndex / 3)];
  const tier = ['III','II','I'][rankIndex % 3];
  return `${r} ${tier}`;
}

function rankIndexFromMmr(mmr) {
  if (mmr >= 2500) return 24;
  return Math.max(0, Math.min(23, Math.floor((mmr - 700) / 75)));
}

function rankColor(rankIndex) {
  if (rankIndex < 0) return '#6868a0';
  return COLORS[Math.min(7, Math.floor(rankIndex / 3))];
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function makeQuestion() {
  const op = ['multiplication','addition','subtraction','division'][randInt(0,3)];
  let a,b,answer,text;
  if (op === 'multiplication') {
    do { a = randInt(6,12); b = randInt(6,12); } while (a === 10 || b === 10);
    answer = a*b; text = `${a} × ${b}`;
  } else if (op === 'addition') {
    a = randInt(101,499); b = randInt(101,499); answer = a+b; text = `${a} + ${b}`;
  } else if (op === 'subtraction') {
    a = randInt(201,999); b = randInt(101,500); if (a < b) [a,b] = [b,a]; answer = a-b; text = `${a} − ${b}`;
  } else {
    const divisor = randInt(3,12), q = randInt(3,12); a = divisor*q; b = divisor; answer = q; text = `${a} ÷ ${b}`;
  }
  return { text, answer };
}

function makeQuestions(n = 80) { return Array.from({ length: n }, makeQuestion); }

function botProfile() {
  if (Math.random() < 0.018) return { id:'legend', name:'Legend', tier:'legend', accuracy:0.992, mean:1080, jitter:210, target:24, neverLoses:true };
  const skill = Math.random();
  if (skill < 0.20) return { id:`bot_${randInt(100000,999999)}`, name:BOT_NAMES[randInt(0,BOT_NAMES.length-1)], tier:'easy', accuracy:0.78+Math.random()*0.08, mean:1500+Math.random()*500, jitter:350, target:10+randInt(0,4) };
  if (skill < 0.55) return { id:`bot_${randInt(100000,999999)}`, name:BOT_NAMES[randInt(0,BOT_NAMES.length-1)], tier:'normal', accuracy:0.84+Math.random()*0.08, mean:1250+Math.random()*350, jitter:280, target:13+randInt(0,4) };
  if (skill < 0.90) return { id:`bot_${randInt(100000,999999)}`, name:BOT_NAMES[randInt(0,BOT_NAMES.length-1)], tier:'hard', accuracy:0.92+Math.random()*0.06, mean:980+Math.random()*250, jitter:210, target:16+randInt(0,3) };
  return { id:`bot_${randInt(100000,999999)}`, name:BOT_NAMES[randInt(0,BOT_NAMES.length-1)], tier:'elite', accuracy:0.95+Math.random()*0.045, mean:820+Math.random()*150, jitter:170, target:18+randInt(0,3) };
}

function makeProfile(playerId, username) {
  return {
    playerId, username, season: SEASON, mmr:1000, rankIndex:-1, rr:0, wins:0, losses:0, draws:0,
    placementGames:0, peakRankIndex:-1, shields:2, games:0, streak:0, bestStreak:0, updatedAt:Date.now()
  };
}

async function getProfile(pid, username='player') {
  const raw = await redis('get', [`comp:profile:${pid}`]);
  if (raw) return typeof raw === 'string' ? JSON.parse(raw) : raw;
  const p = makeProfile(pid, username);
  await saveProfile(p);
  return p;
}

async function saveProfile(p) {
  p.updatedAt = Date.now();
  await redis('set', [`comp:profile:${p.playerId}`, JSON.stringify(p)]);
  const score = Math.max(0, (p.rankIndex + 1) * 100000 + p.rr * 1000 + p.mmr);
  await redis('zadd', [`comp:lb:${SEASON}`, score, p.playerId]);
}

async function historyAdd(p, entry) {
  await redis('lpush', [`comp:history:${p.playerId}`, JSON.stringify(entry)]);
  await redis('ltrim', [`comp:history:${p.playerId}`, 0, 49]);
}

function outcomeFromStats(a,b) {
  const sa = a.correct * 1000 - a.wrong * 120;
  const sb = b.correct * 1000 - b.wrong * 120;
  if (sa !== sb) return sa > sb ? 'a' : 'b';
  if (a.totalMs !== b.totalMs) return a.totalMs < b.totalMs ? 'a' : 'b';
  return 'draw';
}

function applyRating(profile, result, opponentMmr) {
  const before = { mmr:profile.mmr, rr:profile.rr, rankIndex:profile.rankIndex };
  const k = profile.placementGames < 5 ? 48 : 28;
  const expected = 1 / (1 + 10 ** ((opponentMmr - profile.mmr) / 400));
  const actual = result === 'win' ? 1 : result === 'loss' ? 0 : 0.5;
  const delta = Math.round(k * (actual - expected));
  profile.mmr = clamp(profile.mmr + delta, 600, 2600);
  profile.games++;
  profile.placementGames++;
  if (result === 'win') { profile.wins++; profile.streak++; profile.bestStreak = Math.max(profile.bestStreak, profile.streak); }
  else if (result === 'loss') { profile.losses++; profile.streak = 0; }
  else profile.draws++;

  if (profile.placementGames >= 5 && profile.rankIndex < 0) {
    profile.rankIndex = rankIndexFromMmr(profile.mmr);
    const local = Math.max(0, profile.mmr - (700 + profile.rankIndex * 75));
    profile.rr = clamp(Math.round(local * 0.5 + 25), 0, 99);
    profile.peakRankIndex = profile.rankIndex;
  } else if (profile.rankIndex >= 0) {
    const gap = opponentMmr - before.mmr;
    const base = result === 'win' ? 18 : result === 'loss' ? -18 : 0;
    const swing = clamp(Math.round(gap / 80), -8, 8);
    const deltaRr = result === 'win' ? clamp(base + swing, 10, 30) : result === 'loss' ? clamp(base + swing, -30, -10) : 0;
    profile.rr += deltaRr;
    if (profile.rr >= 100) {
      while (profile.rr >= 100 && profile.rankIndex < 24) { profile.rr -= 100; profile.rankIndex++; }
      profile.shields = 2;
    }
    if (profile.rr < 0) {
      if (profile.shields > 0) { profile.shields--; profile.rr = 0; }
      else if (profile.rankIndex > 0) { profile.rankIndex--; profile.rr = 80; }
      else profile.rr = 0;
    }
    profile.peakRankIndex = Math.max(profile.peakRankIndex, profile.rankIndex);
  }
  return { before, after:{ mmr:profile.mmr, rr:profile.rr, rankIndex:profile.rankIndex }, mmrDelta:profile.mmr-before.mmr, rrDelta:profile.rr-before.rr };
}

async function createMatch(player, bot=false) {
  const botData = bot ? botProfile() : null;
  const matchId = crypto.randomUUID();
  const startAt = Date.now() + COUNTDOWN_MS;
  const state = {
    id:matchId, season:SEASON, mode:MODE, status:'ready', createdAt:Date.now(), startAt, endAt:startAt+DURATION_MS,
    players:{
      a:{ id:player.playerId, username:player.username, isBot:false, q:0, correct:0, wrong:0, totalMs:0, lastAnswerAt:0 },
      b: bot ? { id:botData.id, username:botData.name, isBot:true, q:0, correct:0, wrong:0, totalMs:0, lastAnswerAt:0 } : null
    },
    bot:botData,
    questions:makeQuestions(80)
  };
  await redis('set', [`comp:match:${matchId}`, JSON.stringify(state), 'ex', 300]);
  await redis('set', [`comp:player-match:${player.playerId}`, matchId, 'ex', 300]);
  return state;
}

async function loadMatch(id) {
  const raw = await redis('get', [`comp:match:${id}`]);
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : null;
}

function publicPlayer(p, now) {
  const out = { id:p.id, username:p.username, correct:p.correct, wrong:p.wrong, q:p.q, isBot:p.isBot };
  if (p.isBot) out.bot = true;
  return out;
}

function advanceBot(state) {
  if (!state.bot || !state.players.b) return;
  const bot = state.bot, b = state.players.b;
  const elapsed = Math.max(0, Date.now() - state.startAt);
  let target = Math.floor(elapsed / bot.mean);
  if (bot.neverLoses) target = Math.min(30, Math.floor(elapsed / Math.max(850, bot.mean - 120)));
  target = clamp(Math.max(target - 1, 0), 0, 79);
  while (b.q < target) {
    const good = Math.random() < bot.accuracy;
    const t = Math.round(clamp(bot.mean + (Math.random()*2-1)*bot.jitter, 650, 2600));
    b.totalMs += t; b.q++; if (good) b.correct++; else b.wrong++;
  }
}

async function finalize(state) {
  if (state.finalized) return state.finalResult;
  const lock = await redis('set', [`comp:finalize:${state.id}`, '1', 'ex', 10, 'nx']);
  if (lock !== 'OK' && lock !== 'ok') {
    const fresh = await loadMatch(state.id); return fresh?.finalResult || null;
  }
  advanceBot(state);
  const a = state.players.a, b = state.players.b;
  const winnerSide = outcomeFromStats(a,b);
  const resultA = winnerSide === 'a' ? 'win' : winnerSide === 'b' ? 'loss' : 'draw';
  const resultB = winnerSide === 'b' ? 'win' : winnerSide === 'a' ? 'loss' : 'draw';
  let ratingA = null, ratingB = null;
  if (!b.isBot) {
    const pa = await getProfile(a.id, a.username), pb = await getProfile(b.id, b.username);
    ratingA = applyRating(pa, resultA, pb.mmr);
    ratingB = applyRating(pb, resultB, pa.mmr);
    await saveProfile(pa); await saveProfile(pb);
    await historyAdd(pa, { matchId:state.id, type:'ranked', result:resultA, opponent:pb.username, rrDelta:ratingA.rrDelta, rank:rankName(pa.rankIndex), at:Date.now() });
    await historyAdd(pb, { matchId:state.id, type:'ranked', result:resultB, opponent:pa.username, rrDelta:ratingB.rrDelta, rank:rankName(pb.rankIndex), at:Date.now() });
  } else {
    const pa = await getProfile(a.id, a.username);
    await historyAdd(pa, { matchId:state.id, type:'bot', result:resultA, opponent:b.username, rrDelta:0, rank:rankName(pa.rankIndex), at:Date.now() });
  }
  state.status='finished'; state.finalized=true; state.endedAt=Date.now();
  state.finalResult = { winnerSide, resultA, resultB, a:ratingA, b:ratingB, scores:{ a:{correct:a.correct,wrong:a.wrong,totalMs:a.totalMs}, b:{correct:b.correct,wrong:b.wrong,totalMs:b.totalMs} } };
  await redis('set', [`comp:match:${state.id}`, JSON.stringify(state), 'ex', 300]);
  return state.finalResult;
}

async function maybeHumanPair(player) {
  const queueKey = `comp:queue:${SEASON}`;
  const members = await redis('zrange', [queueKey, 0, -1, 'WITHSCORES']);
  if (!Array.isArray(members)) return null;
  const now = Date.now();
  const mineRaw = await redis('get', [`comp:queue-player:${player.playerId}`]);
  const mine = mineRaw ? JSON.parse(mineRaw) : null;
  const wait = mine ? now - mine.joinedAt : 0;
  const windowMmr = wait < 5000 ? 120 : wait < 10000 ? 220 : wait < 20000 ? 380 : 650;
  for (let i=0;i<members.length;i+=2) {
    const pid = members[i], score = Number(members[i+1]);
    if (pid === player.playerId) continue;
    if (Math.abs(score-player.mmr) > windowMmr) continue;
    const lock = await redis('set', [`comp:pair-lock:${[player.playerId,pid].sort().join(':')}`, '1', 'ex', 5, 'nx']);
    if (lock !== 'OK' && lock !== 'ok') continue;
    const otherRaw = await redis('get', [`comp:queue-player:${pid}`]);
    if (!otherRaw) continue;
    const other = JSON.parse(otherRaw);
    const match = await createMatch(player, false);
    match.players.b = { id:other.playerId, username:other.username, isBot:false, q:0, correct:0, wrong:0, totalMs:0, lastAnswerAt:0 };
    await redis('set', [`comp:match:${match.id}`, JSON.stringify(match), 'ex', 300]);
    await redis('set', [`comp:player-match:${other.playerId}`, match.id, 'ex', 300]);
    await redis('zrem', [queueKey, player.playerId, pid]);
    await redis('del', [`comp:queue-player:${player.playerId}`, `comp:queue-player:${pid}`]);
    return match;
  }
  return null;
}

async function queuePlayer(player) {
  const current = await redis('get', [`comp:player-match:${player.playerId}`]);
  if (current) { const match = await loadMatch(current); if (match && match.status !== 'finished') return match; }
  const existingRaw = await redis('get', [`comp:queue-player:${player.playerId}`]);
  let queued = existingRaw ? JSON.parse(existingRaw) : null;
  if (!queued) {
    queued = { ...player, joinedAt:Date.now() };
    await redis('set', [`comp:queue-player:${player.playerId}`, JSON.stringify(queued), 'ex', 60]);
  } else {
    queued.username = player.username;
    queued.mmr = player.mmr;
    await redis('set', [`comp:queue-player:${player.playerId}`, JSON.stringify(queued), 'ex', 60]);
  }
  await redis('zadd', [`comp:queue:${SEASON}`, player.mmr, player.playerId]);
  const paired = await maybeHumanPair({ ...player, joinedAt: queued.joinedAt });
  if (paired) return paired;
  return null;
}

async function leaveQueue(pid) {
  await redis('zrem', [`comp:queue:${SEASON}`, pid]);
  await redis('del', [`comp:queue-player:${pid}`]);
  const mid = await redis('get', [`comp:player-match:${pid}`]);
  if (!mid) return true;
  const m = await loadMatch(mid);
  if (m && m.status !== 'finished' && m.players.b && m.players.b.isBot) await redis('del', [`comp:player-match:${pid}`]);
  return true;
}

async function handle(req) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.action !== 'string') return json(400,{error:'Invalid request'});
  const { secret } = env();
  if (!secret) return json(500,{error:'SESSION_SECRET missing'});
  if (body.action === 'bootstrap') {
    const username = String(body.username || '').toLowerCase();
    const playerId = String(body.playerId || '');
    if (!/^[a-z0-9_]{2,20}$/.test(username) || !/^[a-zA-Z0-9_-]{12,80}$/.test(playerId)) return json(400,{error:'Invalid identity'});
    const token = await issueToken(playerId, username, secret);
    const profile = await getProfile(playerId, username);
    return json(200,{ok:true, playerToken:token, profile:{...profile, rank:rankName(profile.rankIndex), rankColor:rankColor(profile.rankIndex)}});
  }
  const identity = await verifyToken(body.playerToken, secret);
  if (!identity) return json(403,{error:'Competitive session invalid'});

  if (body.action === 'profile') {
    const p = await getProfile(identity.playerId, identity.username);
    return json(200,{ok:true, profile:{...p, rank:rankName(p.rankIndex), rankColor:rankColor(p.rankIndex)}});
  }
  if (body.action === 'leaderboard') {
    const ids = await redis('zrevrange', [`comp:lb:${SEASON}`, 0, 49]);
    const rows=[];
    for (const pid of (ids||[])) { const p=await getProfile(pid); rows.push({rank:rows.length+1,username:p.username,rankName:rankName(p.rankIndex),rr:p.rr,mmr:p.mmr,isYou:pid===identity.playerId}); }
    return json(200,{ok:true,rows});
  }
  if (body.action === 'history') {
    const rows = await redis('lrange', [`comp:history:${identity.playerId}`,0,19]);
    return json(200,{ok:true,rows:(rows||[]).map(x=>typeof x==='string'?JSON.parse(x):x)});
  }
  if (body.action === 'join') {
    const p=await getProfile(identity.playerId,identity.username);
    const match=await queuePlayer({playerId:p.playerId,username:p.username,mmr:p.mmr});
    if (match) return json(200,{ok:true,status:'matched',match:publicMatch(match,identity.playerId)});
    const qraw=await redis('get',[`comp:queue-player:${identity.playerId}`]);
    const queued=qraw?JSON.parse(qraw):{joinedAt:Date.now()};
    if (Date.now()-queued.joinedAt >= 8000) {
      const lock=await redis('set',[`comp:bot-fallback:${identity.playerId}`,'1','ex',20,'nx']);
      if (lock==='OK'||lock==='ok') {
        await leaveQueue(identity.playerId);
        const botMatch=await createMatch({playerId:p.playerId,username:p.username},true);
        return json(200,{ok:true,status:'matched',match:publicMatch(botMatch,identity.playerId)});
      }
    }
    return json(200,{ok:true,status:'searching',waitMs:Date.now()-queued.joinedAt});
  }
  if (body.action === 'leave') { await leaveQueue(identity.playerId); return json(200,{ok:true}); }
  if (body.action === 'status') {
    const mid=body.matchId || await redis('get',[`comp:player-match:${identity.playerId}`]);
    if (!mid) return json(200,{ok:true,status:'idle'});
    const m=await loadMatch(mid); if(!m) return json(200,{ok:true,status:'idle'});
    advanceBot(m); if (Date.now()>=m.endAt && !m.finalized) await finalize(m);
    if (m.finalized) { const p=await getProfile(identity.playerId,identity.username); const myResult=m.finalResult?.winnerSide==='draw'?'draw':(identity.playerId===m.players.a.id?m.finalResult?.resultA:m.finalResult?.resultB); const myRating=identity.playerId===m.players.a.id?m.finalResult?.a:m.finalResult?.b; return json(200,{ok:true,status:'finished',match:publicMatch(m,identity.playerId),result:{...m.finalResult,myResult,myRating},profile:{...p,rank:rankName(p.rankIndex),rankColor:rankColor(p.rankIndex)}}); }
    return json(200,{ok:true,status:'matched',match:publicMatch(m,identity.playerId)});
  }
  if (body.action === 'answer') {
    const m=await loadMatch(body.matchId); if(!m) return json(404,{error:'Match not found'});
    const a=m.players.a.id===identity.playerId?m.players.a:m.players.b?.id===identity.playerId?m.players.b:null;
    if(!a||a.isBot) return json(403,{error:'Player not in match'});
    if(Date.now()<m.startAt || Date.now()>=m.endAt || m.finalized) return json(409,{error:'Match not active'});
    if(a.q >= m.questions.length) return json(409,{error:'Question limit reached'});
    const now=Date.now(); if(a.lastAnswerAt && now-a.lastAnswerAt<MIN_ANSWER_INTERVAL_MS) return json(429,{error:'Answer interval too fast'});
    if(!Number.isInteger(body.questionIndex) || body.questionIndex!==a.q) return json(409,{error:'Question sequence invalid'});
    if(!Number.isInteger(body.answer) || body.answer<0 || body.answer>999999) return json(400,{error:'Invalid answer'});
    const q=m.questions[a.q]; const isCorrect=body.answer===q.answer;
    const elapsed=Math.max(0,now-m.startAt); a.totalMs+=Math.max(0,elapsed-(a.lastAnswerAt? a.lastAnswerAt-m.startAt:0)); a.lastAnswerAt=now; a.q++; if(isCorrect)a.correct++;else a.wrong++;
    await redis('set',[`comp:match:${m.id}`,JSON.stringify(m),'ex',300]);
    return json(200,{ok:true,correct:isCorrect,nextQuestion:m.questions[a.q]?{index:a.q,text:m.questions[a.q].text}:null,me:publicPlayer(a,now)});
  }
  if (body.action === 'finalize') {
    const m=await loadMatch(body.matchId); if(!m) return json(404,{error:'Match not found'});
    if(Date.now()<m.endAt) return json(409,{error:'Match still running'});
    const result=await finalize(m); const p=await getProfile(identity.playerId,identity.username); const myResult=result?.winnerSide==='draw'?'draw':(identity.playerId===m.players.a.id?result?.resultA:result?.resultB); const myRating=identity.playerId===m.players.a.id?result?.a:result?.b; return json(200,{ok:true,status:'finished',result:{...result,myResult,myRating},profile:{...p,rank:rankName(p.rankIndex),rankColor:rankColor(p.rankIndex)},match:publicMatch(m,identity.playerId)});
  }
  return json(400,{error:'Unknown action'});
}

function publicMatch(m,pid) {
  advanceBot(m);
  const me=m.players.a.id===pid?m.players.a:m.players.b?.id===pid?m.players.b:null;
  const opp=m.players.a.id===pid?m.players.b:m.players.a;
  const now=Date.now();
  return {
    id:m.id, status:m.status, startAt:m.startAt, endAt:m.endAt, now, isBot:Boolean(opp?.isBot), botId:m.bot?.id||null,
    me:me?{username:me.username,correct:me.correct,wrong:me.wrong,q:me.q,isBot:false}:null,
    opponent:opp?publicPlayer(opp,now):null,
    question: me && m.status!=='finished' && m.questions[me.q] ? {index:me.q,text:m.questions[me.q].text}:null,
  };
}

export default async function handler(req) {
  if(req.method==='OPTIONS') return new Response(null,{status:200,headers:CORS});
  if(req.method!=='POST') return json(405,{error:'Method not allowed'});
  try { return await handle(req); } catch(err) { console.error('[COMPETITIVE]',err); return json(500,{error:'Competitive service unavailable'}); }
}
