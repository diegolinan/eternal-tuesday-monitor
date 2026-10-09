export const reviewHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow, noarchive">
  <title>Review desk / Eternal Tuesday</title>
  <link rel="stylesheet" href="/review.css">
  <script src="/review.js" defer></script>
</head>
<body>
  <a class="skip" href="#main">Saltar al contenido</a>
  <header class="topline">
    <span class="brand">ETM <span class="brand-cross">+</span> REVIEW DESK</span>
    <span id="identity" class="identity">ACCESO PRIVADO</span>
  </header>
  <main id="main">
    <div class="eyebrow"><span class="live-dot"></span> HUMAN-IN-THE-LOOP / 01</div>
    <h1>Una bandeja.<br><span>Decisiones trazables.</span></h1>
    <p class="intro">Los candidatos nuevos aparecen acá automáticamente. Incorporar un lead no lo convierte en evidencia; ninguna decisión crea un PASS o FAIL.</p>
    <div id="notice" class="notice" role="status" aria-live="polite">Conectando con el registro…</div>
    <div class="desk-status"><span id="sync-status">SINCRONIZANDO</span><button id="refresh-desk" type="button">Actualizar ahora ↗</button></div>
    <div class="review-flow" aria-label="Etapas de revisión"><span>01 DETECTADO</span><span>02 INCORPORADO</span><span>03 DECIDIDO</span><span>04 PUBLICADO</span></div>
    <nav class="tabs" aria-label="Secciones de revisión">
      <button class="tab active" type="button" data-tab="proposals" aria-current="page">01 / Nuevos candidatos <span id="proposal-count">—</span></button>
      <button class="tab" type="button" data-tab="candidates">02 / Por decidir <span id="candidate-count">—</span></button>
    </nav>
    <section id="proposals" class="panel" aria-label="Propuestas pendientes">
      <div class="section-heading"><h2>Por incorporar</h2><p>Los candidatos se ven sin fusionar ni desplegar nada. Cada lote requiere validación antes de incorporarse.</p></div>
      <div class="two-column"><div id="proposal-list" class="proposal-list"></div><div id="proposal-detail" class="detail empty-detail">Seleccioná una propuesta para ver qué cambiaría.</div></div>
    </section>
    <section id="candidates" class="panel hidden" aria-label="Hallazgos pendientes">
      <div class="section-heading"><h2>Por decidir</h2><p>Estos leads ya fueron incorporados, pero todavía no son evidencia aceptada.</p></div>
      <div id="candidate-list" class="candidate-list"></div>
    </section>
    <section class="publication" aria-label="Estado de publicación"><h2>Publicación</h2><p id="publication-status">Consultando los despliegues automáticos…</p></section>
    <div class="method-note"><span>REVIEW BOUNDARY ↗</span><p>Los cambios aprobados pasan por validación y quedan registrados. Si una comprobación falla, no se publica nada.</p></div>
  </main>
  <footer><span>THE ETERNAL TUESDAY MONITOR</span><span>PRIVATE REVIEW SURFACE · NO PUBLIC VERDICTS</span></footer>
</body>
</html>`;

export const reviewCss = `
:root{--ink:#1e1e1e;--pink:#f386a1;--cyan:#00c8d0;--yellow:#fee857;--paper:#fefefe;--line:#bfbfbf;--mono:'LisaTerminal Paper 2X3Y Medium','Courier New',monospace;--sans:'Die Grotesk C Regular',Arial,Helvetica,sans-serif;--display:'Die Grotesk C Medium',Arial,Helvetica,sans-serif}
@font-face{font-family:'Die Grotesk C Regular';src:url('/die-grotesk-regular.woff2') format('woff2');font-display:swap}
@font-face{font-family:'Die Grotesk C Medium';src:url('/die-grotesk-medium.woff2') format('woff2');font-display:swap}
@font-face{font-family:'LisaTerminal Paper 2X3Y Medium';src:url('/lisa-terminal.woff2') format('woff2');font-display:swap}
*{box-sizing:border-box}html{background:var(--paper)}body{margin:0;color:var(--ink);font:16px/1.4 var(--sans)}button,select,textarea{font:inherit}button{cursor:pointer}a{color:inherit}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;z-index:10;background:var(--yellow);padding:8px}.topline{min-height:55px;background:var(--ink);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:10px clamp(20px,4vw,66px);font:700 12px/1.2 var(--mono);letter-spacing:.04em}.brand-cross{color:var(--pink);font-size:17px}.identity{overflow-wrap:anywhere;text-align:right}main{max-width:1500px;margin:auto;padding:clamp(28px,5vw,70px) clamp(20px,4vw,66px) 80px}.eyebrow{display:flex;align-items:center;gap:10px;font:700 12px var(--mono);letter-spacing:.04em}.live-dot{display:block;width:10px;height:10px;background:var(--cyan);border:1px solid var(--ink)}h1{font-size:clamp(54px,7.4vw,122px);line-height:.88;letter-spacing:-.072em;margin:32px 0 30px;max-width:1150px}h1 span{color:var(--pink)}.intro{font-size:clamp(18px,2vw,26px);max-width:790px;line-height:1.2;margin:0 0 48px}.notice{background:var(--yellow);padding:13px 17px;font:700 13px/1.35 var(--mono);min-height:45px;margin-bottom:32px}.notice.error{background:var(--pink);color:var(--ink)}.notice.success{background:var(--cyan)}.tabs{display:flex;border-top:2px solid var(--ink);border-bottom:1px solid var(--ink);gap:0;overflow-x:auto}.tab{border:0;border-right:1px solid var(--ink);background:#fff;color:var(--ink);padding:14px 24px;text-align:left;white-space:nowrap;font:700 14px var(--mono)}.tab.active{background:var(--ink);color:#fff}.tab:hover:not(.active){background:var(--pink)}.tab span{display:inline-block;margin-left:16px}.panel{padding-top:42px}.hidden{display:none}.section-heading{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:25px}.section-heading h2{font-size:clamp(27px,3vw,42px);line-height:1;margin:0;letter-spacing:-.06em}.section-heading p{font:12px/1.35 var(--mono);max-width:300px;margin:0}.two-column{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(320px,1.2fr);gap:28px;align-items:start}.proposal-list{border-top:1px solid var(--ink)}.proposal{display:block;width:100%;border:0;border-bottom:1px solid var(--ink);text-align:left;background:#fff;padding:20px 15px 20px 0}.proposal.selected{background:var(--pink);padding-left:15px}.proposal:hover{background:#f9d7e0;padding-left:15px}.proposal-type,.mini{font:700 11px/1.4 var(--mono);letter-spacing:.03em;text-transform:uppercase}.proposal-title{display:block;font-size:23px;line-height:1.05;font-weight:700;letter-spacing:-.04em;margin:10px 0}.detail{border:1px solid var(--ink);min-height:300px;padding:28px}.empty-detail{display:flex;align-items:center;justify-content:center;color:#555;font:14px var(--mono);text-align:center}.detail h3{font-size:clamp(26px,3vw,43px);letter-spacing:-.06em;line-height:1;margin:12px 0 18px}.detail-summary{font:14px/1.55 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 0}.delta{margin:20px 0;padding:0;list-style:none}.delta li{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid var(--line);font:12px var(--mono);overflow-wrap:anywhere}.addition{padding:14px;border-left:4px solid var(--cyan);border-bottom:1px solid var(--line);margin:14px 0}.addition h4{font-size:18px;line-height:1.1;margin:0 0 6px}.addition p{margin:4px 0;font-size:13px;line-height:1.35}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:22px}.action{border:1px solid var(--ink);padding:12px 16px;background:var(--ink);color:#fff;font:700 12px var(--mono);text-transform:uppercase}.action:hover:not(:disabled){background:var(--pink);color:var(--ink)}.action.secondary{background:#fff;color:var(--ink)}.action.secondary:hover:not(:disabled){background:var(--pink)}.action:disabled{opacity:.45;cursor:not-allowed}.footnote{font:12px/1.4 var(--mono);color:#555;margin-top:15px}.candidate-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.candidate{border:1px solid var(--ink);padding:23px;min-width:0}.candidate:nth-child(4n+2){border-top:5px solid var(--pink)}.candidate:nth-child(4n+3){border-top:5px solid var(--cyan)}.candidate:nth-child(4n+4){border-top:5px solid var(--yellow)}.candidate h3{font-size:27px;letter-spacing:-.055em;line-height:1.05;margin:12px 0}.candidate p{line-height:1.4}.candidate a{display:inline-block;margin:12px 0 17px;text-decoration:underline;font:700 12px var(--mono)}.candidate a:hover{background:var(--pink)}.candidate-meta{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.tag{display:inline-block;background:#eee;padding:5px 8px;font:11px var(--mono)}.decision-form{border-top:1px solid var(--ink);padding-top:17px;margin-top:18px}.decision-form label{display:block;font:700 12px var(--mono);margin:0 0 7px}.decision-form select,.decision-form textarea{width:100%;border:1px solid var(--ink);background:#fff;color:var(--ink);padding:10px;margin-bottom:14px;border-radius:0}.decision-form textarea{min-height:100px;resize:vertical}.empty{border:1px solid var(--ink);padding:34px;font:14px var(--mono)}.method-note{margin-top:70px;border-top:1px solid var(--cyan);display:flex;gap:28px;justify-content:space-between;padding-top:20px;font:13px var(--mono)}.method-note span{font-weight:700;white-space:nowrap}.method-note p{max-width:650px;margin:0}footer{background:var(--ink);color:#fff;padding:26px clamp(20px,4vw,66px);display:flex;justify-content:space-between;gap:15px;font:11px var(--mono)}@media(max-width:850px){.two-column,.candidate-list{grid-template-columns:1fr}.section-heading{display:block}.section-heading p{margin-top:10px}.detail{min-height:0}}@media(max-width:550px){h1{font-size:clamp(48px,12vw,70px)}.topline,footer{align-items:start;flex-direction:column}.tab{padding:12px}.method-note{display:block}.method-note p{margin-top:10px}}
 .validation-status{display:inline-block;background:var(--yellow);padding:7px 10px;margin:5px 0;font:700 12px var(--mono)}
 .confirmation-panel{border:1px solid var(--ink);background:#fff;padding:16px;margin-top:16px}.confirmation-panel p{font:13px/1.4 var(--mono);margin:0 0 12px}.confirmation-panel label{display:block;font:700 12px var(--mono);margin-bottom:7px}.confirmation-panel textarea{display:block;width:100%;min-height:90px;resize:vertical;border:1px solid var(--ink);border-radius:0;padding:10px;margin-bottom:12px}.confirmation-panel .actions{margin-top:0}
 .tag.suggested{background:var(--pink)}.scope-warning{font:11px/1.4 var(--mono);color:#555;margin:7px 0 12px}
 h1,h2,h3,.proposal-title{font-family:var(--display);font-weight:500}
 .desk-status{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:-16px 0 20px;font:12px var(--mono)}.desk-status button{border:0;border-bottom:1px solid var(--ink);background:transparent;color:var(--ink);padding:6px 0;font:inherit}.desk-status button:hover{background:var(--pink)}
 .review-flow{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--ink);font:12px var(--mono);margin-bottom:24px}.review-flow span{padding:10px 8px 10px 0}.review-flow span:not(:last-child){border-right:1px solid var(--line);padding-left:8px}
 .proposal-stage,.candidate-stage{display:inline-block;background:var(--pink);color:var(--ink);padding:5px 8px;font:11px var(--mono)}.proposal-preview{display:block;font:14px/1.25 var(--sans);margin:6px 0 10px}.publication{border-top:1px solid var(--ink);margin-top:60px;padding-top:18px}.publication h2{font-size:28px;letter-spacing:-.04em;margin:0 0 12px}.publication p{font:13px/1.5 var(--mono);margin:0}.publication a:hover{background:var(--pink)}
 @media(max-width:550px){.review-flow{grid-template-columns:repeat(2,1fr)}.desk-status{align-items:start;flex-direction:column}}
`;

export const reviewJs = `
const q=(selector,root=document)=>root.querySelector(selector);
const state={writeEnabled:false,items:[],selected:null,previews:new Map(),refreshing:false};
const labels={model:'CAMBIO DE CATÁLOGO',leads:'NUEVOS LEADS',decision:'DECISIÓN DE EVIDENCIA'};
function el(tag,cls,text){const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=String(text);return node}
function notice(message,tone=''){const node=q('#notice');node.textContent=message;node.className='notice '+tone}
function safeLink(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}}
async function api(path,options){const response=await fetch(path,{credentials:'same-origin',...options});let body;try{body=await response.json()}catch{throw new Error('Respuesta inesperada del servidor')}if(!response.ok)throw new Error(body.error||'Error de conexión');return body}
function niceError(error){const map={PROPOSAL_NOT_READY:'La propuesta todavía no está lista para integrar.',VALIDATION_NOT_PASSED:'Falta una validación exitosa. No se integró nada.',VALIDATION_ALREADY_RUNNING:'Ya hay una validación en curso.',PROPOSAL_CHANGED:'La propuesta cambió. Recargá el detalle antes de decidir.',DECISION_ALREADY_PENDING:'Ya hay una decisión pendiente; publicala o cerrala antes de crear otra.',RESEARCH_DECISION_REQUIRES_RESEARCH_RESULT:'La opción de investigación solo corresponde a resultados de investigación.',REVIEW_WRITES_DISABLED:'La bandeja está en modo de lectura hasta activar el acceso de escritura.',GITHUB_APP_NOT_CONFIGURED:'Falta configurar la conexión privada con GitHub.',GITHUB_APP_AUTH_FAILED:'No se pudo autenticar la conexión privada con GitHub.'};return map[error.message]||error.message}
function activeTab(name){for(const button of document.querySelectorAll('.tab')){const active=button.dataset.tab===name;button.classList.toggle('active',active);active?button.setAttribute('aria-current','page'):button.removeAttribute('aria-current')}q('#proposals').classList.toggle('hidden',name!=='proposals');q('#candidates').classList.toggle('hidden',name!=='candidates')}
async function loadInbox(){
  const result=await api('/api/inbox');state.items=result.items;q('#proposal-count').textContent=String(result.items.length);
  const list=q('#proposal-list');list.replaceChildren();
  if(!result.items.length){list.append(el('div','empty','No hay propuestas pendientes.'));state.selected=null;q('#proposal-detail').replaceChildren(el('p','','La cola está limpia.'));return}
  for(const item of result.items){
    const button=el('button','proposal');button.type='button';button.dataset.number=String(item.number);
    if(item.number===state.selected)button.classList.add('selected');
    const stage=item.kind==='leads'?'DETECTADO · REVISIÓN PENDIENTE':item.kind==='decision'?'DECISIÓN · PUBLICACIÓN PENDIENTE':'CATÁLOGO · REVISIÓN PENDIENTE';
    button.append(el('span','proposal-stage',stage),el('span','proposal-type',labels[item.kind]||item.kind),el('strong','proposal-title',item.title));
    const preview=el('span','proposal-preview','');
    if(item.kind==='leads'){
      const cacheKey=item.number+':'+item.headSha;
      const cached=state.previews.get(cacheKey);
      if(cached)preview.textContent=cached;
      else api('/api/pulls/'+item.number).then(data=>{
        const titles=data.additions.map(entry=>entry.source_title).filter(Boolean);
        const summary=titles.slice(0,2).join(' · ')+(titles.length>2?' · +'+(titles.length-2)+' más':'');
        state.previews.set(cacheKey,summary||'Abrí el lote para ver los candidatos');
        if(button.isConnected)preview.textContent=state.previews.get(cacheKey);
      }).catch(()=>{if(button.isConnected)preview.textContent='Abrí el lote para ver los candidatos'});
      button.append(preview);
    }
    button.append(el('span','mini','#'+item.number+' · '+item.createdAt.slice(0,10)));
    button.addEventListener('click',()=>selectProposal(item.number));list.append(button);
  }
  if(state.selected&&!result.items.some(item=>item.number===state.selected)){state.selected=null;q('#proposal-detail').replaceChildren(el('p','','La propuesta salió de la cola. Seleccioná otra.'))}
}
function addSourceLink(parent,href,text){const safe=safeLink(href);if(!safe)return;const link=el('a','',text);link.href=safe;link.target='_blank';link.rel='noopener noreferrer';parent.append(link)}
function scopeTags(record){
  const tags=el('div','candidate-meta');
  let associations=0;
  for(const [label,values] of [
    ['PRODUCTO SUGERIDO',record.productIds??record.product_ids],
    ['MODELO SUGERIDO',record.modelIds??record.model_ids],
    ['SUPERFICIE SUGERIDA',record.surfaceIds??record.surface_ids]
  ]){
    for(const value of values??[]){tags.append(el('span','tag suggested',label+' · '+value));associations++}
  }
  if(!associations)tags.append(el('span','tag','SIN PRODUCTO, MODELO NI SUPERFICIE ASOCIADOS'));
  for(const value of (record.probes??record.probe_ids??[]).slice(0,4))tags.append(el('span','tag','PRUEBA · '+value));
  const claimClass=record.claimClass??record.claim_class;
  if(claimClass)tags.append(el('span','tag',claimClass));
  return tags;
}
function scopeWarning(){return el('p','scope-warning','Etiquetas automáticas; no confirman una atribución ni un resultado.')}
function askInPage(host,message,label,onConfirm,needsReason=false){
  host.querySelector('.confirmation-panel')?.remove();
  const form=el('form','confirmation-panel');
  form.append(el('p','',message));
  let reason;
  if(needsReason){const reasonLabel=el('label','','MOTIVO / 20–1200 CARACTERES');reason=el('textarea');reason.required=true;reason.minLength=20;reason.maxLength=1200;reason.placeholder='Explicá por qué se cierra esta propuesta';reasonLabel.append(reason);form.append(reasonLabel)}
  const controls=el('div','actions');
  const proceed=el('button','action',label);proceed.type='submit';
  const cancel=el('button','action secondary','Cancelar');cancel.type='button';cancel.addEventListener('click',()=>form.remove());
  controls.append(proceed,cancel);form.append(controls);
  form.addEventListener('submit',async(event)=>{event.preventDefault();proceed.disabled=true;const succeeded=await onConfirm(reason?.value);if(!succeeded&&form.isConnected)proceed.disabled=false});
  host.append(form);(reason||proceed).focus();
}
async function selectProposal(number){
  state.selected=number;
  for(const node of document.querySelectorAll('.proposal'))node.classList.toggle('selected',Number(node.dataset.number)===number);
  const detail=q('#proposal-detail');
  detail.className='detail';
  detail.replaceChildren(el('p','mini','CARGANDO / #'+number));
  try{
    const data=await api('/api/pulls/'+number);
    detail.replaceChildren();
    detail.append(el('p','mini',labels[data.kind]+' · #'+number),el('h3','',data.title));
    detail.append(el('p','detail-summary',data.body||'Sin explicación adicional.'));
    const fileList=el('ul','delta');
    for(const file of data.files){const row=el('li');row.append(el('span','',file.name),el('span','', '+'+file.additions+' / -'+file.deletions));fileList.append(row)}
    detail.append(fileList);
    if(data.additions.length){
      detail.append(el('p','mini','REGISTROS NUEVOS / '+data.additions.length));
      for(const entry of data.additions.slice(0,20)){
        const card=el('div','addition');
        card.append(el('h4','',entry.source_title||entry.decision||entry.id),el('p','mini',entry.id));
        if(entry.source_excerpt)card.append(el('p','',entry.source_excerpt.slice(0,350)));
        if(entry.reason)card.append(el('p','',entry.reason));
        if(entry.id?.startsWith('evcand-'))card.append(scopeTags(entry),scopeWarning());
        addSourceLink(card,entry.source_url,'ABRIR FUENTE ↗');
        detail.append(card);
      }
      if(data.additions.length>20)detail.append(el('p','footnote','Se muestran los primeros 20 registros; abrí la propuesta para revisar el resto.'));
    }
    const validation=data.validation.state;
    const status=el('p','validation-status',validation==='passed'?'VALIDACIÓN APROBADA':validation==='running'?'VALIDACIÓN EN CURSO':validation==='failed'?'VALIDACIÓN FALLIDA':'VALIDACIÓN PENDIENTE');
    detail.append(status);
    const actions=el('div','actions');
    const validate=el('button','action secondary',validation==='failed'?'Reintentar validación':'Validar propuesta');
    validate.type='button';
    validate.disabled=!state.writeEnabled||validation==='running'||validation==='passed';
    validate.addEventListener('click',async()=>{await act('/api/pulls/'+number+'/validate',{headSha:data.headSha},false)});
    const refresh=el('button','action secondary','Actualizar estado');
    refresh.type='button';
    refresh.addEventListener('click',()=>selectProposal(number));
    const accept=el('button','action',data.kind==='leads'?'Incorporar leads':data.kind==='decision'?'Publicar decisión':'Aprobar cambio');
    accept.type='button';
    accept.disabled=!state.writeEnabled||validation!=='passed';
    accept.addEventListener('click',()=>{
      const what=data.kind==='leads'?'incorporar estos leads (sin aceptarlos como evidencia)':data.kind==='decision'?'publicar esta decisión':'aprobar este cambio de catálogo';
      askInPage(detail,'¿Confirmás '+what+'? La propuesta y su validación deben seguir sin cambios.','Confirmar publicación',()=>act('/api/pulls/'+number+'/merge',{headSha:data.headSha},true));
    });
    const reject=el('button','action secondary','Cerrar propuesta');
    reject.type='button';
    reject.disabled=!state.writeEnabled;
    reject.addEventListener('click',()=>askInPage(detail,'Cerrar #'+number+' dejará registrado el motivo y no incorporará sus cambios.','Confirmar cierre',(reason)=>act('/api/pulls/'+number+'/close',{headSha:data.headSha,reason},true),true));
    actions.append(validate,refresh,accept,reject);
    detail.append(actions);
    addSourceLink(detail,data.url,'VER PROPUESTA ORIGINAL ↗');
    detail.append(el('p','footnote',state.writeEnabled?'Primero validá. Luego se puede integrar si la propuesta no cambió.':'Modo lectura: todavía no se activó la conexión de escritura.'));
  }catch(error){detail.replaceChildren(el('p','','No se pudo abrir: '+niceError(error)));notice(niceError(error),'error')}
}
async function act(path,body,refreshList){
  try{
    notice('Procesando decisión…');
    await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    notice(refreshList?'Decisión registrada. El despliegue sigue el flujo existente.':'Validación iniciada. Actualizá el estado en unos minutos.','success');
    if(refreshList){state.selected=null;await Promise.all([loadInbox(),loadCandidates()]);q('#proposal-detail').replaceChildren(el('p','','Seleccioná una propuesta para ver el detalle.'))}
    else await selectProposal(state.selected);
    return true;
  }catch(error){notice(niceError(error),'error');return false}
}
async function loadCandidates(){
  const result=await api('/api/candidates');
  q('#candidate-count').textContent=String(result.items.length);
  const list=q('#candidate-list');
  list.replaceChildren();
  if(!result.items.length){list.append(el('div','empty','No hay hallazgos incorporados pendientes de decisión.'));return}
  for(const item of result.items){
    const card=el('article','candidate');
    card.append(el('span','candidate-stage','INCORPORADO · DECISIÓN PENDIENTE'),el('p','mini',item.sourceType+' · '+(item.publishedOn||item.discoveredAt.slice(0,10))),el('h3','',item.title),el('p','',item.excerpt.slice(0,440)),scopeTags(item),scopeWarning());
    addSourceLink(card,item.sourceUrl,'ABRIR FUENTE ↗');
    const form=el('form','decision-form');
    const decisionLabel=el('label','','DECISIÓN');
    const select=el('select');
    select.required=true;
    const choices=[
      ['','Elegí una decisión'],
      ...(item.claimClass==='RESEARCH_RESULT'?[['RETAINED_AS_RESEARCH','Conservar solo como investigación']]:[]),
      ['NEEDS_MORE_INFORMATION','Necesita más información'],
      ['REQUIRES_BEHAVIORAL_REPRODUCTION','Requiere reproducción'],
      ['ACCEPTED_AS_SUPPORTING_SOURCE','Aceptar como fuente de apoyo'],
      ['DUPLICATE','Duplicado'],
      ['REJECTED_IRRELEVANT','Irrelevante'],
      ['REJECTED_UNVERIFIABLE','No verificable']
    ];
    for(const [value,label] of choices){const option=el('option','',label);option.value=value;select.append(option)}
    const reasonLabel=el('label','','MOTIVO / 20–1200 CARACTERES');
    const reason=el('textarea');
    reason.required=true;
    reason.minLength=20;
    reason.maxLength=1200;
    reason.placeholder='Qué verificaste, qué falta y cuál es el alcance de la decisión';
    const submit=el('button','action','Crear propuesta de decisión');
    submit.type='submit';
    submit.disabled=!state.writeEnabled;
    form.append(decisionLabel,select,reasonLabel,reason,el('p','footnote','Esto abre una propuesta revisable; todavía no crea evidencia canónica.'),submit);
    form.addEventListener('submit',async(event)=>{
      event.preventDefault();
      try{
        notice('Registrando decisión…');
        await api('/api/candidates/'+item.id+'/decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:select.value,reason:reason.value})});
        notice('Decisión en preparación. Aparecerá en Propuestas cuando termine la validación.','success');
        submit.disabled=true;
        await loadInbox();
      }catch(error){notice(niceError(error),'error')}
    });
    card.append(form);
    list.append(card);
  }
}
async function loadPublication(){
  const panel=q('#publication-status');panel.replaceChildren();
  try{
    const result=await api('/api/publication');
    for(const run of result.deployments){
      const stateText=run.status!=='completed'?'EN CURSO':run.conclusion==='success'?'PUBLICADO':run.conclusion==='failure'?'FALLÓ':'SIN CONFIRMACIÓN';
      const row=el('div','publication-row',run.name+' · '+stateText+' · '+(run.updatedAt?new Date(run.updatedAt).toLocaleString('es-AR'):'sin fecha'));
      addSourceLink(row,run.url,' VER EJECUCIÓN ↗');panel.append(row);
    }
  }catch{panel.textContent='No se pudo consultar el estado de publicación. Las propuestas siguen disponibles.'}
}
function reviewInProgress(){
  return Boolean(document.querySelector('.confirmation-panel'))||
    [...document.querySelectorAll('.decision-form textarea')].some(node=>node.value.trim())||
    Boolean(document.activeElement?.closest?.('.decision-form'));
}
async function refreshDesk(manual=false){
  if(state.refreshing)return;
  if(reviewInProgress()){if(manual)notice('Hay una revisión en curso. Guardá o descartá el texto antes de actualizar.');return}
  state.refreshing=true;
  try{
    await Promise.all([loadInbox(),loadCandidates(),loadPublication()]);
    q('#sync-status').textContent='SINCRONIZADO · '+new Date().toLocaleTimeString('es-AR');
    if(manual)notice('Bandeja actualizada.','success');
    return true;
  }catch(error){q('#sync-status').textContent='SINCRONIZACIÓN FALLIDA';notice('No se pudo actualizar: '+niceError(error),'error');return false}
  finally{state.refreshing=false}
}
document.querySelectorAll('.tab').forEach(button=>button.addEventListener('click',()=>activeTab(button.dataset.tab)));
q('#refresh-desk').addEventListener('click',()=>refreshDesk(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshDesk()});
setInterval(()=>{if(document.visibilityState==='visible')refreshDesk()},90000);
(async()=>{try{const session=await api('/api/session');state.writeEnabled=session.writeEnabled;q('#identity').textContent=session.reviewer+' · '+(session.writeEnabled?'REVIEW ACTIVE':'READ ONLY');if(await refreshDesk())notice(session.writeEnabled?'Bandeja conectada. Revisá cada fuente antes de decidir.':'Vista previa privada: las decisiones todavía están desactivadas.','success')}catch(error){notice('No se pudo abrir la bandeja: '+niceError(error),'error')}})();
`;
