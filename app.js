// --- SPA Navigation ---
const loginPage = document.getElementById('loginPage');
const chatPage = document.getElementById('chatPage');
const loginBtn = document.getElementById('loginBtn');
const usernameInput = document.getElementById('usernameInput');
const welcomeMsg = document.getElementById('welcomeMsg');
let username='';

loginBtn.addEventListener('click', ()=>{
  const name=usernameInput.value.trim();
  if(!name){alert('Enter username'); return;}
  username=name;
  welcomeMsg.textContent=`Hello, ${username}!`;
  loginPage.classList.remove('active');
  chatPage.classList.add('active');
});

// --- Spam Chat Logic ---
const STORAGE_KEY="spam_chat_history_v1";
const KEY_BLOCK="spam_chat_blocked_v1";

// Enhanced spam keywords and phrases
const SPAM_KEYWORDS = [
  "buy now","click here","free","discount","win","winner",
  "congratulations","urgent","limited time","act now",
  "order now","visit","claim","act fast","exclusive offer","prize"
];

// Suspicious domains (any domain flagged)
const SUSPICIOUS_DOMAINS=["bit.ly","tinyurl","goo.gl","spam.example","freegift","getfree"];

const input=document.getElementById('input');
const sendBtn=document.getElementById('sendBtn');
const messagesBox=document.getElementById('messages');
const scoreMeter=document.getElementById('scoreMeter');
const scoreLabel=document.getElementById('scoreLabel');
const liveVerdict=document.getElementById('liveVerdict');
const clearBtn=document.getElementById('clearBtn');
const exportBtn=document.getElementById('exportBtn');
const spamActions=document.getElementById('spamActions');
const blockStatus=document.getElementById('blockStatus');
const unblockBtn=document.getElementById('unblockBtn');

let chatHistory=loadHistory();
let blocked=loadBlocked();
updateBlockUI();
renderAllMessages();

// --- Utilities ---
function nowISO(){return new Date().toISOString();}
function escapeHtml(s){return s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function normalizeText(s){return s.toLowerCase().replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[^\w\s@:.\/-]/g,' ').replace(/\s+/g,' ').trim();}

// --- URL extraction (detects all URLs, even hidden/obfuscated)
function extractUrls(text){
  const normalized = text.toLowerCase().replace(/\s+dot\s+/g, '.');
  const urlRegex = /((https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}([\/\?\=&\w.-]*)?)/ig;
  const matches = [];
  let m;
  while((m=urlRegex.exec(normalized))!==null){
    matches.push(m[0]);
    if(matches.length>10) break;
  }
  return matches;
}

// Repetition score
function repetitionScore(s){
  const run=/(.)\1{4,}/g;
  let m, score=0;
  while((m=run.exec(s))!==null){
    score += Math.min(m[0].length-4,50);
    if(score>80) break;
  }
  return Math.min(score,80);
}

// Caps score
function capsScore(s){
  const letters=s.replace(/[^A-Za-z]/g,'');
  if(letters.length<6) return 0;
  const up=(letters.match(/[A-Z]/g)||[]).length;
  const ratio = up/letters.length;
  return Math.round(Math.max(0,(ratio-0.6))*100);
}

// Spam keywords/phrases score
function spamKeywordsScore(norm){
  let score=0;
  for(const k of SPAM_KEYWORDS){
    if(norm.includes(k)) score += 15;
  }
  return Math.min(score,100);
}

// URL score
function urlScore(urls){
  let score=0;
  for(const u of urls){
    for(const dom of SUSPICIOUS_DOMAINS){
      if(u.includes(dom)) score += 30;
    }
  }
  score += Math.min(30, urls.length*10);
  score += Math.min(12, urls.some(u=>u.length>60)?12:0);
  return Math.min(score,100);
}

// --- Spam scoring function ---
function scoreMessage(raw){
  const norm=normalizeText(raw);
  const urls=extractUrls(raw);
  const rep=repetitionScore(raw);
  const caps=capsScore(raw);
  const spamKey=spamKeywordsScore(norm);
  const urlS=urlScore(urls);

  let score = 0;
  score += urlS*0.9;
  score += spamKey*0.8;
  score += rep*0.6;
  score += caps*0.2;

  if(raw.trim().length<40 && urls.length>0) score += 18;
  if(norm.match(/\b(?:http|https|www|\.com|\.net|\.org)\b/)) score += 8;

  score = Math.round(Math.max(0, Math.min(100, score)));

  const reasons = [];
  if(urls.length) reasons.push('Contains URL(s)');
  if(spamKey >= 12) reasons.push('Spammy keywords/phrases');
  if(rep >= 10) reasons.push('Repeated characters');
  if(urls.length>1) reasons.push('Multiple links');

  return {score,reasons,stats:{urls,rep,caps,spamKey,urlS}};
}

function labelForScore(score){
  if(score>=55) return {label:'SPAM',cls:'spam',desc:'Likely spam — message blocked.'};
  return {label:'SAFE',cls:'safe',desc:'Allowed'};
}

// --- Live typing analysis ---
input.addEventListener('input',()=>{
  const t=input.value;
  if(t.trim().length===0){
    scoreMeter.style.width='0%'; scoreLabel.textContent='0'; liveVerdict.textContent='Type to see spam analysis'; spamActions.innerHTML=''; return;
  }
  const {score}=scoreMessage(t);
  scoreMeter.style.width = score+'%';
  scoreLabel.textContent = score;
  const lab = labelForScore(score);
  liveVerdict.textContent = lab.label+' — '+lab.desc;
  liveVerdict.className = lab.cls==='spam'?'warn':'';
  spamActions.innerHTML='';
  if(lab.label==='SPAM'){
    const btn=document.createElement('button');
    btn.className='btn ghost';
    btn.textContent='Block Sender';
    btn.addEventListener('click',()=>{setBlocked(true); alert('Sender blocked. Composer disabled.');});
    spamActions.appendChild(btn);
  }
});

// --- Send button ---
sendBtn.addEventListener('click',(ev)=>{
  ev.preventDefault();
  if(blocked){alert('Sender blocked. Unblock to send messages.'); return;}
  const text = input.value.trim();
  if(!text) return;
  const analysis = scoreMessage(text);
  const lab = labelForScore(analysis.score);
  if(lab.label==='SPAM'){alert('Message detected as SPAM and blocked.'); showBlockPrompt(); return;}
  const payload = createMessage(text,true);
  chatHistory.push(payload);
  saveHistory(chatHistory);
  appendMessage(payload);
  input.value='';
});

// --- Message rendering ---
function createMessage(text,isMe){
  const analysis = scoreMessage(text);
  const lab = labelForScore(analysis.score);
  const id = 'm_'+Math.random().toString(36).slice(2,9);
  return {id,text,isMe:!!isMe,ts:nowISO(),analysis,label:lab};
}
function appendMessage(msg){
  const node = renderMessageNode(msg);
  messagesBox.appendChild(node);
  messagesBox.scrollTop = messagesBox.scrollHeight;
}
function renderAllMessages(){messagesBox.innerHTML=''; for(const m of chatHistory) messagesBox.appendChild(renderMessageNode(m)); messagesBox.scrollTop = messagesBox.scrollHeight;}
function renderMessageNode(m){
  const wrap=document.createElement('div');
  const b=document.createElement('div');
  b.className='bubble '+(m.isMe?'me':'other');
  b.setAttribute('role','article');
  b.innerHTML = `<div style="font-weight:600">${m.isMe?'You':username}</div>
                 <div style="margin-top:6px">${escapeHtml(m.text)}</div>
                 <div class="meta">
                   <div class="badge ${m.label.cls}">${m.label.label}</div>
                   <div style="margin-left:8px" class="muted">${m.ts.slice(11,19)}</div>
                   <div style="margin-left:auto" class="muted">score: ${m.analysis.score}</div>
                 </div>`;
  wrap.appendChild(b);
  return wrap;
}

// --- Storage & Block handling ---
function saveHistory(arr){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(arr));}catch(e){}}
function loadHistory(){try{const raw=localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):[];}catch(e){return[];}}
function setBlocked(val){blocked=!!val; try{localStorage.setItem(KEY_BLOCK,JSON.stringify({blocked:blocked}));}catch(e){} updateBlockUI();}
function loadBlocked(){try{const raw=localStorage.getItem(KEY_BLOCK); if(!raw) return false; return JSON.parse(raw).blocked===true;}catch(e){return false;}}
function updateBlockUI(){
  blockStatus.textContent = blocked?'Blocked':'Not blocked';
  if(blocked){input.setAttribute('disabled','disabled'); sendBtn.setAttribute('disabled','disabled'); unblockBtn.style.display='inline-block';} 
  else {input.removeAttribute('disabled'); sendBtn.removeAttribute('disabled'); unblockBtn.style.display='none';}
}
function showBlockPrompt(){spamActions.innerHTML=''; const blockBtn=document.createElement('button'); blockBtn.className='btn ghost'; blockBtn.textContent='Block Sender'; blockBtn.addEventListener('click',()=>{setBlocked(true); alert('Sender blocked. Composer disabled.'); spamActions.innerHTML='';}); spamActions.appendChild(blockBtn);}
unblockBtn.addEventListener('click',(ev)=>{ev.preventDefault(); if(confirm('Unblock sender?')) setBlocked(false);});

// --- Export & Clear ---
exportBtn.addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(chatHistory,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='spam_chat_export.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});
clearBtn.addEventListener('click',()=>{
  if(!confirm('Clear chat history?')) return;
  chatHistory=[]; saveHistory(chatHistory); messagesBox.innerHTML='';
});

// --- Initial sample ---
document.addEventListener('DOMContentLoaded',()=>{
  if(chatHistory.length===0){
    const sample=createMessage("Welcome — spam-only moderation. Try pasting suspicious links or spammy marketing text.",false);
    chatHistory.push(sample); saveHistory(chatHistory); renderAllMessages();
  }
});

// --- Send on Ctrl+Enter ---
input.addEventListener('keydown',(e)=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){sendBtn.click();}});
