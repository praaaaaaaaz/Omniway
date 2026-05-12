'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

/* ─── Types ──────────────────────────────────────────────────────────────── */
type TS = {
  fontSize?:number; fontFamily?:string; fontWeight?:string; fontStyle?:string
  textDecoration?:string; textAlign?:'left'|'center'|'right'
  color?:string; bg?:string; radius?:number; border?:string
  padding?:string; letterSpacing?:number; lineHeight?:number; textTransform?:string
}
type TextEl  = { id:string; type:'text';   x:number; y:number; w:number; h?:number; text:string; style:TS; ff?:string }
type RectEl  = { id:string; type:'rect';   x:number; y:number; w:number; h:number; style:{bg:string;radius?:number;border?:string} }
type LineEl  = { id:string; type:'line';   x:number; y:number; w:number; h:number; style:{bg:string} }
type ImgEl   = { id:string; type:'img';    x:number; y:number; w:number; h:number; src:string; style:{radius?:number;filter?:string} }
type TableEl = { id:string; type:'table';  x:number; y:number; w:number; headers:string[]; style:{accent:string;thBg:string;thCol:string} }
type TotEl   = { id:string; type:'totaux'; x:number; y:number; w:number; labels:[string,string]; style:{accent:string} }
type El = TextEl|RectEl|LineEl|ImgEl|TableEl|TotEl

type Guide = {axis:'x'|'y';pos:number}
type Ligne = {id:string;designation:string;qte:string;pu:string;tva:number}
type Artisan = {id:string;nom:string;entreprise:string;logo_url:string|null}
type SavedTpl = {id:string;name:string;elems:El[];accent:string}

/* ─── Utils ──────────────────────────────────────────────────────────────── */
const A4W = 794; const SNAP = 6
function uid() { return Math.random().toString(36).slice(2,9) }
const fmt = (n:number) => n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtDate = (s:string) => s ? new Date(s+'T12:00:00').toLocaleDateString('fr-FR') : ''
function calcTotaux(ls:Ligne[]) {
  const byTva:Record<number,number>={};let ht=0
  for(const l of ls){const q=parseFloat(l.qte)||0;const p=parseFloat(l.pu)||0;ht+=q*p;byTva[l.tva]=(byTva[l.tva]||0)+q*p*(l.tva/100)}
  const tva=Object.values(byTva).reduce((s,v)=>s+v,0)
  return {ht,byTva,tva,ttc:ht+tva}
}
function snapEl(els:El[],id:string,nx:number,ny:number,w:number){
  const guides:Guide[]=[]; let x=nx; let y=ny
  for(const e of els){
    if(e.id===id) continue; const eR=e.x+e.w
    if(Math.abs(x-e.x)<SNAP){x=e.x;guides.push({axis:'x',pos:e.x})}
    else if(Math.abs(x-eR)<SNAP){x=eR;guides.push({axis:'x',pos:eR})}
    else if(Math.abs(x+w-e.x)<SNAP){x=e.x-w;guides.push({axis:'x',pos:e.x})}
    else if(Math.abs(x+w-eR)<SNAP){x=eR-w;guides.push({axis:'x',pos:eR})}
    if(Math.abs(y-e.y)<SNAP){y=e.y;guides.push({axis:'y',pos:e.y})}
  }
  return {x:Math.round(x),y:Math.round(y),guides}
}
function tsCSS(ts:TS):React.CSSProperties {
  return {
    fontFamily:ts.fontFamily||'inherit', fontSize:ts.fontSize||11,
    fontWeight:(ts.fontWeight||'normal') as React.CSSProperties['fontWeight'],
    fontStyle:(ts.fontStyle||'normal') as React.CSSProperties['fontStyle'],
    textDecoration:ts.textDecoration||'none',
    textAlign:ts.textAlign||'left', color:ts.color||'inherit',
    background:ts.bg||'transparent', borderRadius:ts.radius,
    border:ts.border, padding:ts.padding||'0',
    letterSpacing:ts.letterSpacing, lineHeight:ts.lineHeight||1.4,
    textTransform:(ts.textTransform||'none') as React.CSSProperties['textTransform'],
    whiteSpace:'pre-wrap', wordBreak:'break-word',
    boxSizing:'border-box', width:'100%', minHeight:16, display:'block', outline:'none',
  }
}

/* ─── Element factories ──────────────────────────────────────────────────── */
const mkT = (id:string,x:number,y:number,w:number,text:string,style:TS={},ff?:string):TextEl => ({id,type:'text',x,y,w,text,style,ff})
const mkR = (id:string,x:number,y:number,w:number,h:number,style:RectEl['style']):RectEl => ({id,type:'rect',x,y,w,h,style})
const mkL = (id:string,x:number,y:number,w:number,h:number,bg:string):LineEl => ({id,type:'line',x,y,w,h,style:{bg}})

/* ─── Font options ───────────────────────────────────────────────────────── */
const FONTS = [
  {label:'Inter',   value:'Inter, system-ui, sans-serif'},
  {label:'Barlow',  value:'Barlow, system-ui, sans-serif'},
  {label:'Poppins', value:'Poppins, system-ui, sans-serif'},
  {label:'Playfair',value:"'Playfair Display', Georgia, serif"},
  {label:'Roboto',  value:'Roboto, system-ui, sans-serif'},
  {label:'Montserrat',value:'Montserrat, system-ui, sans-serif'},
]
const DFONT = 'Inter, system-ui, sans-serif'

/* ─── Templates ──────────────────────────────────────────────────────────── */
const SYSTEM_TPLS = [
  {id:'classic', name:'Classique Pro',  desc:'Sobre, confiance',        accent:'#2563eb', variant:'classic'},
  {id:'dark',    name:'Prestige',       desc:'Sombre, haut de gamme',   accent:'#0f172a', variant:'dark'},
  {id:'sidebar', name:'Latérale',       desc:'Bande couleur gauche',    accent:'#7c3aed', variant:'sidebar'},
  {id:'minimal', name:'Épuré',          desc:'Minimaliste, luxe',       accent:'#111827', variant:'minimal'},
  {id:'bold',    name:'Éclat',          desc:'Couleurs vives, moderne', accent:'#ea580c', variant:'bold'},
]

function initElems(accent:string, variant:string, numero:string, artisan:Artisan|null, rawDate:string):El[] {
  const cn = artisan?.entreprise||''; const cs = artisan?.nom||''
  const isMin = variant==='minimal'; const isDark = variant==='dark'
  const isSidebar = variant==='sidebar'; const isBold = variant==='bold'
  const hasLogo = !!artisan?.logo_url
  const xL = isSidebar ? 162 : 40
  const wFull = isSidebar ? 590 : 714
  const els:El[] = []

  /* ── SIDEBAR strip ── */
  if(isSidebar){
    els.push(mkR('e_sb',0,0,150,1123,{bg:accent}))
    if(hasLogo) els.push({id:'e_logo',type:'img',x:14,y:20,w:60,h:60,src:artisan!.logo_url!,style:{radius:6}} as ImgEl)
    els.push(mkT('e_cn',10,hasLogo?90:26,130,cn,{fontSize:12,fontWeight:'bold',color:'#fff',lineHeight:1.3},'companyName'))
    els.push(mkT('e_cs',10,hasLogo?108:46,130,cs,{fontSize:9,color:'rgba(255,255,255,0.7)'},'companySubtitle'))
    els.push(mkL('e_sb_sep',14,hasLogo?126:63,55,2,'rgba(255,255,255,0.3)'))
    els.push(mkT('e_addr',10,hasLogo?134:72,130,'',{fontSize:8.5,color:'rgba(255,255,255,0.65)'},'companyAddress'))
    els.push(mkT('e_phone',10,hasLogo?160:95,130,'',{fontSize:8.5,color:'rgba(255,255,255,0.65)'},'companyPhone'))
    els.push(mkT('e_email_co',10,hasLogo?174:109,130,'',{fontSize:8.5,color:'rgba(255,255,255,0.65)'},'companyEmail'))
    els.push(mkT('e_siret',10,hasLogo?196:130,130,'',{fontSize:8,color:'rgba(255,255,255,0.4)'},'companySIRET'))
  }

  /* ── DARK header bg ── */
  if(isDark) els.push(mkR('e_hdr_bg',40,20,714,hasLogo?125:110,{bg:accent,radius:10}))
  /* ── MINIMAL top border ── */
  if(isMin)  els.push(mkL('e_top',40,20,714,3,accent))

  /* ── Company info (non-sidebar) ── */
  if(!isSidebar){
    const tc = isDark ? '#fff' : '#111'
    const tcs = isDark ? 'rgba(255,255,255,0.65)' : '#888'
    const tcc = isDark ? 'rgba(255,255,255,0.55)' : '#777'
    const tca = isDark ? 'rgba(255,255,255,0.4)'  : '#aaa'
    const logoY=25; const cnY = hasLogo?75:38
    if(hasLogo) els.push({id:'e_logo',type:'img',x:40,y:logoY,w:42,h:42,src:artisan!.logo_url!,style:{...(isDark?{filter:'brightness(0) invert(1)'}:{})}} as ImgEl)
    els.push(mkT('e_cn',40,cnY,360,cn,{fontSize:isMin?22:isBold?17:14,fontWeight:'bold',color:tc,letterSpacing:isMin?-0.5:0},'companyName'))
    els.push(mkT('e_cs',40,cnY+22,360,cs,{fontSize:10,color:tcs},'companySubtitle'))
    els.push(mkT('e_addr',40,cnY+39,360,'',{fontSize:9,color:tcc},'companyAddress'))
    els.push(mkT('e_phone',40,cnY+53,360,'',{fontSize:9,color:tcc},'companyPhone'))
    els.push(mkT('e_email_co',40,cnY+67,360,'',{fontSize:9,color:tcc},'companyEmail'))
    els.push(mkT('e_siret',40,cnY+81,360,'',{fontSize:8.5,color:tca},'companySIRET'))
  }

  /* ── DEVIS badge ── */
  const bX = isSidebar ? 472 : 560; const bW = 192; const bY = 22; const bH = 50
  const badgeStyle:TS = isDark
    ? {fontSize:isBold?24:20,fontWeight:'bold',color:'#fff',textAlign:'center',bg:'rgba(255,255,255,0.12)',border:'1px solid rgba(255,255,255,0.25)',radius:6,padding:'12px 0',letterSpacing:4}
    : isMin
    ? {fontSize:20,fontWeight:'bold',color:accent,textAlign:'center',border:`2px solid ${accent}`,radius:4,padding:'12px 0',letterSpacing:4}
    : {fontSize:isBold?24:20,fontWeight:'bold',color:'#fff',textAlign:'center',bg:accent,radius:isBold?4:8,padding:'12px 0',letterSpacing:4}
  els.push(mkT('e_badge',bX,bY,bW,'DEVIS',badgeStyle,'badgeText'))

  /* ── Numéro / date / validité (right) ── */
  const ic = isDark?'rgba(255,255,255,0.9)':'#111'; const isc = isDark?'rgba(255,255,255,0.6)':'#888'
  els.push(mkT('e_num',  bX,bY+58,bW,numero,         {fontSize:12,fontWeight:'bold',color:ic, textAlign:'right'},'numero'))
  els.push(mkT('e_date', bX,bY+74,bW,fmtDate(rawDate),{fontSize:10,color:isc,textAlign:'right'}))
  els.push(mkT('e_valid',bX,bY+89,bW,'30 jours',     {fontSize:10,color:isc,textAlign:'right'},'validite'))

  /* ── Divider ── */
  const divY = 148
  els.push(mkL('e_div',xL,divY,wFull,isMin?1:3,isMin?'#e5e7eb':accent))

  /* ── Destinataire ── */
  const clW = isSidebar?280:336; const clY = divY+12
  els.push(mkT('e_cl_lbl', xL,clY,    clW,'DESTINATAIRE',{fontSize:8.5,fontWeight:'bold',color:accent,textTransform:'uppercase',letterSpacing:2}))
  els.push(mkT('e_cl_nom', xL,clY+16, clW,'',{fontSize:12,fontWeight:'bold',color:'#111'},'clientNom'))
  els.push(mkT('e_cl_tel', xL,clY+32, clW,'',{fontSize:10,color:'#555'},'clientTel'))
  els.push(mkT('e_cl_email',xL,clY+46,clW,'',{fontSize:10,color:'#555'},'clientEmail'))
  els.push(mkT('e_cl_adr', xL,clY+60, clW,'',{fontSize:10,color:'#555',lineHeight:1.5},'clientAdresse'))

  /* ── Chantier ── */
  const chX = isSidebar?460:390; const chW = isSidebar?292:364
  els.push(mkT('e_ch_lbl',chX,clY,   chW,'CHANTIER / TRAVAUX',{fontSize:8.5,fontWeight:'bold',color:accent,textTransform:'uppercase',letterSpacing:2}))
  els.push(mkT('e_ch_adr',chX,clY+16,chW,'',{fontSize:11,color:'#333',lineHeight:1.5},'chantierAdresse'))

  /* ── Objet ── */
  const objY = clY+115
  els.push(mkT('e_obj_lbl',xL,      objY,68, 'Objet :',{fontSize:11,fontWeight:'bold',color:accent}))
  els.push(mkT('e_obj',    xL+72,   objY,wFull-72,'',{fontSize:11,color:'#222'},'objet'))

  /* ── Table ── */
  const tblY = objY+30
  els.push({id:'table',type:'table',x:xL,y:tblY,w:wFull,
    headers:['Désignation','Qté','PU HT','TVA','Total HT'],
    style:{accent,thBg:isMin?'#f3f4f6':accent,thCol:isMin?'#374151':'#fff'}
  } as TableEl)

  /* ── Totaux + Conditions ── */
  const totY = tblY+205
  const totX = isSidebar?402:504; const totW = isSidebar?350:250
  const condW = isSidebar?225:446
  els.push({id:'totaux',type:'totaux',x:totX,y:totY,w:totW,labels:['Total HT','TOTAL TTC'],style:{accent}} as TotEl)
  els.push(mkT('e_cond_lbl',xL,totY,   condW,'Conditions de règlement',{fontSize:9.5,fontWeight:'bold',color:accent,textTransform:'uppercase',letterSpacing:1}))
  els.push(mkT('e_cond',    xL,totY+16,condW,'Paiement à 30 jours à réception de facture.\nAcompte de 30% à la commande.',{fontSize:10,color:'#555',lineHeight:1.6},'conditions'))

  /* ── Signature ── */
  const sigY = totY+160
  const sigW = isSidebar?272:330; const sig2X = xL+sigW+24; const sig2W = wFull-sigW-24
  els.push(mkR('e_sig_l_bg', xL,  sigY,sigW,  80,{bg:'transparent',border:`1.5px dashed ${accent}55`,radius:8}))
  els.push(mkR('e_sig_r_bg', sig2X,sigY,sig2W,80,{bg:'transparent',border:`1.5px dashed ${accent}55`,radius:8}))
  els.push(mkT('e_sig_l', xL+8,  sigY+8,sigW-16,  "Bon pour accord\nSignature du client :",  {fontSize:9.5,color:'#aaa'}))
  els.push(mkT('e_sig_r', sig2X+8,sigY+8,sig2W-16,"Cachet et signature\nde l'entreprise :",  {fontSize:9.5,color:'#aaa'}))

  /* ── Footer ── */
  els.push(mkT('e_foot_l',xL,      1072,300,artisan?.entreprise||'',{fontSize:8,color:'#bbb'}))
  els.push(mkT('e_foot_r',xL+300,  1072,wFull-300,'Document non contractuel avant validation',{fontSize:8,color:'#bbb',textAlign:'right'}))

  return els
}

/* ─── Text element renderer ──────────────────────────────────────────────── */
function RenderText({el,isEditing,onSave}:{el:TextEl;isEditing:boolean;onSave:(t:string)=>void}) {
  const r = useRef<HTMLDivElement>(null); const active = useRef(false)
  useEffect(()=>{ if(!active.current&&r.current) r.current.textContent=el.text||'' },[el.text])
  const css = tsCSS(el.style)
  return (
    <div ref={r} contentEditable={isEditing||undefined} suppressContentEditableWarning
      style={{...css,cursor:isEditing?'text':'inherit'}}
      onFocus={()=>{ active.current=true }}
      onBlur={e=>{ active.current=false; if(isEditing) onSave(e.currentTarget.textContent||'') }}
      onMouseDown={e=>{ if(isEditing) e.stopPropagation() }}
      onClick={e=>{ if(isEditing) e.stopPropagation() }} />
  )
}

/* ─── Table renderer ─────────────────────────────────────────────────────── */
function RenderTable({el,lignes,setLignes,isEditing,onHeader}:{el:TableEl;lignes:Ligne[];setLignes:(l:Ligne[])=>void;isEditing:boolean;onHeader:(i:number,v:string)=>void}) {
  const upd=(lid:string,f:keyof Ligne,v:string)=>setLignes(lignes.map(l=>l.id===lid?{...l,[f]:v}:l))
  const cols=[{w:'38%',al:'left'as const},{w:'9%',al:'center'as const},{w:'16%',al:'right'as const},{w:'10%',al:'center'as const},{w:'17%',al:'right'as const}]
  return (
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:10.5}}>
      <thead>
        <tr style={{background:el.style.thBg}}>
          {el.headers.map((h,i)=>(
            <th key={i} style={{padding:'8px 10px',textAlign:cols[i].al,color:el.style.thCol,fontWeight:700,fontSize:9.5,width:cols[i].w}}>
              {isEditing
                ? <div contentEditable suppressContentEditableWarning onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
                    onBlur={e=>onHeader(i,e.currentTarget.textContent||'')} style={{outline:'none',display:'inline-block',minWidth:4}}>{h}</div>
                : h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lignes.map((l,i)=>{
          const q=parseFloat(l.qte)||0; const p=parseFloat(l.pu)||0
          const bg=i%2===0?'#fff':`${el.style.accent}05`
          return (
            <tr key={l.id} style={{background:bg}}>
              <td style={{padding:'7px 10px',borderBottom:'1px solid #f0f0f0',color:'#111'}}>
                {isEditing?<div contentEditable suppressContentEditableWarning onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onBlur={e=>upd(l.id,'designation',e.currentTarget.textContent||'')} style={{outline:'none'}}>{l.designation}</div>:<span>{l.designation||<span style={{color:'#ccc',fontStyle:'italic'}}>Désignation...</span>}</span>}
              </td>
              <td style={{padding:'7px 10px',textAlign:'center',borderBottom:'1px solid #f0f0f0',color:'#111'}}>
                {isEditing?<div contentEditable suppressContentEditableWarning onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onBlur={e=>upd(l.id,'qte',e.currentTarget.textContent||'')} style={{outline:'none',textAlign:'center'}}>{l.qte}</div>:l.qte}
              </td>
              <td style={{padding:'7px 10px',textAlign:'right',borderBottom:'1px solid #f0f0f0',color:'#111'}}>
                {isEditing?<div contentEditable suppressContentEditableWarning onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onBlur={e=>upd(l.id,'pu',e.currentTarget.textContent||'')} style={{outline:'none',textAlign:'right'}}>{l.pu}</div>:(p>0?fmt(p)+' €':'—')}
              </td>
              <td style={{padding:'7px 10px',textAlign:'center',borderBottom:'1px solid #f0f0f0'}}>
                {isEditing
                  ? <select value={l.tva} onChange={e=>upd(l.id,'tva',e.target.value)} onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} style={{fontSize:10,border:'none',background:'transparent',color:'#111'}}>
                      {[0,5.5,10,20].map(t=><option key={t} value={t}>{t}%</option>)}
                    </select>
                  : <span style={{color:'#555'}}>{l.tva}%</span>}
              </td>
              <td style={{padding:'7px 10px',textAlign:'right',fontWeight:700,borderBottom:'1px solid #f0f0f0',color:'#111'}}>
                {q*p>0?fmt(q*p)+' €':'—'}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ─── Totaux renderer ────────────────────────────────────────────────────── */
function RenderTotaux({el,totaux,isEditing,onLabel}:{el:TotEl;totaux:ReturnType<typeof calcTotaux>;isEditing:boolean;onLabel:(i:number,v:string)=>void}) {
  const {ht,byTva,ttc}=totaux; const acc=el.style.accent
  const E=({v,i}:{v:string;i:number})=>isEditing
    ?<div contentEditable suppressContentEditableWarning onMouseDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()} onBlur={e=>onLabel(i,e.currentTarget.textContent||'')} style={{outline:'none',display:'inline'}}>{v}</div>
    :<span>{v}</span>
  return (
    <div style={{border:'1px solid #e5e7eb',borderRadius:8,overflow:'hidden'}}>
      <div style={{display:'flex',justifyContent:'space-between',padding:'7px 14px',borderBottom:'1px solid #f0f0f0'}}>
        <span style={{fontSize:10.5,color:'#6b7280'}}><E v={el.labels[0]} i={0} /></span>
        <span style={{fontWeight:600,fontSize:11,color:'#111'}}>{fmt(ht)} €</span>
      </div>
      {Object.entries(byTva).filter(([,v])=>v>0).sort(([a],[b])=>+a-+b).map(([r,v])=>(
        <div key={r} style={{display:'flex',justifyContent:'space-between',padding:'6px 14px',borderBottom:'1px solid #f0f0f0'}}>
          <span style={{fontSize:10,color:'#9ca3af'}}>TVA {r}%</span>
          <span style={{fontSize:10.5,color:'#555'}}>{fmt(v)} €</span>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 14px',background:acc}}>
        <span style={{fontWeight:800,fontSize:12,color:'#fff',letterSpacing:0.5}}><E v={el.labels[1]} i={1}/></span>
        <span style={{fontWeight:800,fontSize:15,color:'#fff'}}>{fmt(ttc)} €</span>
      </div>
    </div>
  )
}

/* ─── Form helpers ───────────────────────────────────────────────────────── */
const FL=({c}:{c:React.ReactNode})=><label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{c}</label>
const FI=({value,onChange,placeholder,type='text'}:{value:string;onChange:(v:string)=>void;placeholder?:string;type?:string})=>(
  <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400"/>
)
const FTA=({value,onChange,placeholder,rows=2}:{value:string;onChange:(v:string)=>void;placeholder?:string;rows?:number})=>(
  <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400 resize-none"/>
)
const FS=({title,children}:{title:string;children:React.ReactNode})=>(
  <div><div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-2 mt-1">{title}</div><div className="flex flex-col gap-2">{children}</div></div>
)

/* ─── Template preview ───────────────────────────────────────────────────── */
function TplPreview({tpl}:{tpl:typeof SYSTEM_TPLS[0]}) {
  const a=tpl.accent; const v=tpl.variant
  const isSidebar=v==='sidebar'; const isDark=v==='dark'; const isMin=v==='minimal'; const isBold=v==='bold'
  return (
    <div style={{width:'100%',aspectRatio:'0.707',background:'#fff',border:'1px solid #f0f0f0',borderRadius:6,overflow:'hidden',position:'relative'}}>
      {isSidebar&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:'22%',background:a}}/>}
      <div style={{position:'relative',padding:isSidebar?'8% 6% 4% 28%':'8% 8% 4%'}}>
        {isDark&&<div style={{background:a,borderRadius:4,height:'14%',marginBottom:'4%',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 8%'}}>
          <div style={{width:'35%',height:4,background:'rgba(255,255,255,0.5)',borderRadius:2}}/>
          <div style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',borderRadius:3,padding:'2px 6px'}}><div style={{width:20,height:4,background:'rgba(255,255,255,0.7)',borderRadius:1}}/></div>
        </div>}
        {!isDark&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'3%'}}>
          <div>
            {isMin&&<div style={{width:'70%',height:2,background:a,borderRadius:1,marginBottom:4}}/>}
            <div style={{width:isBold?44:38,height:isBold?5:4,background:'#111',borderRadius:1,marginBottom:3}}/>
            <div style={{width:26,height:3,background:'#bbb',borderRadius:1}}/>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{display:'inline-flex',background:isMin?'transparent':a,border:isMin?`1.5px solid ${a}`:'none',borderRadius:3,padding:'2px 6px',marginBottom:3}}>
              <div style={{width:20,height:isBold?5:4,background:isMin?a:'#fff',borderRadius:1}}/>
            </div>
            <div style={{width:22,height:2.5,background:'#ddd',borderRadius:1,marginLeft:'auto',marginBottom:2}}/>
            <div style={{width:18,height:2.5,background:'#ddd',borderRadius:1,marginLeft:'auto'}}/>
          </div>
        </div>}
        <div style={{height:isDark?0:isMin?1:2,background:isMin?'#e5e7eb':a,marginBottom:'3%'}}/>
        <div style={{display:'flex',gap:'4%',marginBottom:'3%'}}>
          {[0,1].map(i=>(
            <div key={i} style={{flex:1,height:'12%',borderLeft:isMin?'none':`2.5px solid ${a}`,border:isMin?'1px solid #e5e7eb':undefined,borderRadius:isMin?3:'0 3px 3px 0',background:isMin?'transparent':`${a}10`,padding:'2%'}}>
              <div style={{width:'50%',height:2.5,background:a,borderRadius:1,marginBottom:3}}/>
              <div style={{width:'75%',height:2,background:'#ccc',borderRadius:1}}/>
            </div>
          ))}
        </div>
        <div style={{height:8,background:isMin?'#f3f4f6':a,borderRadius:'2px 2px 0 0',marginBottom:1}}/>
        {[0,1,2].map(i=><div key={i} style={{height:6,background:i%2===0?'#fff':'#f9f9f9',borderBottom:'1px solid #f0f0f0'}}/>)}
        <div style={{display:'flex',justifyContent:'flex-end',marginTop:'3%'}}>
          <div style={{width:'38%',border:'1px solid #e5e7eb',borderRadius:4,overflow:'hidden'}}>
            <div style={{height:5,borderBottom:'1px solid #f0f0f0'}}/>
            <div style={{height:7,background:a,display:'flex',alignItems:'center',justifyContent:'center'}}>
              <div style={{width:'60%',height:2.5,background:'rgba(255,255,255,0.7)',borderRadius:1}}/>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Template picker ────────────────────────────────────────────────────── */
function TemplatePicker({artisan,onSelect,onSelectSaved}:{artisan:Artisan|null;onSelect:(t:typeof SYSTEM_TPLS[0])=>void;onSelectSaved:(t:SavedTpl)=>void}) {
  const [saved,setSaved]=useState<SavedTpl[]>([])
  const [renaming,setRenaming]=useState<string|null>(null); const [renVal,setRenVal]=useState('')
  useEffect(()=>{
    if(!artisan) return
    supabase.from('devis_templates').select('id,name,elems,accent').eq('artisan_id',artisan.id).order('created_at',{ascending:false})
      .then(({data})=>{ if(data) setSaved(data as SavedTpl[]) })
  },[artisan])
  const del=async(id:string)=>{ await supabase.from('devis_templates').delete().eq('id',id); setSaved(s=>s.filter(t=>t.id!==id)) }
  const rename=async(id:string,name:string)=>{ await supabase.from('devis_templates').update({name}).eq('id',id); setSaved(s=>s.map(t=>t.id===id?{...t,name}:t)); setRenaming(null) }
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <a href="/dashboard" className="text-blue-600 text-sm hover:underline">← Tableau de bord</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Nouveau devis</h1>
        <p className="text-gray-400 text-sm mt-1">Choisissez un modèle</p>
      </div>
      {saved.length>0&&(
        <div className="w-full max-w-3xl mb-8">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Mes templates</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {saved.map(tpl=>(
              <div key={tpl.id} className="bg-white border-2 border-gray-200 hover:border-blue-400 rounded-2xl p-3 transition-all group">
                <div className="h-1.5 rounded-full mb-3" style={{background:tpl.accent}}/>
                {renaming===tpl.id
                  ? <div className="flex gap-1 mb-2">
                      <input autoFocus value={renVal} onChange={e=>setRenVal(e.target.value)}
                        onKeyDown={e=>{if(e.key==='Enter')rename(tpl.id,renVal);if(e.key==='Escape')setRenaming(null)}}
                        className="flex-1 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-gray-900 bg-white focus:outline-none"/>
                      <button onClick={()=>rename(tpl.id,renVal)} className="text-blue-600 text-xs px-1">✓</button>
                    </div>
                  : <div className="font-semibold text-gray-800 text-xs mb-2 cursor-pointer truncate" onClick={()=>onSelectSaved(tpl)}>{tpl.name}</div>
                }
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={()=>onSelectSaved(tpl)} className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 hover:bg-blue-100 font-medium flex-1">Utiliser</button>
                  <button onClick={()=>{setRenaming(tpl.id);setRenVal(tpl.name)}} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 hover:bg-gray-200">✎</button>
                  <button onClick={()=>del(tpl.id)} className="text-[10px] bg-red-50 text-red-400 rounded px-1.5 py-0.5 hover:bg-red-100">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="w-full max-w-3xl">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Modèles</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {SYSTEM_TPLS.map(tpl=>(
            <button key={tpl.id} onClick={()=>onSelect(tpl)}
              className="bg-white border-2 border-gray-200 hover:border-gray-400 rounded-2xl p-3 text-left transition-all hover:shadow-lg hover:-translate-y-0.5">
              <TplPreview tpl={tpl}/>
              <div className="mt-2.5">
                <div className="font-semibold text-gray-800 text-sm">{tpl.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{tpl.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main ───────────────────────────────────────────────────────────────── */
export default function DevisCreator() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale,setScale] = useState(1)
  const [artisan,setArtisan] = useState<Artisan|null>(null)
  const [started,setStarted] = useState(false)
  const [elems,setElems] = useState<El[]>([])
  const [history,setHistory] = useState<El[][]>([])
  const [lignes,setLignes] = useState<Ligne[]>([{id:uid(),designation:'',qte:'1',pu:'',tva:10}])
  const [selected,setSelected] = useState<string|null>(null)
  const [editing,setEditing] = useState<string|null>(null)
  const [guides,setGuides] = useState<Guide[]>([])
  const [rawDate,setRawDate] = useState(new Date().toISOString().split('T')[0])
  const [saving,setSaving]=useState(false); const [saved,setSaved]=useState(false)
  const [aiText,setAiText]=useState(''); const [aiLoading,setAiLoading]=useState(false); const [aiErr,setAiErr]=useState('')
  const [showTplSave,setShowTplSave]=useState(false); const [tplName,setTplName]=useState(''); const [savingTpl,setSavingTpl]=useState(false)
  // Form state (raw values, synced to canvas)
  const [form,setForm] = useState({numero:'',companyName:'',companySubtitle:'',companyAddress:'',companyPhone:'',companyEmail:'',companySIRET:'',clientNom:'',clientTel:'',clientEmail:'',clientAdresse:'',chantierAdresse:'',objet:'',conditions:'Paiement à 30 jours à réception de facture.\nAcompte de 30% à la commande.',validite:'30',badgeText:'DEVIS'})

  const drag = useRef<{id:string;sx:number;sy:number;ox:number;oy:number;moved:boolean}|null>(null)
  const resize = useRef<{id:string;prop:'w'|'h';sx:number;sy:number;ow:number;oh:number}|null>(null)
  const elemsRef = useRef<El[]>([]); elemsRef.current = elems
  const historyRef = useRef<El[][]>([]); historyRef.current = history
  const totaux = calcTotaux(lignes)
  const selEl = elems.find(e=>e.id===selected)

  useEffect(()=>{
    ;(async()=>{
      const {data:{user}} = await supabase.auth.getUser()
      if(!user){router.push('/login');return}
      const {data:a} = await supabase.from('artisans').select('id,nom,entreprise,logo_url').eq('id',user.id).single()
      if(a) setArtisan(a)
    })()
  },[])

  useEffect(()=>{
    const update=()=>{ if(containerRef.current) setScale(Math.min(1,(containerRef.current.clientWidth-48)/A4W)) }
    update(); window.addEventListener('resize',update); return ()=>window.removeEventListener('resize',update)
  },[started])

  const undo = useCallback(()=>{
    const h=historyRef.current; if(!h.length) return
    setHistory(h.slice(0,-1)); setElems(h[h.length-1])
  },[])

  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{
      if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){
        if((document.activeElement as HTMLElement)?.isContentEditable) return
        e.preventDefault(); undo()
      }
      if(e.key==='Escape'){setEditing(null);setSelected(null)}
    }
    window.addEventListener('keydown',fn); return ()=>window.removeEventListener('keydown',fn)
  },[undo])

  const pushHistory = useCallback(()=>setHistory(h=>[...h.slice(-30),elemsRef.current]),[])
  const commit = useCallback((ne:El[])=>{setHistory(h=>[...h.slice(-30),elemsRef.current]);setElems(ne)},[])

  /* Sync form field to canvas elements */
  const setField = useCallback((field:string, val:string)=>{
    setForm(f=>({...f,[field]:val}))
    const display = field==='validite' ? val+' jours' : field==='badgeText' ? val.toUpperCase() : val
    setElems(prev=>prev.map(e=>e.type==='text'&&(e as TextEl).ff===field?{...e,text:display}:e))
    if(field==='rawDate') setRawDate(val)
  },[])

  const setDateField = useCallback((rawD:string)=>{
    setRawDate(rawD)
    setElems(prev=>prev.map(e=>e.id==='e_date'?{...e as TextEl,text:fmtDate(rawD)}:e))
  },[])

  const applyAi = async () => {
    if(!aiText.trim()) return
    setAiLoading(true); setAiErr('')
    try {
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch('/api/ai/parse-devis', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:aiText,today})})
      const data = await res.json()
      if(data.error) { setAiErr('Erreur IA'); return }
      if(data.clientNom)     setField('clientNom',    data.clientNom)
      if(data.clientAdresse) setField('clientAdresse', data.clientAdresse)
      if(data.chantierAdresse) setField('chantierAdresse', data.chantierAdresse)
      if(data.objet)         setField('objet',         data.objet)
      if(data.date)          setDateField(data.date)
      if(data.lignes?.length) {
        setLignes(data.lignes.map((l:{designation:string;qte:string;pu:string;tva:number})=>({
          id:uid(), designation:l.designation||'', qte:l.qte||'1', pu:l.pu||'', tva:l.tva||10
        })))
      }
      setAiText('')
    } catch { setAiErr('Erreur réseau') }
    finally { setAiLoading(false) }
  }

  /* Pointer handlers */
  const onElPD=(id:string)=>(e:React.PointerEvent)=>{
    if(editing===id) return
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
    const el=elemsRef.current.find(x=>x.id===id)!
    drag.current={id,sx:e.clientX,sy:e.clientY,ox:el.x,oy:el.y,moved:false}
    setSelected(id); setEditing(null)
  }
  const onCanvasPM=(e:React.PointerEvent)=>{
    if(resize.current){
      const r=resize.current
      if(r.prop==='w'){const nw=Math.max(20,r.ow+(e.clientX-r.sx)/scale);setElems(prev=>prev.map(el=>el.id===r.id?{...el,w:Math.round(nw)}:el))}
      else{const nh=Math.max(10,r.oh+(e.clientY-r.sy)/scale);setElems(prev=>prev.map(el=>el.id===r.id?{...el,h:Math.round(nh)} as TextEl:el))}
      return
    }
    if(!drag.current) return
    const dx=(e.clientX-drag.current.sx)/scale; const dy=(e.clientY-drag.current.sy)/scale
    if(!drag.current.moved&&Math.abs(dx)<2&&Math.abs(dy)<2) return
    drag.current.moved=true
    const b=elemsRef.current.find(x=>x.id===drag.current!.id)!
    const {x,y,guides:g}=snapEl(elemsRef.current,drag.current.id,drag.current.ox+dx,drag.current.oy+dy,b.w)
    setGuides(g); setElems(prev=>prev.map(el=>el.id===drag.current!.id?{...el,x,y}:el))
  }
  const onCanvasPU=()=>{
    if(resize.current){pushHistory();resize.current=null;return}
    if(drag.current?.moved) pushHistory(); drag.current=null; setGuides([])
  }
  const onElDbl=(id:string)=>(e:React.MouseEvent)=>{ e.stopPropagation(); setEditing(id); setSelected(id) }
  const onCanvasClick=(e:React.MouseEvent)=>{ if((e.target as HTMLElement).closest('[data-el]')) return; setSelected(null);setEditing(null) }

  const updEl=(id:string,patch:Partial<El>)=>setElems(prev=>prev.map(e=>e.id===id?({...e,...patch} as El):e))
  const updStyle=(id:string,patch:Partial<TS>)=>commit(elems.map(e=>e.id===id&&e.type==='text'?{...e,style:{...(e as TextEl).style,...patch}}:e))
  const accent = (elems.find(e=>e.type==='table') as TableEl|undefined)?.style.accent || '#2563eb'

  const saveDevis=async()=>{
    if(!artisan) return; setSaving(true)
    await supabase.from('devis_docs').insert({
      artisan_id:artisan.id, numero:form.numero||'DEV-001',
      template:'canvas', objet:form.objet||'',
      client_nom:form.clientNom||'', client_email:form.clientEmail||'',
      client_adresse:form.clientAdresse||'', chantier_adresse:form.chantierAdresse||'',
      lignes, conditions:form.conditions||'',
      validite_jours:parseInt(form.validite||'30'),
    })
    setSaving(false);setSaved(true);setTimeout(()=>setSaved(false),3000)
  }

  const saveTemplate=async()=>{
    if(!artisan||!tplName.trim()) return; setSavingTpl(true)
    await supabase.from('devis_templates').insert({artisan_id:artisan.id,name:tplName.trim(),elems:elemsRef.current,accent})
    setSavingTpl(false);setShowTplSave(false);setTplName('')
  }

  const handleSelect=(t:typeof SYSTEM_TPLS[0])=>{
    const numero='DEV-2026-'+String(Date.now()).slice(-3)
    const today=new Date().toISOString().split('T')[0]
    setRawDate(today)
    setForm(f=>({...f,numero,companyName:artisan?.entreprise||'',companySubtitle:artisan?.nom||''}))
    setElems(initElems(t.accent,t.variant,numero,artisan,today))
    setHistory([]); setStarted(true)
  }
  const handleSelectSaved=(t:SavedTpl)=>{
    const numero='DEV-2026-'+String(Date.now()).slice(-3)
    const today=new Date().toISOString().split('T')[0]
    setRawDate(today)
    setElems((t.elems as El[]).map(e=>e.id==='e_num'?{...e as TextEl,text:numero}:e.id==='e_date'?{...e as TextEl,text:fmtDate(today)}:e))
    setHistory([]); setStarted(true)
  }

  if(!started) return <TemplatePicker artisan={artisan} onSelect={handleSelect} onSelectSaved={handleSelectSaved}/>

  /* ─── Render ── */
  const textSel = selEl?.type==='text' ? selEl as TextEl : null
  const fv=(ff:string)=>form[ff as keyof typeof form]||''

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700&family=Barlow:ital,wght@0,400;0,700;1,400&family=Poppins:wght@400;700&family=Montserrat:wght@400;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Roboto:wght@400;700&family=Lato:wght@400;700&display=swap');
        [contenteditable]:focus{outline:1.5px solid rgba(37,99,235,0.4)!important;border-radius:3px;background:rgba(37,99,235,0.04);}
        [contenteditable]:empty::before{content:attr(data-ph);color:#c0bfbf;font-style:italic;pointer-events:none;}
        @media print{body>*{display:none!important;}#pz{display:block!important;position:fixed;inset:0;background:white;z-index:9999;}@page{size:A4;margin:0;}}
      `}</style>

      {/* Print zone */}
      <div id="pz" style={{display:'none'}}>
        <div style={{width:A4W,minHeight:1123,background:'#fff',position:'relative',fontFamily:DFONT}}>
          {elems.map(e=>(
            <div key={e.id} style={{position:'absolute',left:e.x,top:e.y,width:e.w,...('h' in e&&e.h?{height:e.h}:{})}}>
              {e.type==='text'&&<RenderText el={e as TextEl} isEditing={false} onSave={()=>{}}/>}
              {e.type==='rect'&&<div style={{width:'100%',height:'100%',background:(e as RectEl).style.bg,borderRadius:(e as RectEl).style.radius,border:(e as RectEl).style.border}}/>}
              {e.type==='line'&&<div style={{width:'100%',height:e.h,background:(e as LineEl).style.bg}}/>}
              {e.type==='img'&&<img src={(e as ImgEl).src} alt="" style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:(e as ImgEl).style.radius}}/>}
              {e.type==='table'&&<RenderTable el={e as TableEl} lignes={lignes} setLignes={setLignes} isEditing={false} onHeader={()=>{}}/>}
              {e.type==='totaux'&&<RenderTotaux el={e as TotEl} totaux={totaux} isEditing={false} onLabel={()=>{}}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Save template modal */}
      {showTplSave&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setShowTplSave(false)}>
          <div className="rounded-2xl p-6 w-80 shadow-2xl" style={{background:'#fff'}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:'#111827',fontWeight:700,fontSize:16,marginBottom:4}}>Enregistrer ce template</h3>
            <p style={{color:'#6b7280',fontSize:12,marginBottom:16}}>Disponible pour vos prochains devis.</p>
            <input autoFocus value={tplName} onChange={e=>setTplName(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter')saveTemplate()}}
              placeholder="Nom du template..."
              style={{width:'100%',border:'1px solid #d1d5db',borderRadius:12,padding:'10px 14px',fontSize:14,color:'#111827',background:'#f9fafb',outline:'none',boxSizing:'border-box',marginBottom:16}}/>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setShowTplSave(false)} style={{flex:1,border:'1px solid #e5e7eb',borderRadius:12,padding:'10px',fontSize:14,color:'#6b7280',background:'#fff',cursor:'pointer'}}>Annuler</button>
              <button onClick={saveTemplate} disabled={!tplName.trim()||savingTpl}
                style={{flex:1,background:accent,color:'#fff',borderRadius:12,padding:'10px',fontSize:14,fontWeight:600,border:'none',cursor:tplName.trim()?'pointer':'default',opacity:!tplName.trim()||savingTpl?0.4:1}}>
                {savingTpl?'...':'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-100 flex flex-col select-none">

        {/* ── Top header bar ── */}
        <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-2 sticky top-0 z-20 shadow-sm">
          <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">←</a>
          <button onClick={()=>{setStarted(false);setElems([]);setHistory([])}} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-50">Modèles</button>
          <button onClick={undo} disabled={history.length===0} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Ctrl+Z">↩ Annuler</button>
          <span className="flex-1 text-xs text-gray-400 text-center hidden sm:block">
            {editing?'✏️ Double-clic sur un texte pour éditer — Échap pour quitter':selected?'Cliquez et glissez pour déplacer · Double-clic pour éditer':'Cliquez sur n\'importe quel élément pour le sélectionner'}
          </span>
          <button onClick={()=>setShowTplSave(true)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 font-medium">💾 Sauver template</button>
          <button onClick={saveDevis} disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${saved?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
            {saved?'✓':saving?'...':'Sauvegarder'}
          </button>
          <button onClick={()=>window.print()} className="text-white px-3 py-1.5 rounded-lg text-sm font-semibold" style={{background:accent}}>PDF</button>
        </header>


        <div className="flex flex-1 overflow-hidden">
          {/* ── Form panel ── */}
          <aside className="w-72 bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0 text-sm">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">{textSel?'Style du texte':'Formulaire'}</span>
                {!textSel&&<span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">sync auto</span>}
                {textSel&&<span className="text-[10px] text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full">élément sélectionné</span>}
              </div>

              {/* ── Style panel (replaces floating toolbar) ── */}
              {textSel&&(
                <div className="flex flex-col gap-2">
                  <select value={textSel.style.fontFamily||DFONT} onChange={e=>updStyle(textSel.id,{fontFamily:e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400"
                    style={{fontFamily:textSel.style.fontFamily||DFONT}}>
                    {FONTS.map(f=><option key={f.value} value={f.value} style={{fontFamily:f.value}}>{f.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1 flex-wrap">
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button onClick={()=>updStyle(textSel.id,{fontSize:Math.max(6,(textSel.style.fontSize||11)-1)})} style={{width:24,height:26,border:'none',background:'#fff',cursor:'pointer',fontSize:15,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
                      <input type="number" min={6} max={72} value={textSel.style.fontSize||11} onChange={e=>updStyle(textSel.id,{fontSize:+e.target.value})} style={{width:32,height:26,border:'none',borderLeft:'1px solid #e5e7eb',borderRight:'1px solid #e5e7eb',textAlign:'center',fontSize:11,color:'#111',outline:'none'}}/>
                      <button onClick={()=>updStyle(textSel.id,{fontSize:Math.min(72,(textSel.style.fontSize||11)+1)})} style={{width:24,height:26,border:'none',background:'#fff',cursor:'pointer',fontSize:15,color:'#374151',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
                    </div>
                    <div style={{width:1,height:20,background:'#e5e7eb',flexShrink:0}}/>
                    {([['fontWeight','bold','B',{fontWeight:800,fontSize:13}],['fontStyle','italic','I',{fontStyle:'italic' as const,fontSize:13}],['textDecoration','underline','U',{textDecoration:'underline',fontSize:13}]] as [keyof TS,string,string,React.CSSProperties][]).map(([prop,val,label,labelStyle])=>{
                      const active=(textSel.style[prop]===val)
                      return <button key={prop} onClick={()=>updStyle(textSel.id,{[prop]:active?undefined:val})} style={{width:26,height:26,borderRadius:6,border:'1px solid',borderColor:active?'#d1d5db':'transparent',background:active?'#f3f4f6':'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><span style={labelStyle}>{label}</span></button>
                    })}
                    <div style={{width:1,height:20,background:'#e5e7eb',flexShrink:0}}/>
                    {(['left','center','right'] as const).map((al,i)=>{
                      const active=(textSel.style.textAlign||'left')===al
                      return <button key={al} onClick={()=>updStyle(textSel.id,{textAlign:al})} style={{width:26,height:26,borderRadius:6,border:'1px solid',borderColor:active?'#d1d5db':'transparent',background:active?'#f3f4f6':'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <svg width="12" height="10" viewBox="0 0 14 11" fill="#374151">
                          {i===0&&<><rect x="0" y="0" width="14" height="2" rx="1"/><rect x="0" y="4.5" width="10" height="2" rx="1"/><rect x="0" y="9" width="12" height="2" rx="1"/></>}
                          {i===1&&<><rect x="0" y="0" width="14" height="2" rx="1"/><rect x="2" y="4.5" width="10" height="2" rx="1"/><rect x="1" y="9" width="12" height="2" rx="1"/></>}
                          {i===2&&<><rect x="0" y="0" width="14" height="2" rx="1"/><rect x="4" y="4.5" width="10" height="2" rx="1"/><rect x="2" y="9" width="12" height="2" rx="1"/></>}
                        </svg>
                      </button>
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <div style={{position:'relative',width:26,height:26,flexShrink:0}}>
                      <input type="color" value={textSel.style.color||'#111111'} onChange={e=>updStyle(textSel.id,{color:e.target.value})} style={{position:'absolute',inset:0,opacity:0,width:'100%',height:'100%',cursor:'pointer',border:'none',padding:0}}/>
                      <div style={{width:26,height:26,borderRadius:6,border:'1px solid #e5e7eb',pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:1}}>
                        <span style={{fontWeight:700,fontSize:12,color:textSel.style.color||'#111',lineHeight:1}}>A</span>
                        <div style={{width:14,height:2.5,borderRadius:1,background:textSel.style.color||'#111'}}/>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400">L</span>
                    <input type="number" min={20} value={Math.round(textSel.w)} onChange={e=>commit(elems.map(el=>el.id===textSel.id?{...el,w:Math.max(20,+e.target.value)}:el))} className="w-14 border border-gray-200 rounded-lg px-1 py-1 text-xs text-gray-900 text-center bg-white focus:outline-none"/>
                    <button onClick={()=>{commit(elems.filter(e=>e.id!==selected));setSelected(null)}} className="ml-auto text-xs text-red-400 border border-red-100 rounded-lg px-2 py-1 bg-white hover:bg-red-50 whitespace-nowrap">✕ Suppr.</button>
                  </div>
                  <button onClick={()=>setSelected(null)} className="text-[10px] text-gray-400 hover:text-gray-600 text-left">← Retour au formulaire</button>
                </div>
              )}

              {!textSel&&<>
              {/* ── AI input ── */}
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 flex flex-col gap-2">
                <div className="flex items-center gap-1.5">
                  <span style={{fontSize:14}}>✨</span>
                  <span className="text-[11px] font-bold text-violet-700 uppercase tracking-wider">Remplissage IA</span>
                </div>
                <textarea
                  value={aiText}
                  onChange={e=>setAiText(e.target.value)}
                  placeholder={'Décris le devis en quelques mots...\nEx: devis pour M. Bertrand au 5 rue du 11 novembre à Suèvres pour refaire sa cuisine de 8m2 pour 500€ à notre date'}
                  rows={3}
                  onKeyDown={e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();applyAi()}}}
                  className="w-full border border-violet-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-violet-400 resize-none"/>
                {aiErr&&<div className="text-[10px] text-red-500">{aiErr}</div>}
                <button onClick={applyAi} disabled={!aiText.trim()||aiLoading}
                  className="w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-all disabled:opacity-40"
                  style={{background:'#7c3aed'}}>
                  {aiLoading?'Analyse en cours...':'Remplir automatiquement'}
                </button>
              </div>

              <FS title="Devis">
                <div><FL c="Numéro"/><FI value={fv('numero')} onChange={v=>setField('numero',v)} placeholder="DEV-2026-001"/></div>
                <div><FL c="Date"/><FI type="date" value={rawDate} onChange={v=>setDateField(v)}/></div>
                <div><FL c="Validité (jours)"/><FI type="number" value={fv('validite')} onChange={v=>setField('validite',v)}/></div>
                <div>
                  <FL c="Couleur accent"/>
                  <div className="flex items-center gap-2">
                    <input type="color" value={accent} onChange={e=>{
                      const na=e.target.value
                      setElems(prev=>prev.map(el=>{
                        if(el.type==='table') return {...el,style:{...el.style,accent:na,thBg:(el as TableEl).style.thBg===(el as TableEl).style.accent?na:(el as TableEl).style.thBg}}
                        if(el.type==='totaux') return {...el,style:{...el.style,accent:na}}
                        if(el.type==='rect'&&(el as RectEl).style.bg===accent) return {...el,style:{...(el as RectEl).style,bg:na}}
                        if(el.type==='line'&&(el as LineEl).style.bg===accent) return {...el,style:{bg:na}}
                        if(el.type==='text'){
                          const te=el as TextEl
                          const ns={...te.style}
                          if(ns.bg===accent) ns.bg=na
                          if(ns.color===accent) ns.color=na
                          if(ns.border?.includes(accent)) ns.border=ns.border.replaceAll(accent,na)
                          return {...te,style:ns}
                        }
                        return el
                      }))
                    }} className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5"/>
                    <div className="flex gap-1 ml-auto">
                      {['#2563eb','#0f172a','#7c3aed','#111827','#ea580c'].map(col=>(
                        <button key={col} onClick={()=>{
                          const na=col
                          setElems(prev=>prev.map(el=>{
                            if(el.type==='table') return {...el,style:{...el.style,accent:na}}
                            if(el.type==='totaux') return {...el,style:{...el.style,accent:na}}
                            return el
                          }))
                        }} style={{background:col}} className="w-4 h-4 rounded-full border border-white shadow hover:scale-110 transition-transform"/>
                      ))}
                    </div>
                  </div>
                </div>
              </FS>

              <FS title="Mon entreprise">
                <div><FL c="Nom / Société"/><FI value={fv('companyName')} onChange={v=>setField('companyName',v)} placeholder={artisan?.entreprise||'Nom entreprise'}/></div>
                <div><FL c="Gérant / Métier"/><FI value={fv('companySubtitle')} onChange={v=>setField('companySubtitle',v)} placeholder={artisan?.nom||''}/></div>
                <div><FL c="Adresse"/><FTA value={fv('companyAddress')} onChange={v=>setField('companyAddress',v)} placeholder="12 rue des Artisans&#10;75000 Paris" rows={2}/></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><FL c="Téléphone"/><FI value={fv('companyPhone')} onChange={v=>setField('companyPhone',v)} placeholder="06 …"/></div>
                  <div><FL c="Email"/><FI value={fv('companyEmail')} onChange={v=>setField('companyEmail',v)} placeholder="email@…"/></div>
                </div>
                <div><FL c="SIRET"/><FI value={fv('companySIRET')} onChange={v=>setField('companySIRET',v)} placeholder="000 000 000 00000"/></div>
              </FS>

              <FS title="Client">
                <div><FL c="Nom / Société"/><FI value={fv('clientNom')} onChange={v=>setField('clientNom',v)} placeholder="Jean Dupont"/></div>
                <div><FL c="Téléphone"/><FI value={fv('clientTel')} onChange={v=>setField('clientTel',v)} placeholder="06 00 00 00 00"/></div>
                <div><FL c="Email"/><FI type="email" value={fv('clientEmail')} onChange={v=>setField('clientEmail',v)} placeholder="client@email.fr"/></div>
                <div><FL c="Adresse"/><FTA value={fv('clientAdresse')} onChange={v=>setField('clientAdresse',v)} placeholder="12 rue des Lilas&#10;75000 Paris" rows={3}/></div>
              </FS>

              <FS title="Chantier">
                <FTA value={fv('chantierAdresse')} onChange={v=>setField('chantierAdresse',v)} placeholder="Adresse du chantier..." rows={3}/>
              </FS>

              <FS title="Objet">
                <FTA value={fv('objet')} onChange={v=>setField('objet',v)} placeholder="Rénovation salle de bain..." rows={2}/>
              </FS>

              <FS title="Prestations">
                {lignes.map((l,i)=>(
                  <div key={l.id} className="border border-gray-200 rounded-xl p-2.5 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-semibold text-gray-400">Ligne {i+1}</span>
                      <button onClick={()=>{if(lignes.length>1){pushHistory();setLignes(lignes.filter(x=>x.id!==l.id))}}} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="mb-1.5"><FI value={l.designation} onChange={v=>setLignes(lignes.map(x=>x.id===l.id?{...x,designation:v}:x))} placeholder="Fourniture et pose..."/></div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div><FL c="Qté"/><input type="number" value={l.qte} onChange={e=>setLignes(lignes.map(x=>x.id===l.id?{...x,qte:e.target.value}:x))} className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-gray-900 bg-white focus:outline-none"/></div>
                      <div><FL c="PU HT €"/><input type="number" value={l.pu} onChange={e=>setLignes(lignes.map(x=>x.id===l.id?{...x,pu:e.target.value}:x))} className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-gray-900 bg-white focus:outline-none"/></div>
                      <div><FL c="TVA"/><select value={l.tva} onChange={e=>setLignes(lignes.map(x=>x.id===l.id?{...x,tva:+e.target.value}:x))} className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-gray-900 bg-white">{[0,5.5,10,20].map(t=><option key={t} value={t}>{t}%</option>)}</select></div>
                    </div>
                  </div>
                ))}
                <button onClick={()=>setLignes(l=>[...l,{id:uid(),designation:'',qte:'1',pu:'',tva:10}])} className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl py-2 text-xs text-gray-400 hover:text-blue-500 transition-all w-full">+ Ajouter une ligne</button>
                {totaux.ttc>0&&(
                  <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Total HT</span><span className="font-medium">{fmt(totaux.ht)} €</span></div>
                    {Object.entries(totaux.byTva).filter(([,v])=>v>0).map(([r,v])=>(
                      <div key={r} className="flex justify-between text-xs text-gray-400"><span>TVA {r}%</span><span>{fmt(v)} €</span></div>
                    ))}
                    <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                      <span>Total TTC</span><span style={{color:accent}}>{fmt(totaux.ttc)} €</span>
                    </div>
                  </div>
                )}
              </FS>

              <FS title="Conditions">
                <FTA value={fv('conditions')} onChange={v=>setField('conditions',v)} placeholder="Paiement à 30 jours..." rows={3}/>
              </FS>
              </>}
            </div>
          </aside>

          {/* ── Canvas ── */}
          <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-400 p-6 flex flex-col items-center"
            onPointerMove={onCanvasPM} onPointerUp={onCanvasPU} onClick={onCanvasClick}>
            <div style={{width:A4W*scale,height:1123*scale,position:'relative',flexShrink:0,boxShadow:'0 12px 48px rgba(0,0,0,0.35)'}}>
              <div style={{width:A4W,height:1123,background:'#fff',transformOrigin:'top left',transform:`scale(${scale})`,position:'absolute',fontFamily:DFONT}}>

                {/* Snap guides */}
                {guides.map((g,i)=>(
                  g.axis==='x'
                    ?<div key={i} style={{position:'absolute',left:g.pos,top:0,width:1,height:'100%',background:'#2563eb',pointerEvents:'none',zIndex:200}}/>
                    :<div key={i} style={{position:'absolute',top:g.pos,left:0,height:1,width:'100%',background:'#2563eb',pointerEvents:'none',zIndex:200}}/>
                ))}

                {/* Elements */}
                {elems.map(e=>{
                  const isSel = selected===e.id
                  const isEdit = editing===e.id
                  const isLocked = e.id==='e_sb' // sidebar bg not selectable
                  return (
                    <div key={e.id} data-el="1"
                      style={{
                        position:'absolute',left:e.x,top:e.y,width:e.w,
                        ...('h' in e&&e.h?{height:e.h}:{}),
                        cursor:isLocked?'default':isEdit?'text':'move',
                        outline:!isLocked&&isSel?'2px solid #2563eb':'none',
                        outlineOffset:2,
                        zIndex:isLocked?0:isSel?10:1,
                        userSelect:'none',
                      }}
                      onPointerDown={isLocked?undefined:onElPD(e.id)}
                      onDoubleClick={isLocked?undefined:onElDbl(e.id)}>

                      {/* Hover label */}
                      {!isLocked&&!isSel&&e.type==='text'&&(
                        <div className="bh" style={{position:'absolute',top:-16,left:0,fontSize:9,color:'#2563eb',opacity:0,pointerEvents:'none',whiteSpace:'nowrap',background:'#eff6ff',padding:'1px 5px',borderRadius:3}}>
                          Double-clic pour éditer
                        </div>
                      )}

                      {/* Element render */}
                      {e.type==='text'&&<RenderText el={e as TextEl} isEditing={isEdit} onSave={t=>{updEl(e.id,{text:t})}}/>}
                      {e.type==='rect'&&<div style={{width:'100%',height:'100%',background:(e as RectEl).style.bg,borderRadius:(e as RectEl).style.radius,border:(e as RectEl).style.border}}/>}
                      {e.type==='line'&&<div style={{width:'100%',height:e.h,background:(e as LineEl).style.bg,borderRadius:2}}/>}
                      {e.type==='img'&&<img src={(e as ImgEl).src} alt="" style={{width:'100%',height:'100%',objectFit:'contain',borderRadius:(e as ImgEl).style.radius,display:'block'}}/>}
                      {e.type==='table'&&(
                        <RenderTable el={e as TableEl} lignes={lignes}
                          setLignes={l=>{pushHistory();setLignes(l)}}
                          isEditing={isEdit}
                          onHeader={(i,v)=>updEl(e.id,{headers:(e as TableEl).headers.map((h,hi)=>hi===i?v:h)})}/>
                      )}
                      {e.type==='totaux'&&(
                        <RenderTotaux el={e as TotEl} totaux={totaux} isEditing={isEdit}
                          onLabel={(i,v)=>updEl(e.id,{labels:(e as TotEl).labels.map((l,li)=>li===i?v:l) as [string,string]})}/>
                      )}

                      {/* Resize handles */}
                      {isSel&&!isLocked&&(
                        <>
                          <div title="Largeur" style={{position:'absolute',right:-6,top:'50%',transform:'translateY(-50%)',width:12,height:24,background:'#2563eb',borderRadius:4,cursor:'ew-resize',zIndex:30,touchAction:'none'}}
                            onPointerDown={ev=>{ev.stopPropagation();ev.currentTarget.setPointerCapture(ev.pointerId);resize.current={id:e.id,prop:'w',sx:ev.clientX,sy:ev.clientY,ow:e.w,oh:('h' in e?e.h:80)||80}}}/>
                          {'h' in e&&e.type!=='line'&&(
                            <div title="Hauteur" style={{position:'absolute',bottom:-6,left:'50%',transform:'translateX(-50%)',width:24,height:12,background:'#2563eb',borderRadius:4,cursor:'ns-resize',zIndex:30,touchAction:'none'}}
                              onPointerDown={ev=>{ev.stopPropagation();ev.currentTarget.setPointerCapture(ev.pointerId);resize.current={id:e.id,prop:'h',sx:ev.clientX,sy:ev.clientY,ow:e.w,oh:(e as {h:number}).h||80}}}/>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
