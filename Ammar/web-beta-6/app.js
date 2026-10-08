"use strict";
/* ============================================================
   GuideLens — app logic
   ============================================================ */
const $ = id => document.getElementById(id);
const DEF = {audio:true,haptics:true,stepFree:false,verbosity:"standard",sensitivity:"standard",
             rate:1.0,contact:"",theme:"dark",simple:false};
let S = Object.assign({}, DEF, JSON.parse(localStorage.getItem("gl_settings")||"{}"));
let pos = null;
let lastSpoken = "", alertState = {}, model = null, segModel = null, segFailed = false;
let stream = null, camTimer = null;
let namedDangerUntil = 0;
let nav = null, ocrBusy = false;
let cocoInterval = 420, lastCoco = 0, lastSegRun = 0, segBusy = false;

/* ================= SPEECH / HAPTICS ================= */
function speak(text, opt={}){
  lastSpoken = text;
  $("live").textContent = text;
  if(!S.audio) return;
  try{
    if(opt.priority) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = S.rate; u.lang = "en-US"; u.pitch = 1;
    speechSynthesis.speak(u);
  }catch(e){}
}
function buzz(p){ if(S.haptics && navigator.vibrate) navigator.vibrate(p); }
function distWord(d){
  if(d<2) return "right in front of you";
  return "about "+Math.max(1,Math.round(d))+" meters";
}
const FRIENDLY = {pottedplant:"plant", handbag:"bag", backpack:"backpack", suitcase:"luggage",
  person:"person", dog:"dog", cat:"cat", bicycle:"bicycle", car:"car", bus:"bus",
  truck:"truck", motorcycle:"motorcycle", bench:"bench", chair:"chair"};

/* ================= DISTANCE-TIERED ALERTS ================= */
function alertTier(name, side, dist){
  if(dist == null || dist > 7) return;
  const now = Date.now();
  const key = name+"|"+side;
  const st = alertState[key] || {t1:0,c1:0,t2:0,t3:0};
  if(dist <= 3){
    if(now - st.t3 > 2500){
      st.t3 = now;
      speak("Stop! "+name+" ahead.", {priority:true});
      $("alerts").textContent = "Stop! "+name+" ahead.";
      buzz([120,80,120,80,120]);
      namedDangerUntil = now + 3000;
    }
  }else if(dist <= 5){
    if(S.verbosity !== "minimal" && now - st.t2 > 5000){
      st.t2 = now;
      speak(name+" coming close, "+distWord(dist)+".");
      buzz([100,60,100]);
    }
  }else{
    if(S.verbosity !== "minimal"){
      if(now - st.t1 > 4500 && st.c1 < 2){
        st.t1 = now; st.c1++;
        speak(name+" "+side+", "+distWord(dist)+".");
        buzz(60);
      }
    }
  }
  alertState[key] = st;
}
setInterval(()=>{
  const now = Date.now();
  for(const k in alertState){
    const st = alertState[k];
    if(now - Math.max(st.t1,st.t2,st.t3) > 20000) delete alertState[k];
  }
}, 10000);

/* ================= VIEW: THEME + SIMPLE MODE ================= */
function applyView(){
  document.documentElement.dataset.theme = S.theme;
  document.body.classList.toggle("simple", S.simple);
  const sun = S.theme === "light";
  $("themeBtn").innerHTML = '<svg class="ic"><use href="#i-'+(sun?"moon":"sun")+'"/></svg>';
  $("themeBtn").setAttribute("aria-pressed", sun);
  $("themeBtn").setAttribute("aria-label", sun ? "Switch to dark mode" : "Switch to light mode");
  $("simpleBtn").setAttribute("aria-pressed", S.simple);
  $("simpleBtn").setAttribute("aria-label", S.simple ? "Turn simple view off" : "Turn simple view on — bigger buttons, fewer options");
  document.querySelector('meta[name="theme-color"]').setAttribute("content", sun ? "#EEF2F7" : "#0B0F14");
}
function saveSettings(){ localStorage.setItem("gl_settings", JSON.stringify(S)); }

/* ================= UI ================= */
function show(id){
  document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
  $(id).classList.add("active");
  window.scrollTo(0,0);
}

/* ================= GEOLOCATION ================= */
function startGeo(){
  if(!navigator.geolocation){
    $("gpsStatus").innerHTML='<svg class="ic sm"><use href="#i-gps"/></svg> Not supported'; return;
  }
  navigator.geolocation.watchPosition(p=>{
    pos = {lat:p.coords.latitude, lng:p.coords.longitude, heading:p.coords.heading, accuracy:p.coords.accuracy};
    $("gpsStatus").innerHTML='<svg class="ic sm"><use href="#i-gps"/></svg> ±'+Math.round(p.coords.accuracy)+' m';
    navTick();
  }, e=>{ $("gpsStatus").innerHTML='<svg class="ic sm"><use href="#i-gps"/></svg> permission needed'; },
  {enableHighAccuracy:true, maximumAge:1000});
}
async function whereAmI(){
  if(!pos){ speak("I don't have your location yet. Please allow location access."); return; }
  speak("Getting your location…");
  try{
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${pos.lat}&lon=${pos.lng}&accept-language=en`);
    const j = await r.json();
    const a = j.address||{};
    const place = [a.house_number, a.road, a.suburb||a.neighbourhood, a.city||a.town||a.village].filter(Boolean).join(", ");
    speak(place ? "You are at "+place+". GPS accuracy about "+Math.round(pos.accuracy)+" meters."
                : "You are at coordinates "+pos.lat.toFixed(5)+", "+pos.lng.toFixed(5)+".");
  }catch(e){
    speak("I couldn't reach the map service. Coordinates "+pos.lat.toFixed(5)+", "+pos.lng.toFixed(5)+".");
  }
}

/* ================= ROUTING ================= */
function hav(a,b){const R=6371000,t=Math.PI/180;
  const dLa=(b.lat-a.lat)*t,dLo=(b.lng-a.lng)*t;
  const h=Math.sin(dLa/2)**2+Math.cos(a.lat*t)*Math.cos(b.lat*t)*Math.sin(dLo/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));}
function decodePolyline(str){let i=0,la=0,ln=0,c=[];
  while(i<str.length){let b,s=0,r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);la+=(r&1)?~(r>>1):(r>>1);
  s=0;r=0;do{b=str.charCodeAt(i++)-63;r|=(b&31)<<s;s+=5}while(b>=32);ln+=(r&1)?~(r>>1):(r>>1);
  c.push({lat:la/1e5,lng:ln/1e5});}return c;}
function maneuverText(st){
  const m=(st.maneuver||{}).type||"", mod=(st.maneuver||{}).modifier||"";
  if(m.includes("depart")) return "Start walking"+(st.name?" on "+st.name:"");
  if(m.includes("roundabout")) return "Take the roundabout";
  if(m.includes("arrive")) return "You are arriving";
  if(m.startsWith("turn")||m.startsWith("new name")){
    if(mod==="left") return "Turn left"+(st.name?" onto "+st.name:"");
    if(mod==="right") return "Turn right"+(st.name?" onto "+st.name:"");
    if(mod==="slight left") return "Bear slight left";
    if(mod==="slight right") return "Bear slight right";
    if(mod==="sharp left") return "Turn sharp left";
    if(mod==="sharp right") return "Turn sharp right";
    if(mod==="uturn") return "Make a U-turn";
  }
  return "Continue straight"+(st.name?" on "+st.name:"");
}
async function geocode(q){
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=en&q=${encodeURIComponent(q)}`);
  const j = await r.json();
  if(!j.length) return null;
  return {lat:+j[0].lat, lng:+j[0].lon, label:j[0].display_name.split(",")[0]};
}
function routeLen(c){let d=0;for(let i=1;i<c.length;i++)d+=hav(c[i-1],c[i]);return d;}
async function fetchRoute(a,b){
  const url=`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&steps=true&geometries=polyline`;
  const r=await fetch(url); const j=await r.json();
  if(!j.routes||!j.routes.length) throw new Error("no route");
  return {coords:decodePolyline(j.routes[0].geometry), steps:j.routes[0].legs[0].steps,
          destPoint:b, label:b.label, lastRecalc:0};
}
async function navigateTo(place){
  if(!pos){ speak("I need your location first. Please allow location access."); return; }
  speak("Looking for "+place+"…");
  let dest;
  try{ dest = await geocode(place); }catch(e){}
  if(!dest){ speak("Sorry, I couldn't find "+place+". Try a nearby landmark or a full address."); return; }
  try{
    nav = await fetchRoute(pos, dest);
    nav.stepIdx = 0; nav.announcedPre=false; nav.announcedNow=false;
    const len = routeLen(nav.coords);
    show("scr-nav");
    $("navStatus").textContent = "Route to "+dest.label+" — "+Math.round(len)+" m.";
    speak("Route set to "+dest.label+". About "+Math.round(len)+" meters, roughly "+
          Math.max(1,Math.round(len/80))+" minutes walking. Say 'stop' anytime.");
    buzz([60,80,60]);
  }catch(e){ speak("I couldn't find a walking route there. Please try again."); }
}
function nearestDistToRoute(pt,coords){let m=1e9;for(let i=0;i<coords.length;i++){const d=hav(pt,coords[i]);if(d<m)m=d;}return m;}
function navTick(){
  if(!nav||!pos) return;
  const step = nav.steps[nav.stepIdx];
  if(!step){ finishNav(); return; }
  const end = {lat:step.maneuver.location[1], lng:step.maneuver.location[0]};
  const d = hav(pos,end);
  if(hav(pos,nav.destPoint) < 20){ finishNav(); return; }
  while(nav.stepIdx < nav.steps.length-1 && d < 8){
    nav.stepIdx++; nav.announcedPre=false; nav.announcedNow=false; return navTick();
  }
  if(!nav.announcedPre && d < 22 && d >= 6){
    nav.announcedPre=true;
    speak((d>12?"In about "+Math.round(d/5)*5+" meters, ":"")+maneuverText(step)+".");
    buzz([60,80,60]);
  }
  if(!nav.announcedNow && d < 6){
    nav.announcedNow=true;
    speak("Now. "+maneuverText(step)+".", {priority:true});
  }
  const off = nearestDistToRoute(pos, nav.coords);
  if(off > 35 && Date.now()-nav.lastRecalc > 15000){
    nav.lastRecalc = Date.now();
    speak("You seem off the route. Recalculating.", {priority:true}); buzz(300);
    fetchRoute(pos, {lat:nav.destPoint.lat, lng:nav.destPoint.lng, label:nav.label})
      .then(r=>{nav.coords=r.coords; nav.steps=r.steps; nav.stepIdx=0; nav.announcedPre=false; nav.announcedNow=false;})
      .catch(()=>{});
  }
}
function finishNav(){
  speak("You have arrived near "+(nav?nav.label:"your destination")+". I will stop guiding now.", {priority:true});
  buzz([60,80,60]);
  $("navStatus").textContent="Arrived.";
  nav=null;
}
function stopNavigation(silent){
  if(!nav) return;
  nav=null; $("navStatus").textContent="Idle.";
  if(!silent) speak("Navigation stopped.");
}

/* ================= VISION A: OBJECT DETECTOR ================= */
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement("script");s.src=src;s.onload=res;s.onerror=()=>rej(new Error("load "+src));document.head.appendChild(s);});}
async function ensureModel(){
  if(model) return model;
  setCam("Loading object model… one moment.");
  if(!window.tf) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js");
  if(!window.cocoSsd) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js");
  model = await cocoSsd.load({base:"lite_mobilenet_v2"});
  return model;
}
const KNOWN_H={person:1.7,bicycle:1.1,car:1.5,motorcycle:1.2,bus:3.0,truck:2.5,dog:0.6,cat:0.35,bench:0.9,chair:0.9,pottedplant:0.5,suitcase:0.7,backpack:0.5,handbag:0.4};
const HFOV_DEG = 62;
function estDistance(cls,bhPx,vh,vw){
  const real=KNOWN_H[cls]; if(!real||!bhPx) return null;
  const vfov = 2*Math.atan(Math.tan(HFOV_DEG*Math.PI/360)*(vh/vw));
  const fPx = vh/(2*Math.tan(vfov/2));
  return (real*fPx)/bhPx;
}
function sideOf(cx,w){const r=(cx-w/2)/(w/2);return r<-0.35?"on your left":r>0.35?"on your right":"ahead";}
function friendly(cls){return FRIENDLY[cls]||"obstacle";}

/* ================= VISION B: SCENE SEGMENTATION ================= */
const SEG_LABELS = new Set(["pole","wall","fence","traffic light","traffic sign"]);
let SEG_COLORS = null;
async function ensureSegModel(){
  if(segModel || segFailed) return segModel;
  try{
    if(!window.deeplab) await loadScript("https://cdn.jsdelivr.net/npm/@tensorflow-models/deeplab@0.1.1/dist/deeplab.min.js");
    setCam("Loading scene model for poles, walls and fences… a few seconds.");
    segModel = await deeplab.load({base:"cityscapes", quantizationBytes:1});
    SEG_COLORS = new Set(Object.entries(segModel.legend)
      .filter(([c,l]) => SEG_LABELS.has(l)).map(([c]) => c));
  }catch(e){
    segFailed = true; segModel = null;
    speak("Scene model unavailable on this device. Named object detection still works.");
  }
  return segModel;
}
function ynToDist(yn){
  const pts=[[0.50,9],[0.60,7],[0.72,5],[0.85,3],[1.0,1.2]];
  if(yn<=pts[0][0]) return null;
  if(yn>=1) return 1.2;
  for(let i=1;i<pts.length;i++){
    if(yn<=pts[i][0]){ const [x0,d0]=pts[i-1],[x1,d1]=pts[i];
      return d0+(d1-d0)*(yn-x0)/(x1-x0); }
  }
  return null;
}
let segResult = null;
async function segFrame(v){
  if(!segModel || segBusy || v.readyState<2) return;
  segBusy = true;
  try{
    const w=208, h=Math.max(1,Math.round(208*v.videoHeight/v.videoWidth));
    const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
    cv.getContext("2d").drawImage(v,0,0,w,h);
    const out = await segModel.segment(cv);
    const map=out.segmentationMap, W=out.width, H=out.height;
    const x0=Math.floor(W*0.35), x1=Math.floor(W*0.65);
    const yStart=Math.floor(H*0.45);
    let yBottom=-1, count=0;
    for(let y=yStart;y<H;y++){
      const row=y*W*3;
      for(let x=x0;x<x1;x++){
        const i=row+x*3;
        const key=map[i]+","+map[i+1]+","+map[i+2];
        if(SEG_COLORS.has(key)){ count++; if(y>yBottom) yBottom=y; }
      }
    }
    const stripArea=(x1-x0)*(H-yStart);
    if(yBottom>0 && count > stripArea*0.02){
      const yn=yBottom/H;
      const dist=ynToDist(yn);
      segResult = dist!=null ? {dist, yn} : null;
    }else segResult = null;
    window.__segInterval = 1600;
  }catch(e){ segResult = null; }
  segBusy = false;
}

/* ================= CAMERA LOOP ================= */
function setCam(t){$("camStatus").textContent=t;}
async function startCamera(){
  try{
    stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:960}},audio:false});
    $("video").srcObject = stream; await $("video").play();
    await ensureModel();
    ensureSegModel();
    setCam("Detection running. Hold the phone at chest height, camera facing forward.");
    speak("Detection running. I'll warn you about obstacles.");
    loop();
  }catch(e){
    setCam("Camera or model unavailable. Check camera permission and connection.");
    speak("I couldn't start the camera. Please check camera permission.");
  }
}
function stopCamera(){
  clearTimeout(camTimer);
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}
  $("video").srcObject=null;
  const c=$("overlay");c.getContext("2d").clearRect(0,0,c.width,c.height);
  segResult=null;
}
function drawSegZone(ctx,W,H){
  if(!segResult) return;
  const {dist,yn}=segResult;
  const y=yn*H;
  ctx.fillStyle = dist<=3 ? "rgba(255,77,79,.30)" : dist<=5 ? "rgba(255,176,32,.25)" : "rgba(122,184,255,.18)";
  ctx.fillRect(W*0.35, y, W*0.30, H-y);
  ctx.strokeStyle = dist<=3 ? "#FF4D4F" : dist<=5 ? "#FFB020" : "#7AB8FF";
  ctx.lineWidth=4; ctx.setLineDash([12,8]);
  ctx.beginPath(); ctx.moveTo(W*0.35,y); ctx.lineTo(W*0.65,y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle="rgba(11,15,20,.9)";
  ctx.fillRect(W*0.35,Math.max(0,y-36),150,30);
  ctx.fillStyle="#fff"; ctx.font="bold 18px sans-serif";
  ctx.fillText("obstacle "+dist.toFixed(1)+" m", W*0.35+8, Math.max(0,y-36)+22);
}
function loop(){
  const v=$("video"); if(!stream||v.readyState<2){ if(stream) camTimer=setTimeout(loop,400); return; }
  const now=Date.now();
  const segInt = window.__segInterval || 1800;
  if(segModel && now-lastSegRun>segInt){ lastSegRun=now; segFrame(v); }
  if(now-lastCoco>cocoInterval){
    lastCoco=now;
    model.detect(v).then(preds=>{
      cocoInterval = 420;
      renderFrame(v,preds);
    }).catch(()=>{ cocoInterval=900; });
  }else{
    renderFrame(v,null);
  }
  camTimer=setTimeout(loop,180);
}
function renderFrame(v,preds){
  const c=$("overlay"),ctx=c.getContext("2d");
  c.width=v.videoWidth; c.height=v.videoHeight;
  ctx.clearRect(0,0,c.width,c.height);
  const seen=[];
  let anyDanger=false;
  if(preds){
    for(const p of preds){
      const [x,y,w,h]=p.bbox, cx=x+w/2;
      const dist=estDistance(p.class,h,v.videoHeight,v.videoWidth);
      const side=sideOf(cx,v.videoWidth);
      if(dist){
        const f=friendly(p.class);
        seen.push({name:f,dist,side});
        const sev = dist<=3?"danger":dist<=5?"caution":"info";
        ctx.lineWidth=4; ctx.setLineDash(sev==="danger"?[]:sev==="caution"?[10,8]:[4,6]);
        ctx.strokeStyle=sev==="danger"?"#FF4D4F":sev==="caution"?"#FFB020":"#7AB8FF";
        ctx.strokeRect(x,y,w,h);
        ctx.setLineDash([]);
        ctx.fillStyle="rgba(11,15,20,.85)";
        const label=f+" "+dist.toFixed(1)+"m";
        ctx.fillRect(x,Math.max(0,y-30),Math.max(80,label.length*10+16),28);
        ctx.fillStyle="#fff"; ctx.font="bold 18px sans-serif";
        ctx.fillText(label,x+8,Math.max(0,y-30)+21);
        alertTier(f,side,dist);
        if(dist<=3) anyDanger=true;
      }
    }
  }
  drawSegZone(ctx,c.width,c.height);
  if(segResult && Date.now()>namedDangerUntil){
    const d=segResult.dist;
    alertTier("obstacle","ahead",d);
    if(d<=3){ anyDanger=true; namedDangerUntil=0; }
  }
  if(anyDanger) $("alerts").textContent="Stop! obstacle ahead.";
  window.__lastSeen=seen;
}
function describeAround(){
  if(!stream){ show("scr-camera"); startCamera(); setTimeout(describeAround,6000); return; }
  const seen=(window.__lastSeen||[]).filter(s=>s.dist).sort((a,b)=>a.dist-b.dist);
  const parts = seen.slice(0,3).map(s=>s.name+" "+s.side+", "+distWord(s.dist));
  if(segResult) parts.push("possible obstacle ahead, "+distWord(segResult.dist));
  if(!parts.length){ speak("I don't see any obstacles nearby."); return; }
  speak("Around you: "+parts.join(". ")+".");
}

/* ================= OCR ================= */
async function readSign(){
  if(!stream){ show("scr-camera"); await startCamera(); }
  if(ocrBusy) return;
  ocrBusy=true; speak("Reading… hold the sign steady.");
  try{
    if(!window.Tesseract) await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js");
    const v=$("video"); if(v.readyState<2) throw 0;
    const cv=document.createElement("canvas");const sc=Math.min(1,1280/v.videoWidth);
    cv.width=v.videoWidth*sc;cv.height=v.videoHeight*sc;
    cv.getContext("2d").drawImage(v,0,0,cv.width,cv.height);
    const {data}=await Tesseract.recognize(cv,"eng");
    const lines=(data.lines||[]).filter(l=>l.confidence>55&&l.text.trim().length>2)
      .sort((a,b)=>b.text.trim().length-a.text.trim().length).slice(0,3)
      .map(l=>l.text.trim()).filter(Boolean);
    if(lines.length){ speak("It says: "+lines.join(". ")); setCam("Read: "+lines.join(" / ")); }
    else speak("I couldn't read any text here. Try holding the camera steady and closer.");
  }catch(e){ speak("Reading failed. Try again."); }
  ocrBusy=false;
}

/* ================= SOS ================= */
function sosFlow(){
  show("scr-sos");
  if(!S.contact){ speak("No emergency contact set. Please add a phone number in Settings."); return; }
  buzz([200,100,200,100,200,700]);
  speak("SOS ready. Press the big red button to send your location.");
}
function sendSOS(){
  if(!pos){ speak("No location available yet. Wait for the GPS icon, then try again."); return; }
  const gmaps="https://maps.google.com/?q="+pos.lat+","+pos.lng;
  const body=encodeURIComponent("EMERGENCY — I need help. My location: "+gmaps+
    " (accuracy ±"+Math.round(pos.accuracy)+" m). Sent via GuideLens.");
  buzz([200,100,200,100,200,700,200,100,200]);
  speak("Sending SOS with your location.", {priority:true});
  window.open("sms:"+S.contact.replace(/[^+\d]/g,"")+"?&body="+body,"_self");
}

/* ================= VOICE ================= */
const SR = window.SpeechRecognition||window.webkitSpeechRecognition;
let rec=null, recActive=false;
function startRec(){
  if(!SR){ speak("Voice input is not supported in this browser. Use the big buttons, or type commands on the Navigate screen."); return; }
  if(recActive) return;
  try{
    rec=new SR(); rec.lang="en-US"; rec.interimResults=false; rec.maxAlternatives=1;
    rec.onresult=ev=>{ handleCommand(ev.results[0][0].transcript); };
    rec.onerror=()=>{ recActive=false; };
    rec.onend=()=>{ recActive=false; };
    rec.start(); recActive=true; buzz(40);
  }catch(e){}
}
function stopRec(){ if(rec&&recActive){ try{rec.stop();}catch(e){} recActive=false; } }
function handleCommand(raw){
  const t=raw.toLowerCase().replace(/[.?!]/g,"").trim();
  $("live").textContent="Heard: "+raw;
  let m;
  if((m=t.match(/(?:navigate|take me|go|walk)(?: to)? (.+)/))) return navigateTo(m[1].trim());
  if(t.includes("where am i")||t.includes("my location")) return whereAmI();
  if(t.includes("read")) return readSign();
  if(t.includes("around")||t.includes("what do you see")||t.includes("surroundings")) return describeAround();
  if(t.includes("stop navigation")||t==="stop") return stopNavigation();
  if(t.includes("repeat")) return speak(lastSpoken||"Nothing to repeat.");
  if(t.includes("sos")||t.includes("emergency")||t.includes("help me")) return sosFlow();
  if(t.includes("setting")) return show("scr-settings");
  if(t.includes("start detection")||t.includes("start camera")){ show("scr-camera"); return startCamera(); }
  speak("Sorry, I didn't understand. Try 'navigate to the library', 'where am I', 'read this', or 'what's around me'.");
}

/* ================= WIRING ================= */
$("btnTalk").addEventListener("pointerdown",e=>{e.preventDefault();startRec();});
$("btnTalk").addEventListener("pointerup",stopRec);
$("btnTalk").addEventListener("pointercancel",stopRec);
document.addEventListener("keydown",e=>{ if(e.code==="Space"&&document.activeElement.tagName!=="INPUT"){e.preventDefault(); if(!e.repeat) startRec();} });
document.addEventListener("keyup",e=>{ if(e.code==="Space") stopRec(); });

$("themeBtn").onclick=()=>{ S.theme = S.theme==="light" ? "dark" : "light"; saveSettings(); applyView();
  speak(S.theme==="light" ? "Light mode on." : "Dark mode on."); };
$("simpleBtn").onclick=()=>{ S.simple = !S.simple; saveSettings(); applyView();
  speak(S.simple ? "Simple view on. Bigger buttons, fewer options."
                 : "Standard view on."); };

$("btnNavigate").onclick=()=>{show("scr-nav"); $("navDestInput").focus();};
$("navGo").onclick=()=>{ const q=$("navDestInput").value.trim(); if(q) navigateTo(q); else speak("Please type or say a destination first."); };
$("navStop").onclick=()=>{stopNavigation();};
$("navBack").onclick=()=>{stopNavigation(true);show("scr-home");};
$("btnDetect").onclick=()=>{show("scr-camera");startCamera();};
$("btnAround").onclick=()=>describeAround();
$("camStop").onclick=()=>{stopCamera();show("scr-home");speak("Detection stopped.");};
$("camStopTop").onclick=()=>{stopCamera();show("scr-home");speak("Detection stopped.");};
$("btnWhereAmI").onclick=whereAmI;
$("btnRead").onclick=readSign;
$("btnSOS").onclick=sosFlow;
$("sosSend").onclick=sendSOS;
$("sosBack").onclick=()=>show("scr-home");
$("btnSettings").onclick=()=>show("scr-settings");
$("btnMore").onclick=()=>show("scr-settings");

function loadSettingsUI(){
  $("chkAudio").checked=S.audio; $("chkHaptics").checked=S.haptics;
  $("chkStepFree").checked=S.stepFree; $("chkSimple").checked=S.simple;
  document.querySelectorAll("input[name=theme]").forEach(r=>r.checked=r.value===S.theme);
  document.querySelectorAll("input[name=verb]").forEach(r=>r.checked=r.value===S.verbosity);
  document.querySelectorAll("input[name=sens]").forEach(r=>r.checked=r.value===S.sensitivity);
  $("setRate").value=S.rate; $("rateVal").textContent=(+S.rate).toFixed(1)+"×";
  $("setContact").value=S.contact;
}
$("setRate").oninput=()=>{$("rateVal").textContent=(+$("setRate").value).toFixed(1)+"×";};
$("btnSaveSettings").onclick=()=>{
  S.audio=$("chkAudio").checked; S.haptics=$("chkHaptics").checked;
  S.stepFree=$("chkStepFree").checked; S.simple=$("chkSimple").checked;
  S.verbosity=document.querySelector("input[name=verb]:checked").value;
  S.sensitivity=document.querySelector("input[name=sens]:checked").value;
  S.theme=document.querySelector("input[name=theme]:checked").value;
  S.rate=+$("setRate").value; S.contact=$("setContact").value.trim();
  saveSettings(); applyView();
  speak("Settings saved."); show("scr-home");
};
$("btnTestVoice").onclick=()=>speak("This is how GuideLens sounds. You can change the speed in settings.",{priority:true});
$("setBack").onclick=()=>show("scr-home");

if(navigator.getBattery) navigator.getBattery().then(b=>{
  const up=()=>{$("batt").innerHTML='<svg class="ic sm"><use href="#i-batt"/></svg> '+Math.round(b.level*100)+"%";};
  up(); b.onlevelchange=up;
});

if(!localStorage.getItem("gl_agreed")){
  setTimeout(()=>{ $("disclaimer").showModal(); speak("Welcome to GuideLens. Please listen to the safety information on screen."); },600);
}
$("agreeBtn").onclick=()=>{localStorage.setItem("gl_agreed","1");$("disclaimer").close();
  speak("Great. Hold the green button and say, navigate to, followed by a place.");};

if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
startGeo();
loadSettingsUI();
applyView();
if(!("mediaDevices" in navigator)) speak("Note: camera features need a secure H T T P S connection and a modern browser.");
