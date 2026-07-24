const STORAGE_KEY = "borc-alacak-v1";
let entries = loadEntries();
let activePaymentId = null;
let deferredPrompt = null;

const el = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(n || 0);
const today = new Date().toISOString().slice(0,10);
el("date").value = today;

function loadEntries(){
  try{return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []}
  catch{return []}
}
function saveEntries(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  render();
}
function remaining(e){
  return Math.max(0, Number(e.amount)-Number(e.paid||0));
}
function totals(){
  let receivable=0,debt=0;
  entries.forEach(e=>{
    const r=remaining(e);
    if(e.type==="receivable") receivable+=r; else debt+=r;
  });
  el("totalReceivable").textContent=money(receivable);
  el("totalDebt").textContent=money(debt);
  const net=receivable-debt;
  el("netBalance").textContent=(net>0?"+":"")+money(net);
}
function escapeHtml(s=""){
  return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]));
}
function render(){
  totals();
  const q=el("search").value.trim().toLocaleLowerCase("tr");
  const f=el("filter").value;
  const filtered=entries
    .filter(e=>{
      const text=(e.person+" "+(e.note||"")).toLocaleLowerCase("tr");
      const isClosed=remaining(e)<=0.0001;
      return (!q||text.includes(q)) &&
        (f==="all"||f===e.type||(f==="open"&&!isClosed)||(f==="closed"&&isClosed));
    })
    .sort((a,b)=>new Date(b.date)-new Date(a.date));

  const list=el("list");
  if(!filtered.length){
    list.innerHTML=el("emptyTemplate").innerHTML;
    return;
  }
  list.innerHTML=filtered.map(e=>{
    const rem=remaining(e), paid=Number(e.paid||0), pct=Math.min(100,(paid/Number(e.amount))*100||0);
    const closed=rem<=0.0001;
    return `<article class="card entry ${closed?"closed":""}">
      <div class="entry-top">
        <div>
          <h3>${escapeHtml(e.person)}</h3>
          <div class="meta">${new Date(e.date+"T00:00:00").toLocaleDateString("tr-TR")}${e.note?" • "+escapeHtml(e.note):""}</div>
        </div>
        <span class="badge ${e.type}">${e.type==="receivable"?"ALACAK":"BORÇ"}</span>
      </div>
      <div class="amount-row">
        <div><small>Toplam</small><strong>${money(e.amount)}</strong></div>
        <div style="text-align:right"><small>Kalan</small><strong>${money(rem)}</strong></div>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="meta" style="margin-bottom:10px">Ödenen: ${money(paid)}${closed?" • KAPANDI":""}</div>
      <div class="entry-actions">
        <button class="primary pay" onclick="openPayment('${e.id}')" ${closed?"disabled":""}>Ödeme Ekle</button>
        <button class="share" onclick="sharePersonPdf('${e.id}')">PDF / WhatsApp</button>
        <button class="edit" onclick="editEntry('${e.id}')">Düzenle</button>
        <button class="delete" onclick="deleteEntry('${e.id}')">Sil</button>
      </div>
    </article>`;
  }).join("");
}

el("entryForm").addEventListener("submit",e=>{
  e.preventDefault();
  const amount=Number(el("amount").value);
  if(!(amount>0)) return alert("Geçerli bir tutar girin.");
  entries.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    person: el("person").value.trim(),
    type: el("type").value,
    amount,
    paid:0,
    date:el("date").value,
    note:el("note").value.trim(),
    createdAt:new Date().toISOString()
  });
  e.target.reset();
  el("date").value=today;
  saveEntries();
});

window.openPayment=id=>{
  const e=entries.find(x=>x.id===id); if(!e)return;
  activePaymentId=id;
  el("paymentInfo").textContent=`${e.person} için kalan: ${money(remaining(e))}`;
  el("paymentAmount").value=remaining(e).toFixed(2);
  el("paymentAmount").max=remaining(e);
  el("paymentDialog").showModal();
};

el("paymentForm").addEventListener("submit",ev=>{
  if(ev.submitter?.value==="cancel") return;
  ev.preventDefault();
  const e=entries.find(x=>x.id===activePaymentId); if(!e)return;
  const value=Number(el("paymentAmount").value);
  if(!(value>0) || value>remaining(e)+0.001) return alert("Ödeme tutarı kalan bakiyeden büyük olamaz.");
  e.paid=Number(e.paid||0)+value;
  el("paymentDialog").close();
  saveEntries();
});

window.deleteEntry=id=>{
  const e=entries.find(x=>x.id===id);
  if(confirm(`${e?.person||"Bu kayıt"} silinsin mi?`)){
    entries=entries.filter(x=>x.id!==id); saveEntries();
  }
};

window.editEntry=id=>{
  const e=entries.find(x=>x.id===id); if(!e)return;
  const person=prompt("Kişi / Firma",e.person); if(person===null)return;
  const amount=prompt("Toplam tutar",e.amount); if(amount===null)return;
  const note=prompt("Açıklama",e.note||""); if(note===null)return;
  const num=Number(String(amount).replace(",","."));
  if(!(num>0) || num<Number(e.paid||0)) return alert("Tutar, ödenmiş miktardan küçük olamaz.");
  e.person=person.trim()||e.person; e.amount=num; e.note=note.trim();
  saveEntries();
};

el("search").addEventListener("input",render);
el("filter").addEventListener("change",render);



function safeFileName(value){
  return value.toLocaleLowerCase("tr-TR")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"") || "hesap-ekstresi";
}

function dataUrlToBytes(dataUrl){
  const binary=atob(dataUrl.split(",")[1]);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
  return bytes;
}

function buildImagePdf(images){
  const enc=new TextEncoder();
  const chunks=[]; const offsets=[0]; let length=0;
  const push=x=>{const b=typeof x==="string"?enc.encode(x):x; chunks.push(b); length+=b.length;};
  push("%PDF-1.4\n%PDFJS\n");
  const pageCount=images.length;
  const totalObjects=2+pageCount*3;
  const kids=[];
  for(let i=0;i<pageCount;i++) kids.push(`${3+i*3} 0 R`);
  const objects=[];
  objects[1]="<< /Type /Catalog /Pages 2 0 R >>";
  objects[2]=`<< /Type /Pages /Count ${pageCount} /Kids [${kids.join(" ")}] >>`;
  images.forEach((img,i)=>{
    const pageObj=3+i*3, imageObj=pageObj+1, contentObj=pageObj+2;
    objects[pageObj]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`;
    objects[imageObj]={head:`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`,bytes:img.bytes,tail:"\nendstream"};
    const content=`q\n595.28 0 0 841.89 0 0 cm\n/Im${i} Do\nQ\n`;
    objects[contentObj]=`<< /Length ${enc.encode(content).length} >>\nstream\n${content}endstream`;
  });
  for(let i=1;i<=totalObjects;i++){
    offsets[i]=length;
    push(`${i} 0 obj\n`);
    const obj=objects[i];
    if(typeof obj==="string") push(obj); else {push(obj.head);push(obj.bytes);push(obj.tail);}
    push("\nendobj\n");
  }
  const xref=length;
  push(`xref\n0 ${totalObjects+1}\n0000000000 65535 f \n`);
  for(let i=1;i<=totalObjects;i++) push(String(offsets[i]).padStart(10,"0")+" 00000 n \n");
  push(`trailer\n<< /Size ${totalObjects+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks,{type:"application/pdf"});
}

function createPersonPdf(person){
  const personEntries=entries.filter(e=>e.person===person).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const totalRec=personEntries.filter(e=>e.type==="receivable").reduce((a,e)=>a+remaining(e),0);
  const totalDebt=personEntries.filter(e=>e.type==="debt").reduce((a,e)=>a+remaining(e),0);
  const pages=[]; const W=1240,H=1754, margin=80, rowH=112;
  const perPage=11;
  for(let start=0;start<personEntries.length;start+=perPage){
    const canvas=document.createElement("canvas"); canvas.width=W; canvas.height=H;
    const c=canvas.getContext("2d");
    c.fillStyle="#ffffff"; c.fillRect(0,0,W,H);
    c.fillStyle="#0f172a"; c.fillRect(0,0,W,190);
    c.fillStyle="#ffffff"; c.font="700 46px -apple-system, Arial"; c.fillText("BORÇ / ALACAK HESAP EKSTRESİ",margin,78);
    c.font="500 26px -apple-system, Arial"; c.fillText(person,margin,130);
    c.font="400 20px -apple-system, Arial"; c.fillText(`Düzenlenme: ${new Date().toLocaleString("tr-TR")}`,margin,165);
    c.fillStyle="#0f172a"; c.font="700 26px -apple-system, Arial";
    c.fillText(`Kalan Alacak: ${money(totalRec)}`,margin,245);
    c.fillText(`Kalan Borç: ${money(totalDebt)}`,margin,285);
    c.fillText(`Net: ${money(totalRec-totalDebt)}`,margin,325);
    let y=385;
    c.fillStyle="#e2e8f0"; c.fillRect(margin,y,W-margin*2,58);
    c.fillStyle="#0f172a"; c.font="700 20px -apple-system, Arial";
    c.fillText("Tarih",margin+15,y+37); c.fillText("Tür",margin+180,y+37); c.fillText("Açıklama",margin+330,y+37); c.fillText("Toplam",margin+760,y+37); c.fillText("Ödenen",margin+910,y+37); c.fillText("Kalan",margin+1050,y+37);
    y+=58;
    personEntries.slice(start,start+perPage).forEach((e,idx)=>{
      if(idx%2===1){c.fillStyle="#f8fafc";c.fillRect(margin,y,W-margin*2,rowH);}
      c.fillStyle="#0f172a"; c.font="400 19px -apple-system, Arial";
      c.fillText(new Date(e.date+"T00:00:00").toLocaleDateString("tr-TR"),margin+15,y+36);
      c.fillText(e.type==="receivable"?"ALACAK":"BORÇ",margin+180,y+36);
      let note=(e.note||"-"); if(note.length>31) note=note.slice(0,30)+"…";
      c.fillText(note,margin+330,y+36);
      c.fillText(money(e.amount),margin+760,y+36);
      c.fillText(money(e.paid||0),margin+910,y+36);
      c.fillText(money(remaining(e)),margin+1050,y+36);
      c.fillStyle="#64748b"; c.font="400 17px -apple-system, Arial";
      c.fillText(`Kayıt: ${e.person}`,margin+15,y+75);
      y+=rowH;
    });
    c.strokeStyle="#cbd5e1";c.lineWidth=2;c.strokeRect(margin,385,W-margin*2,58+Math.min(perPage,personEntries.length-start)*rowH);
    c.fillStyle="#64748b";c.font="400 17px -apple-system, Arial";
    c.fillText(`Sayfa ${Math.floor(start/perPage)+1} / ${Math.ceil(personEntries.length/perPage)}`,W-margin-150,H-55);
    const url=canvas.toDataURL("image/jpeg",0.9);
    pages.push({bytes:dataUrlToBytes(url),width:W,height:H});
  }
  if(!pages.length){
    alert("Bu kişiye ait kayıt bulunamadı."); return null;
  }
  return buildImagePdf(pages);
}

window.sharePersonPdf=async id=>{
  const entry=entries.find(e=>e.id===id); if(!entry)return;
  const pdf=createPersonPdf(entry.person); if(!pdf)return;
  const filename=`${safeFileName(entry.person)}-borc-alacak.pdf`;
  const file=new File([pdf],filename,{type:"application/pdf"});
  try{
    if(navigator.canShare && navigator.canShare({files:[file]})){
      await navigator.share({title:`${entry.person} Borç Alacak Ekstresi`,text:"Borç / alacak hesap ekstresi PDF dosyasıdır.",files:[file]});
    }else{
      const a=document.createElement("a"); a.href=URL.createObjectURL(pdf); a.download=filename; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),2000);
      alert("PDF indirildi. WhatsApp konuşmasında belge olarak ekleyebilirsiniz.");
    }
  }catch(err){
    if(err?.name!=="AbortError") alert("PDF paylaşımı açılamadı. Lütfen tekrar deneyin.");
  }
};

el("exportBtn").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),entries},null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=`borc-alacak-yedek-${today}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el("importFile").addEventListener("change",async e=>{
  const file=e.target.files[0]; if(!file)return;
  try{
    const data=JSON.parse(await file.text());
    const incoming=Array.isArray(data)?data:data.entries;
    if(!Array.isArray(incoming)) throw new Error();
    if(confirm("Mevcut veriler yedek dosyasındaki verilerle değiştirilsin mi?")){
      entries=incoming; saveEntries();
    }
  }catch{alert("Geçersiz yedek dosyası.");}
  e.target.value="";
});

el("clearBtn").addEventListener("click",()=>{
  if(confirm("Tüm kayıtlar kalıcı olarak silinsin mi?")){
    entries=[]; saveEntries();
  }
});

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault(); deferredPrompt=e; el("installBtn").classList.remove("hidden");
});
el("installBtn").addEventListener("click",async()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice;
  deferredPrompt=null; el("installBtn").classList.add("hidden");
});

if("serviceWorker" in navigator){
  window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));
}
render();
