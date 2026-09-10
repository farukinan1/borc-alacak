const STORAGE_KEY="mukellef-takip-v5";
const PREV_KEYS=["mukellef-takip-v4","mukellef-takip-v3","borc-alacak-v1"];
const OWNER={
  name:"Faruk İNAN",
  phone:"0544 935 45 25",
  address:"Fırat Mah. Ebu Sadık Cad. No: 14/C, Kahta / Adıyaman",
  iban:"TR32 0001 0003 9952 4499 8750 01"
};
const el=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2);
const money=n=>new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(Number(n)||0);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
const dateText=d=>d?new Date(d+"T00:00:00").toLocaleDateString("tr-TR"):"—";
const monthName=d=>new Intl.DateTimeFormat("tr-TR",{month:"long",year:"numeric"}).format(new Date(d+"T00:00:00"));
let state=loadState(), activeClientId=null, deferredPrompt=null, shareQueue=[], queueIndex=0, whatsappQueue=[], whatsappQueueIndex=0;

function normalizeClient(c={}){
  return {id:c.id||uid(),name:c.name||c.person||"Mükellef",phone:c.phone||"",taxNo:c.taxNo||"",monthlyFee:Number(c.monthlyFee)||0,startDate:c.startDate||"",endDate:c.endDate||"",status:c.status||(c.endDate?"closed":"active"),email:c.email||"",taxOffice:c.taxOffice||"",sgkNo:c.sgkNo||"",activityCode:c.activityCode||"",activitySubject:c.activitySubject||"",companyType:c.companyType||"",taxLiability:c.taxLiability||"",mersisNo:c.mersisNo||"",tradeRegistryNo:c.tradeRegistryNo||"",chamberNo:c.chamberNo||"",inspectionStatus:c.inspectionStatus||"",address:c.address||"",notes:c.notes||"",gibUsername:c.gibUsername||"",sgkUsername:c.sgkUsername||"",createdAt:c.createdAt||new Date().toISOString()};
}
function loadState(){
  for(const key of [STORAGE_KEY,...PREV_KEYS]){
    try{
      const d=JSON.parse(localStorage.getItem(key));
      if(d?.clients&&d?.movements) return {clients:d.clients.map(normalizeClient),movements:d.movements,activity:Array.isArray(d.activity)?d.activity:[]};
      if(Array.isArray(d)){
        const clients=[],movements=[],map=new Map();
        d.forEach(e=>{
          const k=(e.person||"Mükellef").trim().toLocaleLowerCase("tr");
          if(!map.has(k)){const c=normalizeClient({name:e.person});clients.push(c);map.set(k,c.id)}
          const clientId=map.get(k);
          movements.push({id:uid(),clientId,type:e.type==="receivable"?"charge":"payment",amount:Number(e.amount)||0,date:e.date||today(),note:e.note||"Eski kayıttan aktarıldı",createdAt:new Date().toISOString()});
          if(Number(e.paid)>0) movements.push({id:uid(),clientId,type:"payment",amount:Number(e.paid),date:e.date||today(),note:"Eski kayıttaki ödeme",createdAt:new Date().toISOString()});
        });
        return {clients,movements,activity:[]};
      }
    }catch{}
  }
  return {clients:[],movements:[],activity:[]};
}
function logActivity(text){
  state.activity=state.activity||[];
  state.activity.unshift({id:uid(),text,at:new Date().toISOString()});
  state.activity=state.activity.slice(0,200);
}
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state));renderAll()}
function clientMovements(id){return state.movements.filter(m=>m.clientId===id)}
function totals(id){return clientMovements(id).reduce((a,m)=>(m.type==="charge"?a.charge+=+m.amount:a.payment+=+m.amount,a),{charge:0,payment:0})}
function balance(id){const t=totals(id);return t.charge-t.payment}
function statusLabel(c){if(c.endDate||c.status==="closed")return "🔴 Terk";if(c.status==="suspended")return "🟡 Askıda";if(c.status==="pending")return "🔵 Beklemede";return "🟢 Aktif"}

function normalizeTrPhone(phone){
  let d=String(phone||"").replace(/\D/g,"");
  if(d.startsWith("0090")) d=d.slice(2);
  if(d.startsWith("90") && d.length>=12) return d;
  if(d.startsWith("0")) d=d.slice(1);
  if(d.length===10) return "90"+d;
  return d;
}
function whatsappDebtMessage(c){
  const b=Math.max(0,balance(c.id));
  return `Sayın ${c.name}, cari hesabınızda ${money(b)} bakiye bulunmaktadır. Ödemenizi aşağıdaki hesaba yapmanızı rica ederiz.

IBAN: ${OWNER.iban}
Alıcı: ${OWNER.name}

Ödeme yapıldıktan sonra dekontun WhatsApp üzerinden iletilmesi rica olunur. Teşekkür ederiz.`;
}
function openWhatsappForClient(c){
  const phone=normalizeTrPhone(c.phone);
  if(!phone || phone.length<12){
    alert(`${c.name} için geçerli telefon numarası bulunamadı.`);
    return false;
  }
  window.location.href=`https://wa.me/${phone}?text=${encodeURIComponent(whatsappDebtMessage(c))}`;
  return true;
}

function paymentStatus(c){
  const t=totals(c.id), b=t.charge-t.payment;
  if(t.charge<=0.001) return "⚪ Hareket Yok";
  if(b<=0.001) return "🟢 Ödendi";
  if(t.payment>0.001) return "🟡 Kısmi Ödeme";
  return "🔴 Ödeme Bekleniyor";
}
function eligibleForMonth(c,monthKey){
  if(c.status!=="active")return false;
  const first=monthKey+"-01";
  const last=new Date(+monthKey.slice(0,4),+monthKey.slice(5,7),0).toISOString().slice(0,10);
  if(c.startDate&&c.startDate>last)return false;
  if(c.endDate&&c.endDate<first)return false;
  return Number(c.monthlyFee)>0;
}
function hasMonth(c,monthKey){return clientMovements(c.id).some(m=>m.type==="charge"&&m.monthKey===monthKey)}

function renderHome(){
  const mk=today().slice(0,7);
  const monthMoves=state.movements.filter(m=>m.date.startsWith(mk));
  el("clientCount").textContent=state.clients.length;
  el("debtClientCount").textContent=state.clients.filter(c=>balance(c.id)>0.001).length;
  el("officeReceivable").textContent=money(state.clients.reduce((s,c)=>s+Math.max(0,balance(c.id)),0));
  el("monthCharges").textContent=money(monthMoves.filter(m=>m.type==="charge").reduce((s,m)=>s+Number(m.amount),0));
  el("monthPayments").textContent=money(monthMoves.filter(m=>m.type==="payment").reduce((s,m)=>s+Number(m.amount),0));

  const q=el("clientSearch").value.trim().toLocaleLowerCase("tr");
  const f=el("clientFilter").value;
  const clients=state.clients.filter(c=>{
    const b=balance(c.id), closed=!!c.endDate||c.status==="closed";
    const matches=(c.name+" "+c.taxNo+" "+c.phone+" "+c.activityCode+" "+c.activitySubject+" "+c.companyType).toLocaleLowerCase("tr").includes(q);
    return matches&&(f==="all"||(f==="active"&&!closed&&c.status==="active")||(f==="closed"&&closed)||(f==="debt"&&b>0.001)||(f==="clear"&&b<=0.001));
  }).sort((a,b)=>a.name.localeCompare(b.name,"tr"));

  el("clientList").innerHTML=clients.length?clients.map(c=>{
    const b=balance(c.id), clear=b<=0.001;
    return `<article class="card client-card" onclick="openClient('${c.id}')">
      <div class="client-top"><div><h3>${esc(c.name)}</h3><div class="meta">${esc(c.taxNo||"Vergi/T.C. no yok")} • ${statusLabel(c)}</div></div>
      <div class="balance ${clear?"clear":""}"><small>Kalan</small><strong>${money(Math.max(0,b))}</strong></div></div>
      <div class="client-footer"><span>${paymentStatus(c)}</span><span>Aylık: ${money(c.monthlyFee)}</span></div>
    </article>`;
  }).join(""):`<div class="card empty">Henüz mükellef kaydı yok.</div>`;

  const logs=(state.activity||[]).slice(0,20);
  el("activityList").innerHTML=logs.length?logs.map(x=>`<div class="activity-item"><strong>${esc(x.text)}</strong><span>${new Date(x.at).toLocaleString("tr-TR")}</span></div>`).join(""):`<div class="empty">Henüz işlem kaydı yok.</div>`;
}
window.openClient=id=>{
  activeClientId=id;
  const c=state.clients.find(x=>x.id===id);if(!c)return;
  el("homeView").classList.add("hidden");el("clientView").classList.remove("hidden");
  el("backBtn").classList.remove("hidden");el("homeBtn").classList.remove("hidden");
  el("pageTitle").textContent=c.name;el("pageSubtitle").textContent="Cari hesap ve mükellef bilgileri";
  fillYears();renderClient();window.scrollTo(0,0);
};
function closeClient(){
  activeClientId=null;el("clientView").classList.add("hidden");el("homeView").classList.remove("hidden");
  el("backBtn").classList.add("hidden");el("homeBtn").classList.add("hidden");
  el("pageTitle").textContent="Mükellef Takip";el("pageSubtitle").textContent="Faruk İnan • Cari takip sistemi";
  renderHome();window.scrollTo(0,0);
}
function fillYears(){
  const ys=[...new Set([new Date().getFullYear(),...clientMovements(activeClientId).map(m=>+m.date.slice(0,4))])].sort((a,b)=>b-a);
  el("movementYear").innerHTML=ys.map(y=>`<option>${y}</option>`).join("");
}
function renderClient(){
  const c=state.clients.find(x=>x.id===activeClientId);if(!c)return;
  const t=totals(c.id);
  el("clientTotalCharge").textContent=money(t.charge);el("clientTotalPayment").textContent=money(t.payment);el("clientBalance").textContent=money(t.charge-t.payment);
  [["detailPaymentStatus",paymentStatus(c)],["detailStatus",statusLabel(c)],["detailPhone",c.phone||"—"],["detailTaxNo",c.taxNo||"—"],["detailMonthlyFee",money(c.monthlyFee)],["detailStartDate",dateText(c.startDate)],["detailEndDate",dateText(c.endDate)],["detailEmail",c.email||"—"],["detailTaxOffice",c.taxOffice||"—"],["detailSgkNo",c.sgkNo||"—"],["detailActivityCode",c.activityCode||"—"],["detailCompanyType",c.companyType||"—"],["detailActivitySubject",c.activitySubject||"—"],["detailTaxLiability",c.taxLiability||"—"],["detailMersisNo",c.mersisNo||"—"],["detailTradeRegistryNo",c.tradeRegistryNo||"—"],["detailChamberNo",c.chamberNo||"—"],["detailInspectionStatus",c.inspectionStatus||"—"],["detailGibUsername",c.gibUsername||"—"],["detailSgkUsername",c.sgkUsername||"—"],["detailAddress",c.address||"—"],["detailNotes",c.notes||"—"]].forEach(([i,v])=>el(i).textContent=v);
  el("addMonthlyBtn").disabled=!eligibleForMonth(c,today().slice(0,7))||hasMonth(c,today().slice(0,7));
  const y=el("movementYear").value||new Date().getFullYear();
  const ms=clientMovements(c.id).filter(m=>m.date.startsWith(y)).sort((a,b)=>b.date.localeCompare(a.date));
  el("movementList").innerHTML=ms.length?ms.map(m=>`<article class="card movement-card ${m.type}">
    <div><h3>${esc(m.note)}</h3><div class="meta">${dateText(m.date)} • ${m.type==="charge"?"Borç":"Ödeme"}</div></div>
    <div class="movement-amount"><strong>${m.type==="payment"?"−":"+"}${money(m.amount)}</strong><button class="movement-delete" onclick="deleteMovement('${m.id}')">Sil</button></div>
  </article>`).join(""):`<div class="card empty">${y} yılına ait hareket yok.</div>`;
}
function renderAll(){renderHome();if(activeClientId)renderClient()}

el("clientForm").addEventListener("submit",e=>{
  e.preventDefault();
  const c=normalizeClient({name:el("clientName").value.trim(),phone:el("clientPhone").value.trim(),taxNo:el("clientTaxNo").value.trim(),monthlyFee:el("clientMonthlyFee").value,startDate:el("clientStartDate").value,endDate:el("clientEndDate").value,status:el("clientEndDate").value?"closed":el("clientStatus").value,email:el("clientEmail").value.trim(),taxOffice:el("clientTaxOffice").value.trim(),sgkNo:el("clientSgkNo").value.trim(),activityCode:el("clientActivityCode").value.trim(),activitySubject:el("clientActivitySubject").value.trim(),companyType:el("clientCompanyType").value.trim(),taxLiability:el("clientTaxLiability").value.trim(),mersisNo:el("clientMersisNo").value.trim(),tradeRegistryNo:el("clientTradeRegistryNo").value.trim(),chamberNo:el("clientChamberNo").value.trim(),inspectionStatus:el("clientInspectionStatus").value.trim(),gibUsername:el("clientGibUsername").value.trim(),sgkUsername:el("clientSgkUsername").value.trim(),address:el("clientAddress").value.trim(),notes:el("clientNotes").value.trim()});
  state.clients.push(c);logActivity(`${c.name} mükellef olarak eklendi.`);e.target.reset();el("clientFormCard").classList.add("hidden");el("toggleClientFormBtn").classList.remove("hidden");save();
});
el("toggleClientFormBtn").onclick=()=>{el("clientFormCard").classList.remove("hidden");el("toggleClientFormBtn").classList.add("hidden");el("clientName").focus()};
el("closeClientFormBtn").onclick=()=>{el("clientFormCard").classList.add("hidden");el("toggleClientFormBtn").classList.remove("hidden")};
el("clientSearch").oninput=renderHome;el("clientFilter").onchange=renderHome;el("movementYear").onchange=renderClient;el("backBtn").onclick=closeClient;el("homeBtn").onclick=closeClient;

function openMovement(type,d={}){
  el("movementType").value=type;el("movementTitle").textContent=type==="charge"?"Borç Ekle":"Ödeme Ekle";
  el("movementAmount").value=d.amount||"";el("movementDate").value=d.date||today();
  el("movementNote").value=d.note||(type==="charge"?"Hizmet bedeli":"Tahsilat");
  el("movementDialog").showModal();
}
el("addChargeBtn").onclick=()=>openMovement("charge");
el("addPaymentBtn").onclick=()=>openMovement("payment");
el("addMonthlyBtn").onclick=()=>{
  const c=state.clients.find(x=>x.id===activeClientId),mk=today().slice(0,7);
  if(!eligibleForMonth(c,mk))return alert("Bu mükellef aktif değil, terk tarihi var veya aylık ücreti tanımlı değil.");
  if(hasMonth(c,mk))return alert("Bu ay için borç zaten eklenmiş.");
  openMovement("charge",{amount:c.monthlyFee,note:monthName(today())+" hizmet bedeli"});
};
el("movementForm").addEventListener("submit",e=>{
  if(e.submitter?.value==="cancel")return;
  e.preventDefault();
  const amount=+el("movementAmount").value;if(!(amount>0))return;
  const type=el("movementType").value,date=el("movementDate").value,c=state.clients.find(x=>x.id===activeClientId);
  const note=el("movementNote").value.trim();
  state.movements.push({id:uid(),clientId:activeClientId,type,amount,date,note,monthKey:type==="charge"?date.slice(0,7):undefined,createdAt:new Date().toISOString()});
  logActivity(`${c.name}: ${money(amount)} ${type==="charge"?"borç":"ödeme"} kaydı eklendi.`);
  el("movementDialog").close();fillYears();save();
});
window.deleteMovement=id=>{
  const m=state.movements.find(x=>x.id===id);if(!m)return;
  if(confirm("Bu hesap hareketi silinsin mi?")){
    const c=state.clients.find(x=>x.id===m.clientId);
    state.movements=state.movements.filter(x=>x.id!==id);
    logActivity(`${c?.name||"Mükellef"} hesabından ${money(m.amount)} tutarlı hareket silindi.`);
    fillYears();save();
  }
};
el("bulkMonthlyBtn").onclick=()=>{
  const mk=today().slice(0,7);
  const eligible=state.clients.filter(c=>eligibleForMonth(c,mk)&&!hasMonth(c,mk));
  const skipped=state.clients.length-eligible.length;
  if(!eligible.length)return alert("Borç eklenecek uygun mükellef bulunamadı.");
  if(!confirm(`${monthName(today())} dönemi için ${eligible.length} mükellefe borç eklenecek. ${skipped} mükellef atlanacak. Devam edilsin mi?`))return;
  eligible.forEach(c=>state.movements.push({id:uid(),clientId:c.id,type:"charge",amount:+c.monthlyFee,date:today(),note:monthName(today())+" hizmet bedeli",monthKey:mk,createdAt:new Date().toISOString()}));
  logActivity(`${eligible.length} mükellefe ${monthName(today())} dönemi borcu toplu eklendi.`);
  save();alert(`${eligible.length} mükellefe borç eklendi. ${skipped} mükellef atlandı.`);
};
el("editClientBtn").onclick=()=>{
  const c=state.clients.find(x=>x.id===activeClientId);
  const fields=[["Ad / Unvan","name"],["Telefon","phone"],["Vergi / T.C. No","taxNo"],["Aylık hizmet bedeli","monthlyFee"],["İşe başlama tarihi (YYYY-AA-GG)","startDate"],["Terk tarihi (YYYY-AA-GG)","endDate"],["Durum: active / suspended / pending / closed","status"],["E-posta","email"],["Vergi Dairesi","taxOffice"],["SGK Sicil No","sgkNo"],["Faaliyet Kodu (NACE)","activityCode"],["Faaliyet Konusu","activitySubject"],["İşletme / Şirket Türü","companyType"],["Vergi Mükellefiyet Türü","taxLiability"],["MERSİS No","mersisNo"],["Ticaret Sicil No","tradeRegistryNo"],["Oda Sicil No","chamberNo"],["Yoklama Durumu","inspectionStatus"],["GİB Kullanıcı Adı","gibUsername"],["SGK Kullanıcı Adı","sgkUsername"],["Adres","address"],["Notlar","notes"]];
  for(const [label,key] of fields){const v=prompt(label,c[key]??"");if(v===null)return;c[key]=key==="monthlyFee"?Number(v.replace(",","."))||0:v.trim()}
  if(c.endDate)c.status="closed";
  logActivity(`${c.name} mükellef bilgileri güncellendi.`);
  el("pageTitle").textContent=c.name;save();
};


async function copyAndOpen(value,url,label){
  if(value){try{await navigator.clipboard.writeText(value)}catch{}}
  window.open(url,"_blank","noopener");
  if(!value) alert(`${label} kullanıcı adı kayıtlı değil. Kurum sayfası açıldı.`);
  else alert(`${label} kullanıcı adı kopyalandı. Açılan sayfada kullanıcı adı alanına yapıştırın; şifreyi iPhone Parolalar ile doldurun.`);
}
el("openGibBtn").onclick=()=>{const c=state.clients.find(x=>x.id===activeClientId);copyAndOpen(c?.gibUsername,"https://dijital.gib.gov.tr/portal","GİB")};
el("openSgkBtn").onclick=()=>{const c=state.clients.find(x=>x.id===activeClientId);copyAndOpen(c?.sgkUsername,"https://e.sgk.gov.tr/Uygulamalar/Isveren","SGK")};

function wrapText(ctx,text,x,y,maxWidth,lineHeight){
  const words=String(text||"—").split(/\s+/);let line="";
  for(const w of words){const test=line?line+" "+w:w;if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line,x,y);line=w;y+=lineHeight}else line=test}
  ctx.fillText(line,x,y);return y;
}
function drawClientCard(c){
  const canvas=el("clientCardCanvas"),ctx=canvas.getContext("2d");
  const W=canvas.width,H=canvas.height;
  ctx.clearRect(0,0,W,H);ctx.fillStyle="#f1f5f9";ctx.fillRect(0,0,W,H);
  ctx.fillStyle="#0f172a";ctx.fillRect(0,0,W,250);
  const logo=new Image();logo.src="logo.png";
  const draw=()=>{
    ctx.save();ctx.beginPath();ctx.roundRect(70,55,140,140,28);ctx.clip();ctx.drawImage(logo,70,55,140,140);ctx.restore();
    ctx.fillStyle="#fff";ctx.font="700 48px Arial";ctx.fillText("MÜKELLEF BİLGİ KARTI",245,112);
    ctx.font="32px Arial";ctx.fillStyle="#cbd5e1";ctx.fillText("Faruk İnan",245,165);
    ctx.fillStyle="#fff";ctx.beginPath();ctx.roundRect(55,300,1090,1580,28);ctx.fill();

    let y=370;
    const rows=[
      ["Ad / Unvan",c.name],
      ["İşletme / Şirket Türü",c.companyType],
      ["Faaliyet Kodu (NACE)",c.activityCode],
      ["Faaliyet Konusu",c.activitySubject],
      ["Vergi Mükellefiyet Türü",c.taxLiability],
      ["Vergi / T.C. No",c.taxNo],
      ["Vergi Dairesi",c.taxOffice],
      ["MERSİS No",c.mersisNo],
      ["Ticaret Sicil No",c.tradeRegistryNo],
      ["Oda Sicil No",c.chamberNo],
      ["SGK İşyeri Sicil No",c.sgkNo],
      ["Yoklama Durumu",c.inspectionStatus],
      ["İşe Başlama Tarihi",dateText(c.startDate)],
      ["Telefon",c.phone],
      ["E-posta",c.email],
      ["Adres",c.address],
      ["Aylık Hizmet Bedeli",money(c.monthlyFee)]
    ];

    for(const [label,value] of rows){
      ctx.fillStyle="#64748b";ctx.font="700 22px Arial";ctx.fillText(label.toUpperCase(),95,y);
      ctx.fillStyle="#0f172a";ctx.font="700 30px Arial";
      y=wrapText(ctx,value||"—",95,y+38,980,36)+62;
      ctx.strokeStyle="#e2e8f0";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(95,y-27);ctx.lineTo(1105,y-27);ctx.stroke();
    }

    ctx.fillStyle="#0f172a";ctx.font="700 27px Arial";ctx.textAlign="center";
    ctx.fillText(OWNER.name+" • "+OWNER.phone,600,1940);
    ctx.font="22px Arial";ctx.fillStyle="#475569";ctx.fillText(OWNER.address,600,1982);
    ctx.textAlign="left";
  };
  if(logo.complete)draw();else logo.onload=draw;
}
el("clientCardBtn").onclick=()=>{const c=state.clients.find(x=>x.id===activeClientId);drawClientCard(c);el("clientCardDialog").showModal()};
el("closeCardDialogBtn").onclick=()=>el("clientCardDialog").close();
el("shareCardJpegBtn").onclick=()=>{const c=state.clients.find(x=>x.id===activeClientId),canvas=el("clientCardCanvas");canvas.toBlob(async blob=>{const file=new File([blob],`${c.name.replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi,"-")}-bilgi-karti.jpg`,{type:"image/jpeg"});if(navigator.canShare&&navigator.canShare({files:[file]}))await navigator.share({files:[file],title:`${c.name} Bilgi Kartı`});else{const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=file.name;a.click();URL.revokeObjectURL(a.href)}},"image/jpeg",.94)};
el("openCardPdfBtn").onclick=()=>{const c=state.clients.find(x=>x.id===activeClientId),img=el("clientCardCanvas").toDataURL("image/jpeg",.94),w=window.open("","_blank");if(!w)return alert("Safari açılır pencere iznini kontrol edin.");w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.name)} Bilgi Kartı</title><style>@page{size:A4;margin:10mm}body{margin:0;text-align:center;font-family:Arial}.actions{padding:10px}.actions button{padding:12px;border:0;border-radius:8px;font-weight:bold}.p{background:#2563eb;color:white}.b{background:#e2e8f0}img{max-width:100%;max-height:270mm}@media print{.actions{display:none}}</style></head><body><div class="actions"><button class="p" onclick="print()">PDF Olarak Kaydet / Paylaş</button> <button class="b" onclick="history.length>1?history.back():window.close()">Uygulamaya Dön</button></div><img src="${img}"></body></html>`);w.document.close()};

function statementHtml(c){
  const ms=clientMovements(c.id).sort((a,b)=>a.date.localeCompare(b.date)),t=totals(c.id);let run=0;
  const rows=ms.map(m=>{run+=m.type==="charge"?+m.amount:-m.amount;return `<tr><td>${dateText(m.date)}</td><td>${esc(m.note)}</td><td>${m.type==="charge"?money(m.amount):""}</td><td>${m.type==="payment"?money(m.amount):""}</td><td>${money(run)}</td></tr>`}).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(c.name)} Hesap Ekstresi</title>
  <style>
  @page{size:A4;margin:13mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#172033;background:#eef2f7}.sheet{max-width:900px;margin:16px auto;background:#fff;padding:24px;border-radius:14px}.actions{position:sticky;top:0;z-index:5;background:#fff;padding:8px 0 14px;display:flex;gap:8px}.actions button{padding:12px 14px;border:0;border-radius:9px;font-weight:bold}.print{background:#2563eb;color:#fff}.back{background:#e5e7eb}.head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #2563eb;padding-bottom:15px}.logo{width:92px;height:92px;object-fit:cover;border-radius:18px}.head h1{margin:0;font-size:24px}.head p{margin:5px 0 0;color:#64748b}.info{display:grid;grid-template-columns:1fr 1fr;gap:7px 18px;margin:18px 0;font-size:13px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.box{border:1px solid #cbd5e1;border-radius:10px;padding:11px;background:#f8fafc}.box span{display:block;color:#64748b;font-size:11px}.box b{font-size:17px}table{width:100%;border-collapse:collapse;font-size:11px;margin-top:18px}th{background:#0f172a;color:#fff}th,td{border:1px solid #cbd5e1;padding:7px}td:nth-child(n+3),th:nth-child(n+3){text-align:right}.footer{margin-top:22px;padding-top:15px;border-top:2px solid #e2e8f0;text-align:center;font-size:12px;line-height:1.65}.footer strong{font-size:14px}.note{margin-top:8px;color:#475569;font-style:italic}.watermark{position:fixed;right:30px;bottom:95px;width:150px;opacity:.055;z-index:0}@media print{body{background:#fff}.sheet{margin:0;padding:0;box-shadow:none}.actions{display:none}.watermark{display:block}}@media(max-width:600px){.sheet{margin:0;border-radius:0;padding:15px}.info{grid-template-columns:1fr}.summary{grid-template-columns:1fr}.head h1{font-size:19px}}
  </style></head><body><div class="sheet">
  <div class="actions"><button class="print" onclick="window.print()">PDF Olarak Kaydet / Paylaş</button><button class="back" onclick="history.length>1?history.back():window.close()">Uygulamaya Dön</button></div>
  <img class="watermark" src="logo.png" alt="">
  <div class="head"><img class="logo" src="logo.png" alt="Faruk İnan"><div><h1>CARİ HESAP EKSTRESİ</h1><p>${esc(c.name)}</p></div></div>
  <div class="info"><div><b>Mükellef:</b> ${esc(c.name)}</div><div><b>Rapor Tarihi:</b> ${dateText(today())}</div><div><b>Telefon:</b> ${esc(c.phone||"—")}</div><div><b>Vergi/T.C. No:</b> ${esc(c.taxNo||"—")}</div><div><b>Vergi Dairesi:</b> ${esc(c.taxOffice||"—")}</div><div><b>SGK Sicil No:</b> ${esc(c.sgkNo||"—")}</div><div><b>Faaliyet Kodu:</b> ${esc(c.activityCode||"—")}</div><div><b>Şirket Türü:</b> ${esc(c.companyType||"—")}</div><div style="grid-column:1/-1"><b>Faaliyet Konusu:</b> ${esc(c.activitySubject||"—")}</div><div style="grid-column:1/-1"><b>Adres:</b> ${esc(c.address||"—")}</div></div>
  <div class="summary"><div class="box"><span>Toplam Borç</span><b>${money(t.charge)}</b></div><div class="box"><span>Toplam Ödeme</span><b>${money(t.payment)}</b></div><div class="box"><span>Kalan Bakiye</span><b>${money(t.charge-t.payment)}</b></div></div>
  <table><thead><tr><th>Tarih</th><th>Açıklama</th><th>Borç</th><th>Ödeme</th><th>Bakiye</th></tr></thead><tbody>${rows||'<tr><td colspan="5">Hesap hareketi bulunmamaktadır.</td></tr>'}</tbody></table>
  <div class="footer"><strong>${OWNER.name}</strong><br>Telefon: ${OWNER.phone}<br>IBAN: ${OWNER.iban}<br>Adres: ${OWNER.address}<div class="note">Ödeme yapıldıktan sonra dekontun WhatsApp üzerinden iletilmesi rica olunur. Teşekkür ederiz.</div></div>
  </div></body></html>`;
}
function openStatement(c){
  const w=window.open("","_blank");if(!w)return alert("Safari açılır pencere iznini kontrol edin.");
  w.document.write(statementHtml(c));w.document.close();
}
el("sharePdfBtn").onclick=()=>openStatement(state.clients.find(c=>c.id===activeClientId));
function renderQueue(){
  el("queueInfo").textContent=`${queueIndex}/${shareQueue.length} tamamlandı. Her PDF açıldığında Safari paylaşımından WhatsApp’ı seçin.`;
  el("queueList").innerHTML=shareQueue.map((c,i)=>`<div class="queue-item ${i<queueIndex?"done":i===queueIndex?"current":""}"><span>${i+1}. ${esc(c.name)}</span><b>${i<queueIndex?"Tamam":i===queueIndex?"Sırada":"Bekliyor"}</b></div>`).join("");
  el("queueNextBtn").textContent=queueIndex>=shareQueue.length?"Kuyruk Tamamlandı":"Sıradaki PDF’yi Aç";el("queueNextBtn").disabled=queueIndex>=shareQueue.length;
}
el("bulkShareBtn").onclick=()=>{
  shareQueue=state.clients.filter(c=>clientMovements(c.id).length>0).sort((a,b)=>a.name.localeCompare(b.name,"tr"));queueIndex=0;
  if(!shareQueue.length)return alert("PDF oluşturulacak hesap hareketi bulunan mükellef yok.");
  renderQueue();el("queueDialog").showModal();
};
el("queueNextBtn").onclick=()=>{if(queueIndex>=shareQueue.length)return;openStatement(shareQueue[queueIndex]);queueIndex++;renderQueue()};
el("queueCloseBtn").onclick=()=>el("queueDialog").close();


function renderWhatsappQueue(){
  const current=whatsappQueueIndex;
  el("whatsappQueueInfo").textContent=`${current}/${whatsappQueue.length} tamamlandı. WhatsApp'ta gönderip uygulamaya dönün, sonra sıradakini açın.`;
  el("whatsappQueueList").innerHTML=whatsappQueue.map((c,i)=>{
    const b=Math.max(0,balance(c.id));
    return `<div class="queue-item ${i<current?"done":i===current?"current":""}"><span>${i+1}. ${esc(c.name)} • ${money(b)}</span><b>${i<current?"Tamam":i===current?"Sırada":"Bekliyor"}</b></div>`;
  }).join("");
  const done=current>=whatsappQueue.length;
  el("whatsappNextBtn").disabled=done;
  el("whatsappSkipBtn").disabled=done;
  el("whatsappNextBtn").textContent=done?"Kuyruk Tamamlandı":"Sıradaki WhatsApp Mesajını Aç";
}

el("bulkWhatsappBtn").onclick=()=>{
  whatsappQueue=state.clients
    .filter(c=>balance(c.id)>0.001 && normalizeTrPhone(c.phone).length>=12)
    .sort((a,b)=>balance(b.id)-balance(a.id));
  whatsappQueueIndex=0;
  if(!whatsappQueue.length) return alert("Borcu ve geçerli telefon numarası bulunan mükellef yok.");
  renderWhatsappQueue();
  el("whatsappQueueDialog").showModal();
};

el("whatsappNextBtn").onclick=()=>{
  if(whatsappQueueIndex>=whatsappQueue.length) return;
  const c=whatsappQueue[whatsappQueueIndex];
  if(openWhatsappForClient(c)){
    logActivity(`${c.name} için WhatsApp borç hatırlatma ekranı açıldı.`);
    whatsappQueueIndex++;
    save();
    renderWhatsappQueue();
  }
};

el("whatsappSkipBtn").onclick=()=>{
  if(whatsappQueueIndex>=whatsappQueue.length) return;
  whatsappQueueIndex++;
  renderWhatsappQueue();
};

el("whatsappQueueCloseBtn").onclick=()=>el("whatsappQueueDialog").close();

function debtListHtml(){
  const rows=state.clients
    .map(c=>({c,b:balance(c.id),t:totals(c.id)}))
    .filter(x=>x.b>0.001)
    .sort((a,b)=>b.b-a.b);
  const total=rows.reduce((s,x)=>s+x.b,0);
  const body=rows.map((x,i)=>`<tr><td>${i+1}</td><td>${esc(x.c.name)}</td><td>${esc(x.c.phone||"—")}</td><td>${esc(x.c.taxNo||"—")}</td><td>${money(x.t.charge)}</td><td>${money(x.t.payment)}</td><td><strong>${money(x.b)}</strong></td></tr>`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Toplu Borç Listesi</title>
  <style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0}
    .toolbar{position:sticky;top:0;background:#fff;padding:10px 0;display:flex;gap:8px}.toolbar button{border:0;border-radius:8px;padding:11px 14px;font-weight:700}
    .print{background:#2563eb;color:#fff}.back{background:#e5e7eb}.head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #2563eb;padding-bottom:12px}
    .head img{width:70px;height:70px;object-fit:cover;border-radius:14px}.head h1{font-size:22px;margin:0}.head p{margin:4px 0 0;color:#64748b}
    .summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0}.box{border:1px solid #d1d5db;border-radius:10px;padding:10px}
    table{width:100%;border-collapse:collapse;font-size:10.5px}th{background:#0f172a;color:#fff}th,td{border:1px solid #d1d5db;padding:6px}
    td:nth-child(n+5),th:nth-child(n+5){text-align:right}.foot{margin-top:14px;text-align:center;font-size:11px;color:#475569}@media print{.toolbar{display:none}}
  </style></head><body>
  <div class="toolbar"><button class="print" onclick="window.print()">Yazdır / PDF Kaydet</button><button class="back" onclick="history.length>1?history.back():window.close()">Uygulamaya Dön</button></div>
  <div class="head"><img src="logo.png"><div><h1>TOPLU BORÇ LİSTESİ</h1><p>${OWNER.name} • ${dateText(today())}</p></div></div>
  <div class="summary"><div class="box"><b>Borçlu Mükellef Sayısı</b><div>${rows.length}</div></div><div class="box"><b>Toplam Alacak</b><div>${money(total)}</div></div></div>
  <table><thead><tr><th>#</th><th>Mükellef</th><th>Telefon</th><th>Vergi/T.C. No</th><th>Toplam Borç</th><th>Toplam Ödeme</th><th>Kalan</th></tr></thead>
  <tbody>${body||'<tr><td colspan="7">Borçlu mükellef bulunmamaktadır.</td></tr>'}</tbody></table>
  <div class="foot">${OWNER.name} • ${OWNER.phone}</div></body></html>`;
}

el("printDebtListBtn").onclick=()=>{
  const w=window.open("","_blank");
  if(!w) return alert("Tarayıcı açılır pencere iznini kontrol edin.");
  w.document.write(debtListHtml());
  w.document.close();
};

el("clearLogBtn").onclick=()=>{if(confirm("İşlem günlüğü temizlensin mi?")){state.activity=[];save()}};
el("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify({...state,version:5,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=`mukellef-takip-yedek-${today()}.json`;a.click();URL.revokeObjectURL(a.href);
};
el("importFile").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const d=JSON.parse(await file.text());if(!Array.isArray(d.clients)||!Array.isArray(d.movements))throw 0;
    if(confirm("Mevcut veriler yedekle değiştirilsin mi?")){
      state={clients:d.clients.map(normalizeClient),movements:d.movements,activity:Array.isArray(d.activity)?d.activity:[]};
      logActivity("Yedek dosyası geri yüklendi.");closeClient();save();
    }
  }catch{alert("Geçersiz yedek dosyası.")}e.target.value="";
};
el("clearBtn").onclick=()=>{if(confirm("Tüm mükellefler, hareketler ve günlük kayıtları silinsin mi?")){state={clients:[],movements:[],activity:[]};save()}};

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredPrompt=e;el("installBtn").classList.remove("hidden")});
el("installBtn").onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;el("installBtn").classList.add("hidden")};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
renderAll();