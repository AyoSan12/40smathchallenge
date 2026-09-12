(() => {
  'use strict';

  const STYLE_ID = 'competitive-style-v1';
  const PLAYER_KEY = '40s_comp_player_v1';
  const TOKEN_KEY = '40s_comp_token_v1';
  const API = '/api/competitive';

  const copy = {
    en: {
      choose:'CHOOSE GAME MODE', single:'SINGLE PLAYER', singleSub:'Classic 40s Math Challenge', comp:'COMPETITIVE', compSub:'Ranked 1v1 · Hard · 40s · Mixed Math', back:'← BACK',
      competitive:'COMPETITIVE', start:'START COMPETE', history:'MATCH HISTORY', leaderboard:'LEADERBOARD', rankInfo:'RANK INFO', searching:'SEARCHING FOR OPPONENT', cancel:'CANCEL',
      placement:'PLACEMENT', wins:'WINS', losses:'LOSSES', winRate:'WIN RATE', peak:'PEAK RANK', shields:'SHIELDS', noHistory:'No matches yet.', noPlayers:'No ranked players yet.',
      rankedRules:'RANK SYSTEM', rankedDesc:'Win ranked matches to gain RR. Reach 100 RR to promote. At 0 RR, shields can protect you before demotion.',
      mode:'HARD · 40 SECONDS · MIXED MATH', ready:'MATCH FOUND', versus:'VS', bot:'AI OPPONENT', player:'PLAYER', victory:'VICTORY', defeat:'DEFEAT', draw:'DRAW',
      rr:'RR', next:'NEXT QUESTION', answer:'ANSWER', score:'SCORE', correct:'CORRECT', wrong:'WRONG', rankUp:'RANK UP!', derank:'DE-RANK',
      botNoRating:'Bot matches do not change RR or MMR.', legend:'LEGEND', legendary:'LEGENDARY AI · NEVER LOSES',
    },
    id: {
      choose:'PILIH MODE GAME', single:'SINGLE PLAYER', singleSub:'Mode klasik 40s Math Challenge', comp:'COMPETITIVE', compSub:'Ranked 1v1 · Sulit · 40s · Matematika Campuran', back:'← KEMBALI',
      competitive:'COMPETITIVE', start:'MULAI COMPETE', history:'RIWAYAT MATCH', leaderboard:'LEADERBOARD', rankInfo:'INFO RANK', searching:'MENCARI LAWAN', cancel:'BATAL',
      placement:'PLACEMENT', wins:'MENANG', losses:'KALAH', winRate:'WIN RATE', peak:'RANK TERTINGGI', shields:'SHIELD', noHistory:'Belum ada match.', noPlayers:'Belum ada pemain ranked.',
      rankedRules:'SISTEM RANK', rankedDesc:'Menang ranked untuk mendapat RR. Capai 100 RR untuk naik rank. Saat 0 RR, shield bisa melindungi sebelum de-rank.',
      mode:'SULIT · 40 DETIK · MATEMATIKA CAMPURAN', ready:'LAWAN DITEMUKAN', versus:'VS', bot:'LAWAN AI', player:'PEMAIN', victory:'MENANG', defeat:'KALAH', draw:'SERI',
      rr:'RR', next:'SOAL BERIKUTNYA', answer:'JAWAB', score:'SKOR', correct:'BENAR', wrong:'SALAH', rankUp:'NAIK RANK!', derank:'DE-RANK',
      botNoRating:'Match bot tidak mengubah RR atau MMR.', legend:'LEGEND', legendary:'AI LEGENDARIS · TIDAK PERNAH KALAH',
    },
    ja: {
      choose:'ゲームモードを選択', single:'シングルプレイ', singleSub:'クラシック 40秒 Math Challenge', comp:'コンペティティブ', compSub:'ランク1v1 · HARD · 40秒 · MIXED', back:'← 戻る',
      competitive:'COMPETITIVE', start:'対戦開始', history:'対戦履歴', leaderboard:'ランキング', rankInfo:'ランク情報', searching:'対戦相手を検索中', cancel:'キャンセル',
      placement:'PLACEMENT', wins:'勝利', losses:'敗北', winRate:'勝率', peak:'最高ランク', shields:'シールド', noHistory:'まだ対戦履歴はありません。', noPlayers:'ランクプレイヤーはいません。',
      rankedRules:'ランクシステム', rankedDesc:'勝利してRRを獲得。100 RRで昇格。0 RRではシールドが降格を防ぐことがあります。',
      mode:'HARD · 40秒 · MIXED MATH', ready:'対戦相手が見つかりました', versus:'VS', bot:'AI', player:'PLAYER', victory:'勝利', defeat:'敗北', draw:'引き分け',
      rr:'RR', next:'次の問題', answer:'回答', score:'スコア', correct:'正解', wrong:'不正解', rankUp:'ランクアップ!', derank:'降格',
      botNoRating:'Bot戦ではRRとMMRは変化しません。', legend:'LEGEND', legendary:'伝説のAI · 無敗',
    },
    ko: {
      choose:'게임 모드 선택', single:'싱글 플레이', singleSub:'클래식 40초 Math Challenge', comp:'경쟁전', compSub:'랭크 1v1 · HARD · 40초 · MIXED', back:'← 뒤로',
      competitive:'COMPETITIVE', start:'경쟁 시작', history:'전적', leaderboard:'리더보드', rankInfo:'랭크 정보', searching:'상대를 찾는 중', cancel:'취소',
      placement:'배치', wins:'승', losses:'패', winRate:'승률', peak:'최고 랭크', shields:'실드', noHistory:'아직 전적이 없습니다.', noPlayers:'랭크 플레이어가 없습니다.',
      rankedRules:'랭크 시스템', rankedDesc:'랭크에서 승리하면 RR을 얻습니다. 100 RR에서 승급하며, 0 RR에서는 실드가 강등을 막을 수 있습니다.',
      mode:'HARD · 40초 · MIXED MATH', ready:'상대를 찾았습니다', versus:'VS', bot:'AI 상대', player:'플레이어', victory:'승리', defeat:'패배', draw:'무승부',
      rr:'RR', next:'다음 문제', answer:'답변', score:'점수', correct:'정답', wrong:'오답', rankUp:'랭크 업!', derank:'강등',
      botNoRating:'Bot 매치는 RR과 MMR을 변경하지 않습니다.', legend:'LEGEND', legendary:'전설의 AI · 무패',
    }
  };

  const ranks = ['Scalar','Integer','Prime','Vector','Matrix','Euler','Gauss','Infinity'];
  const rankColor = i => ['#8a8aa8','#72a0ff','#b26cff','#40e0f0','#f0e040','#40f070','#f09040','#f04070'][Math.min(7, Math.max(0, Math.floor(Math.max(0,i)/3)))];
  const text = k => {
    const lang = (typeof currentLang !== 'undefined' && copy[currentLang]) ? currentLang : 'en';
    return copy[lang][k] || copy.en[k] || k;
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = n => Number(n||0).toLocaleString();

  function rankLabel(p) {
    if (!p || Number(p.rankIndex) < 0) return text('placement');
    if (Number(p.rankIndex) >= 21) return 'Infinity';
    return `${ranks[Math.floor(p.rankIndex/3)]} ${['III','II','I'][p.rankIndex%3]}`;
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style'); s.id = STYLE_ID;
    s.textContent = `
      #comp-mode-modal{position:fixed;inset:0;z-index:420;background:rgba(10,10,15,.78);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:16px}
      #comp-mode-modal.show{display:flex}
      .comp-mode-box{width:min(100%,520px);background:var(--card);border:1px solid var(--border);border-radius:18px;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.45)}
      .comp-mode-kicker{font:700 10px 'Space Grotesk',sans-serif;letter-spacing:3px;color:var(--muted);text-align:center;margin-bottom:10px}
      .comp-mode-title{font:800 clamp(24px,7vw,40px) 'Plus Jakarta Sans',sans-serif;text-align:center;color:var(--text);line-height:1.05;margin-bottom:18px}
      .comp-mode-grid{display:grid;gap:10px}
      .comp-mode-btn{width:100%;border:1px solid var(--border);background:var(--surface);border-radius:14px;padding:18px;text-align:left;cursor:pointer;color:var(--text);transition:.18s;touch-action:manipulation}
      .comp-mode-btn:active{transform:scale(.985)} .comp-mode-btn:hover{border-color:var(--accent2);box-shadow:0 8px 30px rgba(0,0,0,.2)}
      .comp-mode-btn strong{display:block;font:800 20px 'Plus Jakarta Sans',sans-serif;letter-spacing:1px}.comp-mode-btn span{display:block;margin-top:5px;font:11px 'Space Grotesk',sans-serif;color:var(--muted);line-height:1.5}
      #screen-competitive{padding:16px;justify-content:flex-start;gap:0;overflow-y:auto}
      .comp-shell{width:100%;max-width:760px;margin:0 auto;padding:8px 0 40px}
      .comp-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0 16px}
      .comp-title{font:800 clamp(22px,7vw,34px) 'Plus Jakarta Sans',sans-serif;letter-spacing:1px}.comp-kicker{font:700 9px 'Space Grotesk',sans-serif;color:var(--muted);letter-spacing:2px;margin-top:3px}
      .comp-icon-btn{min-width:42px;height:42px;border:1px solid var(--border);background:var(--card);color:var(--muted);border-radius:10px;cursor:pointer;font-size:16px;touch-action:manipulation}
      .comp-rank-card{background:linear-gradient(145deg,var(--card),var(--surface));border:1px solid var(--border);border-radius:18px;padding:18px;position:relative;overflow:hidden}
      .comp-rank-card:after{content:'';position:absolute;inset:auto -30px -50px auto;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(240,224,64,.10),transparent 65%);pointer-events:none}
      .comp-rank-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.comp-rank-name{font:800 clamp(28px,9vw,44px) 'Plus Jakarta Sans',sans-serif;letter-spacing:1px}.comp-rank-rr{font:800 24px 'Plus Jakarta Sans',sans-serif;color:var(--accent);text-align:right}.comp-rank-sub{font:10px 'Space Grotesk',sans-serif;color:var(--muted);letter-spacing:2px;margin-top:4px}
      .comp-bar{height:9px;background:var(--surface);border:1px solid var(--border);border-radius:99px;overflow:hidden;margin:16px 0 12px}.comp-bar>span{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:inherit;transition:width .4s}
      .comp-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.comp-stat{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:10px 6px;text-align:center}.comp-stat b{display:block;font:800 17px 'Plus Jakarta Sans',sans-serif}.comp-stat span{display:block;color:var(--muted);font:8px 'Space Grotesk',sans-serif;letter-spacing:1px;text-transform:uppercase;margin-top:3px}
      .comp-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.comp-main-btn{grid-column:1/-1;width:100%;padding:17px 14px;border:0;border-radius:12px;background:var(--accent);color:#0a0a0f;font:800 18px 'Plus Jakarta Sans',sans-serif;letter-spacing:2px;cursor:pointer;touch-action:manipulation}.comp-sub-btn{width:100%;padding:13px 8px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:11px;font:700 10px 'Space Grotesk',sans-serif;letter-spacing:1px;cursor:pointer;touch-action:manipulation}
      .comp-section{margin-top:12px;background:var(--card);border:1px solid var(--border);border-radius:15px;padding:15px}.comp-section h3{font:800 10px 'Space Grotesk',sans-serif;letter-spacing:3px;color:var(--muted);margin-bottom:11px}
      .comp-info{font:11px 'Space Grotesk',sans-serif;color:var(--muted);line-height:1.7}.comp-rank-list{display:grid;gap:5px}.comp-rank-row,.comp-history-row,.comp-lb-row{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font:10px 'Space Grotesk',sans-serif}.comp-rank-dot{width:10px;height:10px;border-radius:50%;flex:none}.comp-grow{flex:1}.comp-rank-row b,.comp-history-row b,.comp-lb-row b{font-size:11px;color:var(--text)}.comp-muted{color:var(--muted)}.comp-pos{font:800 12px 'Plus Jakarta Sans',sans-serif;width:24px;text-align:center;color:var(--muted)}
      #comp-match{display:none;position:fixed;inset:0;z-index:390;background:var(--bg);overflow:hidden}.comp-arena{height:100%;display:flex;flex-direction:column;width:100%;max-width:820px;margin:0 auto}.comp-vsbar{padding:12px 12px 9px;background:var(--surface);border-bottom:1px solid var(--border)}.comp-vsrow{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.comp-side{min-width:0}.comp-side.right{text-align:right}.comp-side .nm{font:800 13px 'Plus Jakarta Sans',sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.comp-side .st{font:9px 'Space Grotesk',sans-serif;color:var(--muted);margin-top:2px}.comp-vs{font:800 11px 'Space Grotesk',sans-serif;letter-spacing:2px;color:var(--muted)}.comp-time{font:800 32px 'Plus Jakarta Sans',sans-serif;color:var(--accent);text-align:center;line-height:1;margin:8px 0 2px}.comp-time.danger{color:var(--accent3)}.comp-timebar{height:3px;background:var(--border)}.comp-timebar span{display:block;height:100%;background:var(--accent);transition:width .1s linear}
      .comp-question{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:22px 16px;gap:16px;min-height:0}.comp-qmeta{font:700 9px 'Space Grotesk',sans-serif;color:var(--muted);letter-spacing:2px;text-transform:uppercase}.comp-qtext{font:800 clamp(44px,15vw,92px) 'Plus Jakarta Sans',sans-serif;text-align:center;line-height:1;color:var(--text);letter-spacing:1px}.comp-answer{width:min(92%,340px);height:68px;background:var(--card);border:1.5px solid var(--border);border-radius:14px;color:var(--accent);font:800 36px 'Plus Jakarta Sans',sans-serif;text-align:center;outline:none;padding:0 14px}.comp-answer:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(240,224,64,.08)}.comp-submit{width:min(92%,340px);height:54px;background:var(--accent2);color:#071014;border:0;border-radius:12px;font:800 15px 'Plus Jakarta Sans',sans-serif;letter-spacing:2px;cursor:pointer;touch-action:manipulation}.comp-live{height:18px;font:800 10px 'Space Grotesk',sans-serif;letter-spacing:2px}.comp-live.good{color:var(--green)}.comp-live.bad{color:var(--accent3)}
      .comp-footer{padding:9px 12px calc(9px + env(safe-area-inset-bottom));background:var(--surface);border-top:1px solid var(--border);font:10px 'Space Grotesk',sans-serif;color:var(--muted);display:flex;justify-content:space-between;gap:8px}.comp-footer b{color:var(--text)}
      #comp-result{display:none;position:fixed;inset:0;z-index:410;background:rgba(10,10,15,.92);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px}.comp-result-card{width:min(100%,430px);background:var(--card);border:1px solid var(--border);border-radius:18px;padding:22px;text-align:center}.comp-result-title{font:800 clamp(34px,12vw,54px) 'Plus Jakarta Sans',sans-serif;letter-spacing:1px}.comp-result-title.win{color:var(--green)}.comp-result-title.loss{color:var(--accent3)}.comp-result-title.draw{color:var(--accent2)}.comp-result-op{margin-top:4px;color:var(--muted);font:10px 'Space Grotesk',sans-serif;letter-spacing:2px}.comp-result-score{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}.comp-result-side{background:var(--surface);border:1px solid var(--border);border-radius:11px;padding:12px}.comp-result-side b{display:block;font:800 25px 'Plus Jakarta Sans',sans-serif}.comp-result-side span{font:9px 'Space Grotesk',sans-serif;color:var(--muted)}.comp-rr-change{font:800 34px 'Plus Jakarta Sans',sans-serif;color:var(--accent);margin:6px 0}.comp-result-note{font:10px 'Space Grotesk',sans-serif;color:var(--muted);line-height:1.6;margin-bottom:14px}.comp-result-btn{width:100%;padding:14px;border-radius:11px;border:0;background:var(--accent);color:#0a0a0f;font:800 14px 'Plus Jakarta Sans',sans-serif;letter-spacing:1px;cursor:pointer;touch-action:manipulation}
      #comp-toast{position:fixed;left:50%;bottom:18px;transform:translate(-50%,120px);z-index:600;background:var(--card);border:1px solid var(--border);border-radius:9px;padding:10px 14px;font:700 10px 'Space Grotesk',sans-serif;color:var(--text);transition:.25s;max-width:90vw;text-align:center}.show{transform:translate(-50%,0)!important}
      @media(max-width:520px){#screen-competitive{padding:10px 10px 26px}.comp-actions{grid-template-columns:1fr 1fr}.comp-stats{grid-template-columns:repeat(2,1fr);gap:6px}.comp-stat{padding:9px 5px}.comp-header{margin-top:3px}.comp-rank-card{padding:15px}.comp-rank-name{font-size:29px}.comp-question{padding-left:10px;padding-right:10px}.comp-qtext{font-size:clamp(42px,14vw,74px)}.comp-answer{height:64px}.comp-submit{height:52px}}
      @media(min-width:700px){.comp-shell{padding-top:16px}.comp-rank-card{padding:22px}.comp-actions{grid-template-columns:1.2fr 1fr 1fr}.comp-main-btn{grid-column:auto}.comp-section{padding:18px}}
    `;
    document.head.appendChild(s);
  }

  function ensureUi() {
    if (document.getElementById('comp-mode-modal')) return;
    const modal = document.createElement('div'); modal.id='comp-mode-modal';
    modal.innerHTML = `<div class="comp-mode-box"><div class="comp-mode-kicker">40s MATH CHALLENGE</div><div class="comp-mode-title" data-ct="choose">${esc(text('choose'))}</div><div class="comp-mode-grid"><button class="comp-mode-btn" id="comp-single-btn"><strong data-ct="single">${esc(text('single'))}</strong><span data-ct="singleSub">${esc(text('singleSub'))}</span></button><button class="comp-mode-btn" id="comp-online-btn"><strong data-ct="comp">${esc(text('comp'))}</strong><span data-ct="compSub">${esc(text('compSub'))}</span></button><button class="comp-sub-btn" id="comp-mode-back" style="margin-top:3px">${esc(text('back'))}</button></div></div>`;
    document.body.appendChild(modal);

    const scr = document.createElement('div'); scr.id='screen-competitive'; scr.className='screen';
    scr.innerHTML = `<div class="comp-shell" id="comp-shell"></div>`;
    document.body.appendChild(scr);

    const match = document.createElement('div'); match.id='comp-match'; match.innerHTML = `<div class="comp-arena"><div class="comp-vsbar"><div class="comp-vsrow"><div class="comp-side"><div class="nm" id="cm-me">PLAYER</div><div class="st" id="cm-me-rank">PLACEMENT</div></div><div class="comp-vs" id="cm-vs">VS</div><div class="comp-side right"><div class="nm" id="cm-opp">OPPONENT</div><div class="st" id="cm-opp-rank">PLAYER</div></div></div><div class="comp-time" id="cm-time">40</div><div class="comp-timebar"><span id="cm-timebar"></span></div></div><div class="comp-question"><div class="comp-qmeta" id="cm-qmeta">HARD · 40 SECONDS · MIXED MATH</div><div class="comp-qtext" id="cm-qtext">7 × 9 = ?</div><input class="comp-answer" id="cm-answer" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6" aria-label="Answer"><button class="comp-submit" id="cm-submit">ANSWER</button><div class="comp-live" id="cm-live"></div></div><div class="comp-footer"><span><b id="cm-me-score">0</b> <span data-f="correct">CORRECT</span> · <b id="cm-me-wrong">0</b> <span data-f="wrong">WRONG</span></span><span id="cm-bot-note"></span></div></div>`; document.body.appendChild(match);

    const result=document.createElement('div'); result.id='comp-result'; result.innerHTML=`<div class="comp-result-card"><div class="comp-result-title" id="cr-title">VICTORY</div><div class="comp-result-op" id="cr-opponent">OPPONENT</div><div class="comp-result-score"><div class="comp-result-side"><b id="cr-me">0</b><span>YOU</span></div><div class="comp-result-side"><b id="cr-opp">0</b><span>OPPONENT</span></div></div><div class="comp-rr-change" id="cr-rr">+0 RR</div><div class="comp-result-note" id="cr-note"></div><button class="comp-result-btn" id="cr-close">CONTINUE</button></div>`; document.body.appendChild(result);

    const toast=document.createElement('div'); toast.id='comp-toast'; document.body.appendChild(toast);

    document.getElementById('comp-single-btn').onclick=()=>{ modal.classList.remove('show'); localStorage.removeItem(TOKEN_KEY); showScreen('difficulty'); };
    document.getElementById('comp-online-btn').onclick=()=>{ modal.classList.remove('show'); showCompetitiveHome(); };
    document.getElementById('comp-mode-back').onclick=()=>modal.classList.remove('show');
    document.getElementById('cm-submit').onclick=submitAnswer;
    document.getElementById('cm-answer').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submitAnswer()}});
    document.getElementById('cr-close').onclick=()=>{document.getElementById('comp-result').style.display='none';showCompetitiveHome();};
  }

  function updateLocalizedUi(){
    const modal=document.getElementById('comp-mode-modal'); if(modal) modal.querySelectorAll('[data-ct]').forEach(e=>e.textContent=text(e.dataset.ct));
    document.querySelectorAll('[data-f="correct"]').forEach(e=>e.textContent=text('correct')); document.querySelectorAll('[data-f="wrong"]').forEach(e=>e.textContent=text('wrong'));
  }

  function showToast(msg,ms=2500){const t=document.getElementById('comp-toast');if(!t)return;t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),ms)}

  function playerId(){
    let id=localStorage.getItem(PLAYER_KEY); if(!id){id=(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2));localStorage.setItem(PLAYER_KEY,id)} return id;
  }
  let profile=null; let match=null; let poll=null; let qBusy=false;

  async function api(action,payload={}){
    const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...payload})});
    const data=await res.json().catch(()=>({error:'Invalid server response'})); if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`); return data;
  }

  async function bootstrap(){
    const name=(typeof state!=='undefined'?state.username:'')||localStorage.getItem('lastUsername')||'player';
    let token=localStorage.getItem(TOKEN_KEY);
    if(token){try{const d=await api('profile',{playerToken:token});profile=d.profile;return}catch{localStorage.removeItem(TOKEN_KEY)}}
    const d=await api('bootstrap',{playerId:playerId().replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80),username:String(name).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20)||'player'});
    localStorage.setItem(TOKEN_KEY,d.playerToken); profile=d.profile;
  }

  async function refreshProfile(){const token=localStorage.getItem(TOKEN_KEY);if(!token) await bootstrap();else{const d=await api('profile',{playerToken:token});profile=d.profile}}

  function homeHtml(){
    const p=profile||{}; const ranked=p.rankIndex>=0; const rr=Number(p.rr||0); const wr=(p.wins||0)+(p.losses||0)?((p.wins||0)/((p.wins||0)+(p.losses||0))*100).toFixed(1):'0.0';
    return `<div class="comp-header"><div><div class="comp-title">${esc(text('competitive'))}</div><div class="comp-kicker">${esc(text('mode'))}</div></div><button class="comp-icon-btn" id="comp-home-back" aria-label="Back">←</button></div>
      <div class="comp-rank-card"><div class="comp-rank-top"><div><div class="comp-rank-sub">${ranked?esc(text('rr')):esc(text('placement'))}</div><div class="comp-rank-name" style="color:${esc(p.rankColor||rankColor(p.rankIndex))}">${esc(rankLabel(p))}</div></div><div class="comp-rank-rr">${ranked?rr:'—'}<div class="comp-rank-sub">${esc(text('rr'))}</div></div></div><div class="comp-bar"><span style="width:${ranked?rr:0}%"></span></div><div class="comp-stats"><div class="comp-stat"><b>${p.wins||0}</b><span>${esc(text('wins'))}</span></div><div class="comp-stat"><b>${p.losses||0}</b><span>${esc(text('losses'))}</span></div><div class="comp-stat"><b>${wr}%</b><span>${esc(text('winRate'))}</span></div><div class="comp-stat"><b>${p.shields||0}</b><span>${esc(text('shields'))}</span></div></div></div>
      <div class="comp-actions"><button class="comp-main-btn" id="comp-start">${esc(text('start'))}</button><button class="comp-sub-btn" id="comp-history">${esc(text('history'))}</button><button class="comp-sub-btn" id="comp-lb">${esc(text('leaderboard'))}</button><button class="comp-sub-btn" id="comp-rank-info">${esc(text('rankInfo'))}</button></div>
      <div class="comp-section"><h3>${esc(text('rankedRules'))}</h3><div class="comp-info">${esc(text('rankedDesc'))}</div></div>
      <div class="comp-section" id="comp-subview"></div>`;
  }

  async function showCompetitiveHome(){
    injectStyle();ensureUi();updateLocalizedUi();
    try{await refreshProfile();}catch(e){showToast(e.message,4000);return}
    const shell=document.getElementById('comp-shell'); shell.innerHTML=homeHtml(); showScreen('competitive');
    document.getElementById('comp-home-back').onclick=()=>showScreen('home');
    document.getElementById('comp-start').onclick=startMatchmaking;
    document.getElementById('comp-history').onclick=()=>renderHistory();
    document.getElementById('comp-lb').onclick=()=>renderLeaderboard();
    document.getElementById('comp-rank-info').onclick=()=>renderRankInfo();
    document.querySelector('.language-switcher')?.style.setProperty('display','none');
  }

  async function renderLeaderboard(){const sub=document.getElementById('comp-subview');if(!sub)return;sub.innerHTML=`<h3>${esc(text('leaderboard'))}</h3><div class="comp-info">Loading...</div>`;try{const d=await api('leaderboard',{playerToken:localStorage.getItem(TOKEN_KEY)});sub.innerHTML=`<h3>${esc(text('leaderboard'))}</h3><div class="comp-rank-list">${d.rows.length?d.rows.map(r=>`<div class="comp-lb-row" style="${r.isYou?'border-color:var(--accent)':''}"><div class="comp-pos">${r.rank}</div><div class="comp-grow"><b>${esc(r.username)}</b><div class="comp-muted">${esc(r.rankName)}</div></div><b style="color:${esc(rankColor(r.rank?Math.max(0,r.rank-1):0))}">${Number(r.rr)||0} RR</b></div>`).join(''):`<div class="comp-info">${esc(text('noPlayers'))}</div>`}</div>`}catch(e){sub.innerHTML=`<h3>${esc(text('leaderboard'))}</h3><div class="comp-info">${esc(e.message)}</div>`}}

  async function renderHistory(){const sub=document.getElementById('comp-subview');if(!sub)return;sub.innerHTML=`<h3>${esc(text('history'))}</h3><div class="comp-info">Loading...</div>`;try{const d=await api('history',{playerToken:localStorage.getItem(TOKEN_KEY)});sub.innerHTML=`<h3>${esc(text('history'))}</h3><div class="comp-rank-list">${d.rows.length?d.rows.map(r=>`<div class="comp-history-row"><div class="comp-pos" style="color:${r.result==='win'?'var(--green)':r.result==='loss'?'var(--accent3)':'var(--accent2)'}">${r.result==='win'?'W':r.result==='loss'?'L':'D'}</div><div class="comp-grow"><b>${esc(r.opponent)}</b><div class="comp-muted">${esc(r.type||'ranked')} · ${esc(r.rank||'Placement')}</div></div><b style="color:${r.rrDelta>0?'var(--green)':r.rrDelta<0?'var(--accent3)':'var(--muted)'}">${r.rrDelta>0?'+':''}${r.rrDelta||0} RR</b></div>`).join(''):`<div class="comp-info">${esc(text('noHistory'))}</div>`}</div>`}catch(e){sub.innerHTML=`<h3>${esc(text('history'))}</h3><div class="comp-info">${esc(e.message)}</div>`}}

  function renderRankInfo(){const sub=document.getElementById('comp-subview');if(!sub)return;sub.innerHTML=`<h3>${esc(text('rankedRules'))}</h3><div class="comp-info">${esc(text('rankedDesc'))}</div><div class="comp-rank-list" style="margin-top:10px">${ranks.map((r,i)=>`<div class="comp-rank-row"><span class="comp-rank-dot" style="background:${rankColor(i*3)}"></span><div class="comp-grow"><b>${r}</b><div class="comp-muted">${i===7?'∞ RR':'III · II · I'}</div></div></div>`).join('')}</div>`}

  async function startMatchmaking(){
    if(poll)return; const token=localStorage.getItem(TOKEN_KEY); if(!token){showToast('Competitive profile unavailable',3500);return}
    const shell=document.getElementById('comp-shell'); shell.innerHTML=`<div class="comp-header"><div><div class="comp-title">${esc(text('searching'))}</div><div class="comp-kicker">${esc(text('mode'))}</div></div></div><div class="comp-section" style="min-height:240px;display:flex;align-items:center;justify-content:center;text-align:center"><div><div style="font-size:44px;animation:spin 1.2s linear infinite">∿</div><div class="comp-info" id="comp-wait">0.0s</div><button class="comp-sub-btn" id="comp-cancel" style="margin-top:14px">${esc(text('cancel'))}</button></div></div>`;
    const style=document.createElement('style');style.textContent='@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';document.head.appendChild(style);
    document.getElementById('comp-cancel').onclick=async()=>{await api('leave',{playerToken:token}).catch(()=>{});stopPolling();showCompetitiveHome()};
    const started=Date.now();
    poll=setInterval(async()=>{try{const d=await api('join',{playerToken:token});document.getElementById('comp-wait')?.replaceChildren(document.createTextNode(((Date.now()-started)/1000).toFixed(1)+'s'));if(d.status==='matched'){stopPolling();openMatch(d.match)}}catch(e){stopPolling();showToast(e.message,4000);showCompetitiveHome()}},900);
    try{const d=await api('join',{playerToken:token});if(d.status==='matched'){stopPolling();openMatch(d.match)}}catch(e){stopPolling();showToast(e.message,4000);showCompetitiveHome()}
  }
  function stopPolling(){if(poll){clearInterval(poll);poll=null}}

  function openMatch(m){injectStyle();ensureUi();match=m;document.getElementById('comp-match').style.display='block';document.getElementById('comp-result').style.display='none';document.getElementById('cm-me').textContent=m.me.username;document.getElementById('cm-opp').textContent=m.opponent.username;document.getElementById('cm-opp-rank').textContent=m.isBot?(m.botId==='legend'?text('legend'):text('bot')):text('player');document.getElementById('cm-vs').textContent=text('versus');document.getElementById('cm-qmeta').textContent=text('mode');document.getElementById('cm-bot-note').textContent=m.isBot?text('botNoRating'):'';setQuestion(m.question);runMatchLoop()}
  function setQuestion(q){const el=document.getElementById('cm-qtext'),inp=document.getElementById('cm-answer');if(!q){el.textContent='—';inp.value='';inp.disabled=true;return}el.textContent=`${q.text} = ?`;inp.value='';inp.disabled=false;setTimeout(()=>inp.focus(),60)}

  async function submitAnswer(){if(qBusy||!match)return;const inp=document.getElementById('cm-answer');const val=inp.value.trim();if(!/^\d{1,6}$/.test(val)){inp.focus();return}qBusy=true;document.getElementById('cm-submit').disabled=true;try{const d=await api('answer',{playerToken:localStorage.getItem(TOKEN_KEY),matchId:match.id,questionIndex:match.question?.index??match.me.q,answer:Number(val)});document.getElementById('cm-live').textContent=d.correct?'✓':'✗';document.getElementById('cm-live').className='comp-live '+(d.correct?'good':'bad');match.me={...match.me,...d.me};document.getElementById('cm-me-score').textContent=match.me.correct;document.getElementById('cm-me-wrong').textContent=match.me.wrong;match.question=d.nextQuestion;setQuestion(match.question);setTimeout(()=>{document.getElementById('cm-live').textContent='';document.getElementById('cm-live').className='comp-live'},350)}catch(e){showToast(e.message,2500)}finally{qBusy=false;document.getElementById('cm-submit').disabled=false}}

  function runMatchLoop(){stopPolling();const iv=setInterval(async()=>{if(!match){clearInterval(iv);return}const now=Date.now();const rem=Math.max(0,(match.endAt-now)/1000);const sec=Math.ceil(rem);const tm=document.getElementById('cm-time');tm.textContent=sec;tm.classList.toggle('danger',sec<=8);document.getElementById('cm-timebar').style.width=Math.max(0,rem/40*100)+'%';try{const d=await api('status',{playerToken:localStorage.getItem(TOKEN_KEY),matchId:match.id});if(d.match)match=d.match;if(match.opponent){document.getElementById('cm-opp').textContent=match.opponent.username;}
      const opp=match.opponent;document.getElementById('cm-me-score').textContent=match.me?.correct||0;document.getElementById('cm-me-wrong').textContent=match.me?.wrong||0;
      if(d.status==='finished'){clearInterval(iv);closeMatch(d);}}
    catch(e){if(rem<=0){clearInterval(iv);showToast(e.message,3000)}}},450)}

  function closeMatch(d){document.getElementById('comp-match').style.display='none';document.getElementById('comp-result').style.display='flex';const r=d.result||{};const side=r.myResult||r.resultA||'draw';const win=side==='win',loss=side==='loss';const title=document.getElementById('cr-title');title.textContent=win?text('victory'):loss?text('defeat'):text('draw');title.className='comp-result-title '+(win?'win':loss?'loss':'draw');document.getElementById('cr-opponent').textContent=`${d.match?.opponent?.username||'OPPONENT'}${d.match?.isBot?' · AI':''}`;document.getElementById('cr-me').textContent=d.match?.me?.correct||0;document.getElementById('cr-opp').textContent=d.match?.opponent?.correct||0;const delta=r.myRating?.rrDelta||r.a?.rrDelta||0;document.getElementById('cr-rr').textContent=d.match?.isBot?(delta===0?'0 RR':`${delta>0?'+':''}${delta} RR`):`${delta>0?'+':''}${delta} RR`;const note=d.match?.isBot?(d.match?.botId==='legend'?text('legendary'):text('botNoRating')):(r.a?.after?.rankIndex!==r.a?.before?.rankIndex?(r.a.after.rankIndex>r.a.before.rankIndex?text('rankUp'):text('derank')):'');document.getElementById('cr-note').textContent=note||'';match=null}

  function interceptStart(){
    const btn=document.getElementById('btn-start');if(!btn)return;
    btn.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();ensureUi();document.getElementById('comp-mode-modal').classList.add('show');updateLocalizedUi()},true);
  }

  document.addEventListener('DOMContentLoaded',()=>{injectStyle();ensureUi();interceptStart()});
  document.addEventListener('click',e=>{if(e.target.closest('.lang-btn'))setTimeout(updateLocalizedUi,0)});
})();
