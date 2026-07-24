const STORAGE_KEY="mukellef-takip-v3";
const OLD_KEY="borc-alacak-v1";
const el=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2);
const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const monthName=d=>new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(d+"T00:00:00"));

let state=loadState();
let activeClientId=null;
let deferredPrompt=null;

function loadState(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved?.clients&&saved?.movements) return saved;
  }catch{}
  // Eski sürümdeki kişi bazlı kayıtları mümkün olduğunca yeni yapıya aktar.
  try{
    const old=JSON.parse(localStorage.getItem(OLD_KEY))||[];
    if(Array.isArray(old)&&old.length){
      const clients=[]; const movements=[]; const map=new Map();
      old.forEach(e=>{
        const key=String(e.person||"Mükellef").trim().toLocaleLowerCase("tr");
        if(!map.has(key)){
          const c={id:uid(),name:e.person||"Mükellef",phone:"",taxNo:"",monthlyFee:0,createdAt:new Date().toISOString()};
          clients.push(c); map.set(key,c.id);
        }
        const clientId=map.get(key);
        if(e.type==="receivable") movements.push({id:uid(),clientId,type:"charge",amount:Number(e.amount)||0,date:e.date||today(),note:e.note||"Eski kayıttan aktarıldı",createdAt:new Date().toISOString()});
        else movements.push({id:uid(),clientId,type:"payment",amount:Number(e.amount)||0,date:e.date||today(),note:e.note||"Eski kayıttan aktarıldı",createdAt:new Date().toISOString()});
        if(Number(e.paid)>0) movements.push({id:uid(),clientId,type:"payment",amount:Number(e.paid),date:e.date||today(),note:"Eski kayıttaki ödeme",createdAt:new Date().toISOString()});
      });
      return {clients,movements};
    }
  }catch{}
  return {clients:[],movements:[]};
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderAll()}
function clientMovements(id){return state.movements.filter(m=>m.clientId===id)}
function clientTotals(id){
  return clientMovements(id).reduce((a,m)=>{m.type==="charge"?a.charge+=Number(m.amount):a.payment+=Number(m.amount);return a},{charge:0,payment:0});
}
function balance(id){const t=clientTotals(id);return t.charge-t.payment}
function currentMonthPrefix(){return today().slice(0,7)}

function renderHome(){
  const month=currentMonthPrefix();
  el("clientCount").textContent=state.clients.length;
  el("officeReceivable").textContent=money(state.clients.reduce((s,c)=>s+Math.max(0,balance(c.id)),0));
  el("monthCharges").textContent=money(state.movements.filter(m=>m.type==="charge"&&m.date.startsWith(month)).reduce((s,m)=>s+Number(m.amount),0));
  const q=el("clientSearch").value.trim().toLocaleLowerCase("tr");
  const f=el("clientFilter").value;
  const list=state.clients.filter(c=>{
    const b=balance(c.id); const text=(c.name+" "+c.phone+" "+c.taxNo).toLocaleLowerCase("tr");
    return (!q||text.includes(q))&&(f==="all"||(f==="debt"&&b>0.001)||(f==="clear"&&b<=0.001));
  }).sort((a,b)=>a.name.localeCompare(b.name,"tr"));
  el("clientList").innerHTML=list.length?list.map(c=>{
    const t=clientTotals(c.id),b=balance(c.id);
    return `<article class="card client-card" onclick="openClient('${c.id}')"><div class="client-top"><div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.phone||"Telefon yok")}${c.taxNo?" • "+esc(c.taxNo):""}</div></div><div class="balance ${b<=.001?"clear":""}"><small>Kalan bakiye</small><strong>${money(b)}</strong></div></div><div class="client-footer"><span>Toplam borç: ${money(t.charge)}</span><span>Ödeme: ${money(t.payment)} ›</span></div></article>`
  }).join(""):`<div class="card empty">Kayıtlı mükellef bulunamadı.</div>`;
}

window.openClient=id=>{
  activeClientId=id; const c=state.clients.find(x=>x.id===id); if(!c)return;
  el("homeView").classList.add("hidden"); el("clientView").classList.remove("hidden"); el("backBtn").classList.remove("hidden");
  el("pageTitle").textContent=c.name; el("pageSubtitle").textContent="Mükellef hesap kartı";
  fillYears(); renderClient(); window.scrollTo(0,0);
};
function closeClient(){activeClientId=null;el("homeView").classList.remove("hidden");el("clientView").classList.add("hidden");el("backBtn").classList.add("hidden");el("pageTitle").textContent="Mükellef Takip";el("pageSubtitle").textContent="Mali müşavirlik bürosu";renderHome();}
function fillYears(){
  const years=[...new Set([new Date().getFullYear(),...clientMovements(activeClientId).map(m=>Number(m.date.slice(0,4)))])].sort((a,b)=>b-a);
  el("movementYear").innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join("");
}
function renderClient(){
  const c=state.clients.find(x=>x.id===activeClientId); if(!c)return;
  const t=clientTotals(c.id), b=t.charge-t.payment;
  el("clientTotalCharge").textContent=money(t.charge); el("clientTotalPayment").textContent=money(t.payment); el("clientBalance").textContent=money(b);
  el("detailPhone").textContent=c.phone||"—";el("detailTaxNo").textContent=c.taxNo||"—";el("detailMonthlyFee").textContent=money(c.monthlyFee);
  const year=el("movementYear").value||String(new Date().getFullYear());
  const ms=clientMovements(c.id).filter(m=>m.date.startsWith(year)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
  el("movementList").innerHTML=ms.length?ms.map(m=>`<article class="card movement-card ${m.type}"><div><h3>${esc(m.note)}</h3><div class="meta">${new Date(m.date+"T00:00:00").toLocaleDateString("tr-TR")} • ${m.type==="charge"?"Borç":"Ödeme"}</div></div><div class="movement-amount"><strong>${m.type==="payment"?"−":"+"}${money(m.amount)}</strong><button class="movement-delete" onclick="deleteMovement('${m.id}')">Sil</button></div></article>`).join(""):`<div class="card empty">${year} yılına ait hareket yok.</div>`;
}
function renderAll(){renderHome();if(activeClientId)renderClient()}

el("clientForm").addEventListener("submit",e=>{
  e.preventDefault(); state.clients.push({id:uid(),name:el("clientName").value.trim(),phone:el("clientPhone").value.trim(),taxNo:el("clientTaxNo").value.trim(),monthlyFee:Number(el("clientMonthlyFee").value)||0,createdAt:new Date().toISOString()});e.target.reset();save();
});
el("clientSearch").addEventListener("input",renderHome);el("clientFilter").addEventListener("change",renderHome);el("movementYear").addEventListener("change",renderClient);el("backBtn").addEventListener("click",closeClient);

function openMovement(type,defaults={}){
  el("movementType").value=type;el("movementTitle").textContent=type==="charge"?"Borç Ekle":"Ödeme Ekle";el("movementAmount").value=defaults.amount||"";el("movementDate").value=defaults.date||today();el("movementNote").value=defaults.note||(type==="charge"?"Mali müşavirlik hizmet bedeli":"Tahsilat");el("movementDialog").showModal();
}
el("addChargeBtn").addEventListener("click",()=>openMovement("charge"));el("addPaymentBtn").addEventListener("click",()=>openMovement("payment"));
el("addMonthlyBtn").addEventListener("click",()=>{
  const c=state.clients.find(x=>x.id===activeClientId);if(!c)return;
  if(!(Number(c.monthlyFee)>0))return alert("Önce mükellefin aylık hizmet bedelini girin.");
  const month=today().slice(0,7);
  const exists=clientMovements(c.id).some(m=>m.type==="charge"&&m.monthKey===month);
  if(exists&&!confirm("Bu ay için daha önce aylık borç eklenmiş. Yine de yeni kayıt eklensin mi?"))return;
  openMovement("charge",{amount:c.monthlyFee,date:today(),note:monthName(today())+" mali müşavirlik hizmet bedeli"});
});
el("movementForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;e.preventDefault();const amount=Number(el("movementAmount").value);if(!(amount>0))return alert("Geçerli tutar girin.");
  const type=el("movementType").value,date=el("movementDate").value;
  state.movements.push({id:uid(),clientId:activeClientId,type,amount,date,note:el("movementNote").value.trim(),monthKey:type==="charge"?date.slice(0,7):undefined,createdAt:new Date().toISOString()});el("movementDialog").close();fillYears();save();
});
window.deleteMovement=id=>{if(confirm("Bu hesap hareketi silinsin mi?")){state.movements=state.movements.filter(m=>m.id!==id);fillYears();save();}};

el("editClientBtn").addEventListener("click",()=>{
  const c=state.clients.find(x=>x.id===activeClientId);if(!c)return;
  const name=prompt("Ad / Unvan",c.name);if(name===null)return;const phone=prompt("Telefon",c.phone);if(phone===null)return;const taxNo=prompt("Vergi / T.C. No",c.taxNo);if(taxNo===null)return;const fee=prompt("Aylık hizmet bedeli",c.monthlyFee);if(fee===null)return;
  c.name=name.trim()||c.name;c.phone=phone.trim();c.taxNo=taxNo.trim();c.monthlyFee=Number(String(fee).replace(",","."))||0;el("pageTitle").textContent=c.name;save();
});

el("sharePdfBtn").addEventListener("click",()=>{
  const c=state.clients.find(x=>x.id===activeClientId);if(!c)return;
  const ms=clientMovements(c.id).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt.localeCompare(b.createdAt));const t=clientTotals(c.id);
  let running=0;
  const rows=ms.map(m=>{running+=m.type==="charge"?Number(m.amount):-Number(m.amount);return `<tr><td>${new Date(m.date+"T00:00:00").toLocaleDateString("tr-TR")}</td><td>${esc(m.note)}</td><td>${m.type==="charge"?money(m.amount):""}</td><td>${m.type==="payment"?money(m.amount):""}</td><td>${money(running)}</td></tr>`}).join("");
  const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(c.name)} Hesap Ekstresi</title><style>body{font-family:Arial,sans-serif;color:#111;padding:24px}h1{font-size:22px;margin:0 0 6px}.sub{color:#555;margin-bottom:20px}.summary{display:flex;gap:10px;margin:16px 0}.box{flex:1;border:1px solid #bbb;padding:10px}.box small{display:block;color:#666}.box strong{font-size:18px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:7px;text-align:left}th{background:#eee}td:nth-child(n+3),th:nth-child(n+3){text-align:right}.note{margin-top:18px;font-size:11px;color:#666}@media print{button{display:none}body{padding:0}}</style></head><body><button onclick="window.print()" style="padding:12px 18px;margin-bottom:18px">PDF Olarak Kaydet / Paylaş</button><h1>${esc(c.name)} – Hesap Ekstresi</h1><div class="sub">Vergi/T.C. No: ${esc(c.taxNo||"—")} &nbsp; Telefon: ${esc(c.phone||"—")}<br>Rapor tarihi: ${new Date().toLocaleDateString("tr-TR")}</div><div class="summary"><div class="box"><small>Toplam Borç</small><strong>${money(t.charge)}</strong></div><div class="box"><small>Toplam Ödeme</small><strong>${money(t.payment)}</strong></div><div class="box"><small>Kalan Bakiye</small><strong>${money(t.charge-t.payment)}</strong></div></div><table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Borç</th><th>Ödeme</th><th>Bakiye</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Hesap hareketi bulunmuyor.</td></tr>'}</tbody></table><div class="note">Bu belge bilgilendirme amacıyla hazırlanmış cari hesap ekstresidir.</div><script>setTimeout(()=>window.print(),400)<\/script></body></html>`;
  const w=window.open("","_blank");if(!w)return alert("PDF ekranı açılamadı. Safari açılır pencere iznini kontrol edin.");w.document.open();w.document.write(html);w.document.close();
});

el("exportBtn").addEventListener("click",()=>{const blob=new Blob([JSON.stringify({...state,version:3,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`mukellef-takip-yedek-${today()}.json`;a.click();URL.revokeObjectURL(a.href)});
el("importFile").addEventListener("change",async e=>{const file=e.target.files[0];if(!file)return;try{const data=JSON.parse(await file.text());if(!Array.isArray(data.clients)||!Array.isArray(data.movements))throw Error();if(confirm("Mevcut veriler yedek dosyasıyla değiştirilsin mi?")){state={clients:data.clients,movements:data.movements};closeClient();save()}}catch{alert("Geçersiz yedek dosyası.")}e.target.value=""});
el("clearBtn").addEventListener("click",()=>{if(confirm("Tüm mükellefler ve hesap hareketleri kalıcı olarak silinsin mi?")){state={clients:[],movements:[]};save()}});
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;el("installBtn").classList.remove("hidden")});el("installBtn").addEventListener("click",async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;el("installBtn").classList.add("hidden")});
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
renderAll();
