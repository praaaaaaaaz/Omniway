'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

/* ─── Types ─────────────────────────────────────────────────────────────────── */
type Ligne = { id: string; designation: string; qte: string; pu: string; tva: number }
type Artisan = { id: string; nom: string; entreprise: string; logo_url: string | null }
type Block = {
  id: string
  type: 'header' | 'divider' | 'client' | 'chantier' | 'objet' | 'table' | 'totaux' | 'conditions' | 'signature' | 'footer' | 'sidebar'
  x: number; y: number; w: number; h?: number
  content: Record<string, string>
  style: { accent?: string; bg?: string; fontSize?: number; color?: string; variant?: string; textAlign?: string }
}
type Guide = { axis: 'x' | 'y'; pos: number }
type SavedTemplate = { id: string; name: string; blocks: Block[]; accent: string }

/* ─── Utils ──────────────────────────────────────────────────────────────────── */
const A4W = 794; const SNAP = 6
function uid() { return Math.random().toString(36).slice(2, 9) }
const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (s: string) => s ? new Date(s + 'T12:00:00').toLocaleDateString('fr-FR') : ''

function calcTotaux(ls: Ligne[]) {
  const byTva: Record<number, number> = {}; let ht = 0
  for (const l of ls) {
    const q = parseFloat(l.qte) || 0; const p = parseFloat(l.pu) || 0
    ht += q * p; byTva[l.tva] = (byTva[l.tva] || 0) + q * p * (l.tva / 100)
  }
  const tva = Object.values(byTva).reduce((s, v) => s + v, 0)
  return { ht, byTva, tva, ttc: ht + tva }
}

function snapBlock(blocks: Block[], id: string, nx: number, ny: number, w: number) {
  const guides: Guide[] = []; let x = nx; let y = ny
  for (const b of blocks) {
    if (b.id === id) continue
    const bR = b.x + b.w; const dR = x + w; const bCx = b.x + b.w / 2
    if (Math.abs(x - b.x) < SNAP) { x = b.x; guides.push({ axis: 'x', pos: b.x }) }
    else if (Math.abs(x - bR) < SNAP) { x = bR; guides.push({ axis: 'x', pos: bR }) }
    else if (Math.abs(dR - b.x) < SNAP) { x = b.x - w; guides.push({ axis: 'x', pos: b.x }) }
    else if (Math.abs(dR - bR) < SNAP) { x = bR - w; guides.push({ axis: 'x', pos: bR }) }
    else if (Math.abs((x + w / 2) - bCx) < SNAP) { x = bCx - w / 2; guides.push({ axis: 'x', pos: Math.round(bCx) }) }
    if (Math.abs(y - b.y) < SNAP) { y = b.y; guides.push({ axis: 'y', pos: b.y }) }
  }
  return { x: Math.round(x), y: Math.round(y), guides }
}

/* ─── 5 distinct template configs ───────────────────────────────────────────── */
type TplConfig = { id: string; name: string; desc: string; accent: string; variant: string }
const SYSTEM_TPLS: TplConfig[] = [
  { id: 'pro', name: 'Classique Pro', desc: 'Sobre, confiance', accent: '#2563eb', variant: 'classic' },
  { id: 'sombre', name: 'Prestige', desc: 'Sombre, haut de gamme', accent: '#0f172a', variant: 'dark' },
  { id: 'sidebar', name: 'Latérale', desc: 'Bande couleur gauche', accent: '#7c3aed', variant: 'sidebar' },
  { id: 'minimal', name: 'Épuré', desc: 'Minimaliste, luxe', accent: '#111827', variant: 'minimal' },
  { id: 'bold', name: 'Éclat', desc: 'Couleurs vives, moderne', accent: '#ea580c', variant: 'bold' },
]

function initBlocks(accent: string, variant: string, numero: string, artisan: Artisan | null): Block[] {
  const today = new Date().toISOString().split('T')[0]
  const cn = artisan?.entreprise || ''; const cs = artisan?.nom || ''
  const baseContent = { badgeText: 'DEVIS', numero, date: today, validite: '30', companyName: cn, companySubtitle: cs, address: '', phone: '', email: '', siret: '' }

  if (variant === 'sidebar') {
    return [
      { id: 'sidebar', type: 'sidebar', x: 0, y: 0, w: 150, h: 1123, content: { companyName: cn, companySubtitle: cs, address: '', phone: '', email: '', siret: '' }, style: { accent, variant } },
      { id: 'header', type: 'header', x: 162, y: 30, w: 590, content: { ...baseContent }, style: { accent, variant } },
      { id: 'div1', type: 'divider', x: 162, y: 145, w: 590, content: {}, style: { bg: accent } },
      { id: 'client', type: 'client', x: 162, y: 161, w: 285, content: { label: 'DESTINATAIRE', nom: '', tel: '', email: '', adresse: '' }, style: { accent, variant } },
      { id: 'chantier', type: 'chantier', x: 460, y: 161, w: 292, content: { label: 'CHANTIER', adresse: '' }, style: { accent, variant } },
      { id: 'objet', type: 'objet', x: 162, y: 291, w: 590, content: { prefix: 'Objet :', text: '' }, style: { accent, variant } },
      { id: 'table', type: 'table', x: 162, y: 333, w: 590, content: { h1: 'Désignation', h2: 'Qté', h3: 'PU HT', h4: 'TVA', h5: 'Total HT' }, style: { accent, variant } },
      { id: 'totaux', type: 'totaux', x: 402, y: 520, w: 350, content: { lht: 'Total HT', lttc: 'TOTAL TTC' }, style: { accent, variant } },
      { id: 'conditions', type: 'conditions', x: 162, y: 520, w: 225, content: { title: 'Conditions', text: 'Paiement à 30 jours.\nAcompte 30% à la commande.' }, style: { accent, fontSize: 10 } },
      { id: 'signature', type: 'signature', x: 162, y: 750, w: 590, content: { l: 'Bon pour accord\nSignature client :', r: 'Cachet et signature\nentreprise :' }, style: { accent } },
      { id: 'footer', type: 'footer', x: 162, y: 1072, w: 590, content: { left: '', right: 'Document non contractuel' }, style: {} },
    ]
  }

  const xStart = 40; const wFull = 714
  return [
    { id: 'header', type: 'header', x: xStart, y: 30, w: wFull, content: { ...baseContent }, style: { accent, variant } },
    { id: 'div1', type: 'divider', x: xStart, y: 140, w: wFull, content: {}, style: { bg: variant === 'minimal' ? '#e5e7eb' : accent } },
    { id: 'client', type: 'client', x: xStart, y: 156, w: 334, content: { label: 'DESTINATAIRE', nom: '', tel: '', email: '', adresse: '' }, style: { accent, variant } },
    { id: 'chantier', type: 'chantier', x: 390, y: 156, w: 364, content: { label: 'CHANTIER / TRAVAUX', adresse: '' }, style: { accent, variant } },
    { id: 'objet', type: 'objet', x: xStart, y: 286, w: wFull, content: { prefix: 'Objet :', text: '' }, style: { accent, variant, fontSize: 11 } },
    { id: 'table', type: 'table', x: xStart, y: 328, w: wFull, content: { h1: 'Désignation', h2: 'Qté', h3: 'PU HT', h4: 'TVA', h5: 'Total HT' }, style: { accent, variant } },
    { id: 'totaux', type: 'totaux', x: 504, y: 515, w: 250, content: { lht: 'Total HT', lttc: 'TOTAL TTC' }, style: { accent, variant } },
    { id: 'conditions', type: 'conditions', x: xStart, y: 515, w: 450, content: { title: 'Conditions de règlement', text: 'Paiement à 30 jours à réception de facture.\nAcompte de 30% à la commande.' }, style: { accent, fontSize: 10 } },
    { id: 'signature', type: 'signature', x: xStart, y: 760, w: wFull, content: { l: 'Bon pour accord\nSignature du client :', r: 'Cachet et signature\nde l\'entreprise :' }, style: { accent } },
    { id: 'footer', type: 'footer', x: xStart, y: 1072, w: wFull, content: { left: '', right: 'Document non contractuel avant validation' }, style: {} },
  ]
}

/* ─── Editable ───────────────────────────────────────────────────────────────── */
function E({ v, s, ph, multi, onSave }: { v: string; s?: React.CSSProperties; ph?: string; multi?: boolean; onSave: (val: string) => void }) {
  const ref = useRef<HTMLDivElement>(null); const active = useRef(false)
  useEffect(() => { if (!active.current && ref.current && ref.current.textContent !== (v || '')) ref.current.textContent = v || '' }, [v])
  return (
    <div ref={ref} contentEditable suppressContentEditableWarning
      onFocus={() => { active.current = true }}
      onBlur={e => { active.current = false; onSave(e.currentTarget.textContent || '') }}
      onKeyDown={!multi ? e => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur() } } : undefined}
      onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
      style={{ outline: 'none', minWidth: 4, cursor: 'text', ...s }}
      className="ce" data-ph={ph || ''} />
  )
}
function T({ v, ph, s }: { v: string; ph?: string; s?: React.CSSProperties }) {
  return v ? <span style={s}>{v}</span> : <span style={{ ...s, color: '#c0bfbf', fontStyle: 'italic', fontWeight: 400 }}>{ph}</span>
}

/* ─── Block renderer ─────────────────────────────────────────────────────────── */
function RenderBlock({ block, artisan, lignes, setLignes, onContent, isEditing }: {
  block: Block; artisan: Artisan | null; lignes: Ligne[]
  setLignes: (l: Ligne[]) => void; onContent: (k: string, v: string) => void; isEditing: boolean
}) {
  const { ht, byTva, ttc } = calcTotaux(lignes)
  const acc = block.style.accent || '#2563eb'
  const v = block.style.variant || 'classic'
  const isDark = v === 'dark'; const isMin = v === 'minimal'; const isSidebar = v === 'sidebar'; const isBold = v === 'bold'
  const u = (k: string) => (vv: string) => onContent(k, vv)
  const c = block.content

  /* ── SIDEBAR block (violet strip, fixed full-height bg) ── */
  if (block.type === 'sidebar') {
    const name = c.companyName || artisan?.entreprise || ''
    const sub = c.companySubtitle || artisan?.nom || ''
    return (
      <div style={{ background: acc, height: block.h || 1123, padding: '28px 16px', display: 'flex', flexDirection: 'column', fontFamily: 'system-ui, Arial, sans-serif' }}>
        {artisan?.logo_url
          ? <img src={artisan.logo_url} alt="" style={{ height: 36, objectFit: 'contain', filter: 'brightness(0) invert(1)', marginBottom: 14 }} />
          : <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 16 }}>{(name || 'A').slice(0, 1).toUpperCase()}</span>
            </div>
        }
        {isEditing ? <E v={name} onSave={u('companyName')} ph="Nom" s={{ display: 'block', fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.2, marginBottom: 3 }} />
          : <div style={{ fontWeight: 800, fontSize: 13, color: '#fff', lineHeight: 1.2, marginBottom: 3 }}><T v={name} ph="Nom" s={{ color: '#fff' }} /></div>}
        {isEditing ? <E v={sub} onSave={u('companySubtitle')} ph="Métier" s={{ display: 'block', fontSize: 9.5, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }} />
          : sub ? <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>{sub}</div> : <div style={{ marginBottom: 16 }} />}
        <div style={{ width: 30, height: 2, background: 'rgba(255,255,255,0.3)', borderRadius: 1, marginBottom: 16 }} />
        {isEditing ? <>
          <E v={c.address || ''} onSave={u('address')} ph="Adresse..." multi s={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 8, whiteSpace: 'pre-line', lineHeight: 1.5 }} />
          <E v={c.phone || ''} onSave={u('phone')} ph="Téléphone" s={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 5 }} />
          <E v={c.email || ''} onSave={u('email')} ph="Email" s={{ display: 'block', fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 5 }} />
          <E v={c.siret || ''} onSave={u('siret')} ph="SIRET..." s={{ display: 'block', fontSize: 8.5, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }} />
        </> : <>
          {c.address ? <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 8, whiteSpace: 'pre-line', lineHeight: 1.5 }}>{c.address}</div> : null}
          {c.phone ? <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 5 }}>{c.phone}</div> : null}
          {c.email ? <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.65)', marginBottom: 5 }}>{c.email}</div> : null}
          {c.siret ? <div style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>{c.siret}</div> : null}
        </>}
      </div>
    )
  }

  /* ── HEADER ── */
  if (block.type === 'header') {
    const name = c.companyName || artisan?.entreprise || ''
    const sub = c.companySubtitle || artisan?.nom || ''
    // compact contact row (non-edit): all on one line
    const contactParts = [c.address?.split('\n')[0], c.phone, c.email, c.siret].filter(Boolean)

    if (isDark) return (
      <div style={{ background: acc, borderRadius: 10, padding: '18px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontFamily: 'system-ui, Arial, sans-serif' }}>
        <div>
          {artisan?.logo_url ? <img src={artisan.logo_url} alt="" style={{ height: 36, objectFit: 'contain', display: 'block', marginBottom: 8, filter: 'brightness(0) invert(1)' }} /> : null}
          {isEditing ? <E v={name} onSave={u('companyName')} ph="Nom entreprise" s={{ display: 'block', fontWeight: 800, fontSize: 16, color: '#fff' }} />
            : <div style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}><T v={name} ph="Nom entreprise" s={{ color: '#fff' }} /></div>}
          {isEditing ? <E v={sub} onSave={u('companySubtitle')} ph="Gérant / Métier" s={{ display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 }} />
            : sub ? <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 2 }}>{sub}</div> : null}
          {isEditing
            ? <div style={{ display: 'flex', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
                <E v={c.phone || ''} onSave={u('phone')} ph="Tél." s={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }} />
                <E v={c.email || ''} onSave={u('email')} ph="Email" s={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }} />
                <E v={c.siret || ''} onSave={u('siret')} ph="SIRET" s={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }} />
              </div>
            : contactParts.length > 0
              ? <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>{contactParts.join('  ·  ')}</div>
              : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 18px', border: '1px solid rgba(255,255,255,0.25)', marginBottom: 10 }}>
            {isEditing ? <E v={c.badgeText || 'DEVIS'} onSave={u('badgeText')} s={{ fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: 3 }} />
              : <span style={{ fontWeight: 900, fontSize: 20, color: '#fff', letterSpacing: 3 }}>{c.badgeText || 'DEVIS'}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            {[['N°', 'numero', 'DEV-001', 700, 12], ['Date', null, fmtDate(c.date || ''), 400, 10], ['Validité', 'validite', (c.validite || '30') + ' jours', 400, 10]].map(([lbl, field, val, fw, fs]: unknown[]) => (
              <div key={lbl as string} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{lbl as string}</span>
                {isEditing && field ? <E v={c[field as string] || ''} onSave={u(field as string)} s={{ fontWeight: fw as number, fontSize: fs as number, color: '#fff' }} />
                  : <span style={{ fontWeight: fw as number, fontSize: fs as number, color: 'rgba(255,255,255,0.9)' }}>{val as string}</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    if (isSidebar) return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontFamily: 'system-ui, Arial, sans-serif' }}>
        <div>
          {isEditing ? <E v={name} onSave={u('companyName')} ph="Nom entreprise" s={{ display: 'block', fontWeight: 800, fontSize: 15, color: '#111' }} />
            : <div style={{ fontWeight: 800, fontSize: 15, color: '#111' }}><T v={name} ph="Nom entreprise" /></div>}
          {sub ? <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{sub}</div> : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: acc, borderRadius: 6, padding: '5px 16px', marginBottom: 8 }}>
            {isEditing ? <E v={c.badgeText || 'DEVIS'} onSave={u('badgeText')} s={{ fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: 3 }} />
              : <span style={{ fontWeight: 900, fontSize: 18, color: '#fff', letterSpacing: 3 }}>{c.badgeText || 'DEVIS'}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            {[['N°', 'numero'], ['Date', null], ['Validité', 'validite']].map(([lbl, field]) => (
              <div key={lbl} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 10, color: '#444' }}>
                <span style={{ fontSize: 8, color: '#aaa', textTransform: 'uppercase' }}>{lbl}</span>
                {field && isEditing ? <E v={c[field] || ''} onSave={u(field)} s={{ fontWeight: 600, fontSize: 11, color: '#111' }} />
                  : <span style={{ fontWeight: field === 'numero' ? 700 : 400, fontSize: field === 'numero' ? 12 : 10, color: '#444' }}>
                      {field === 'numero' ? (c.numero || 'DEV-001') : field === 'validite' ? (c.validite || '30') + ' jours' : fmtDate(c.date || '')}
                    </span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    )

    if (isMin) return (
      <div style={{ fontFamily: 'system-ui, Arial, sans-serif', borderTop: `3px solid ${acc}`, paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          {artisan?.logo_url
            ? <img src={artisan.logo_url} alt="" style={{ height: 32, objectFit: 'contain', display: 'block', marginBottom: 8 }} />
            : null}
          {isEditing ? <E v={name} onSave={u('companyName')} ph="Nom entreprise" s={{ display: 'block', fontWeight: 900, fontSize: 22, color: '#111', letterSpacing: -0.5 }} />
            : <div style={{ fontWeight: 900, fontSize: 22, color: '#111', letterSpacing: -0.5 }}><T v={name} ph="Nom entreprise" /></div>}
          {isEditing ? <E v={sub} onSave={u('companySubtitle')} ph="Gérant / Métier" s={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }} />
            : sub ? <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{sub}</div> : null}
          {isEditing
            ? <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <E v={c.phone || ''} onSave={u('phone')} ph="Téléphone" s={{ fontSize: 9.5, color: '#777' }} />
                <E v={c.email || ''} onSave={u('email')} ph="Email" s={{ fontSize: 9.5, color: '#777' }} />
                <E v={c.siret || ''} onSave={u('siret')} ph="SIRET" s={{ fontSize: 9.5, color: '#aaa' }} />
              </div>
            : contactParts.length > 0
              ? <div style={{ fontSize: 9.5, color: '#888', marginTop: 6 }}>{contactParts.join('  ·  ')}</div>
              : null}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', border: `2px solid ${acc}`, borderRadius: 4, padding: '4px 14px', marginBottom: 8 }}>
            {isEditing ? <E v={c.badgeText || 'DEVIS'} onSave={u('badgeText')} s={{ fontWeight: 900, fontSize: 18, color: acc, letterSpacing: 3 }} />
              : <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 3, color: acc }}>{c.badgeText || 'DEVIS'}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 8.5, color: '#aaa', textTransform: 'uppercase' }}>N°</span>
              {isEditing ? <E v={c.numero || ''} onSave={u('numero')} ph="DEV-001" s={{ fontWeight: 700, fontSize: 12, color: '#111' }} /> : <span style={{ fontWeight: 700, fontSize: 12, color: '#111' }}><T v={c.numero} ph="DEV-001" /></span>}
            </div>
            <span style={{ fontSize: 10, color: '#888' }}>{fmtDate(c.date || '')}</span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 8.5, color: '#aaa', textTransform: 'uppercase' }}>Validité</span>
              {isEditing ? <E v={c.validite || '30'} onSave={u('validite')} s={{ fontSize: 10, color: '#888' }} /> : <span style={{ fontSize: 10, color: '#888' }}>{c.validite || '30'} jours</span>}
            </div>
          </div>
        </div>
      </div>
    )

    // classic + bold
    const isBoldV = isBold
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontFamily: 'system-ui, Arial, sans-serif' }}>
        <div style={{ flex: 1, paddingRight: 16 }}>
          {artisan?.logo_url
            ? <img src={artisan.logo_url} alt="" style={{ height: 40, objectFit: 'contain', display: 'block', marginBottom: 8 }} />
            : <div style={{ width: 38, height: 38, background: isBoldV ? acc : `${acc}20`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <span style={{ color: isBoldV ? '#fff' : acc, fontWeight: 800, fontSize: 15 }}>{(name || 'A').slice(0, 1).toUpperCase()}</span>
              </div>}
          {isEditing ? <E v={name} onSave={u('companyName')} ph="Nom entreprise" s={{ display: 'block', fontWeight: 800, fontSize: isBoldV ? 17 : 14, color: '#111' }} />
            : <div style={{ fontWeight: 800, fontSize: isBoldV ? 17 : 14, color: '#111' }}><T v={name} ph="Nom entreprise" /></div>}
          {isEditing ? <E v={sub} onSave={u('companySubtitle')} ph="Gérant / Métier" s={{ display: 'block', fontSize: 10, color: '#6b7280', marginTop: 2 }} />
            : sub ? <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{sub}</div> : null}
          {/* Contact info — ALWAYS on one compact line in non-edit mode */}
          {isEditing
            ? <div style={{ display: 'flex', gap: 10, marginTop: 5, flexWrap: 'wrap' }}>
                <E v={c.address || ''} onSave={u('address')} ph="Adresse" s={{ fontSize: 9.5, color: '#555' }} />
                <E v={c.phone || ''} onSave={u('phone')} ph="Téléphone" s={{ fontSize: 9.5, color: '#555' }} />
                <E v={c.email || ''} onSave={u('email')} ph="Email" s={{ fontSize: 9.5, color: '#555' }} />
                <E v={c.siret || ''} onSave={u('siret')} ph="SIRET" s={{ fontSize: 9.5, color: '#aaa' }} />
              </div>
            : contactParts.length > 0
              ? <div style={{ fontSize: 9.5, color: '#777', marginTop: 5, lineHeight: 1.4 }}>{contactParts.join('  ·  ')}</div>
              : null}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', background: acc, borderRadius: isBoldV ? 4 : 6, padding: isBoldV ? '8px 22px' : '6px 18px', marginBottom: 10 }}>
            {isEditing ? <E v={c.badgeText || 'DEVIS'} onSave={u('badgeText')} s={{ fontWeight: 900, fontSize: isBoldV ? 22 : 19, color: '#fff', letterSpacing: 3 }} />
              : <span style={{ fontWeight: 900, fontSize: isBoldV ? 22 : 19, letterSpacing: 3, color: '#fff' }}>{c.badgeText || 'DEVIS'}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 8.5, color: '#aaa', textTransform: 'uppercase' }}>N°</span>
              {isEditing ? <E v={c.numero || ''} onSave={u('numero')} ph="DEV-001" s={{ fontWeight: 700, fontSize: 12, color: '#111' }} /> : <span style={{ fontWeight: 700, fontSize: 12, color: '#111' }}><T v={c.numero} ph="DEV-001" /></span>}
            </div>
            <span style={{ fontSize: 10, color: '#888' }}>{fmtDate(c.date || '')}</span>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontSize: 8.5, color: '#aaa', textTransform: 'uppercase' }}>Validité</span>
              {isEditing ? <E v={c.validite || '30'} onSave={u('validite')} s={{ fontSize: 10, color: '#888' }} /> : <span style={{ fontSize: 10, color: '#888' }}>{c.validite || '30'} jours</span>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (block.type === 'divider') return <div style={{ height: isMin ? 1 : isBold ? 4 : 3, background: block.style.bg || acc, borderRadius: 2 }} />

  if (block.type === 'client' || block.type === 'chantier') {
    const isClient = block.type === 'client'
    const boxSt: React.CSSProperties = isMin
      ? { border: '1px solid #e5e7eb', borderRadius: 6, padding: '10px 12px' }
      : isBold
        ? { borderLeft: `5px solid ${acc}`, padding: '10px 14px', background: `${acc}0a` }
        : { borderLeft: `4px solid ${acc}`, borderRadius: '0 8px 8px 0', padding: '11px 13px', background: `${acc}0a`, border: `1px solid ${acc}18` }
    return (
      <div style={{ fontFamily: 'system-ui, Arial, sans-serif', ...boxSt }}>
        {isEditing ? <E v={c.label || ''} onSave={u('label')} s={{ display: 'block', fontWeight: 800, fontSize: 8.5, color: acc, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 7 }} />
          : <div style={{ fontWeight: 800, fontSize: 8.5, color: acc, textTransform: 'uppercase', letterSpacing: 1.8, marginBottom: 7 }}>{c.label}</div>}
        {isClient
          ? isEditing ? <>
              <E v={c.nom || ''} onSave={u('nom')} ph="Nom du client" s={{ display: 'block', fontWeight: 700, fontSize: 12, color: '#111', marginBottom: 3 }} />
              <E v={c.tel || ''} onSave={u('tel')} ph="Téléphone" s={{ display: 'block', fontSize: 10, color: '#555', marginBottom: 2 }} />
              <E v={c.email || ''} onSave={u('email')} ph="Email" s={{ display: 'block', fontSize: 10, color: '#555', marginBottom: 2 }} />
              <E v={c.adresse || ''} onSave={u('adresse')} ph="Adresse..." multi s={{ display: 'block', fontSize: 10, color: '#555', whiteSpace: 'pre-line' }} />
            </> : <>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#111', marginBottom: 3 }}><T v={c.nom} ph="Nom du client" /></div>
              {c.tel && <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{c.tel}</div>}
              {c.email && <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>{c.email}</div>}
              {c.adresse && <div style={{ fontSize: 10, color: '#555', whiteSpace: 'pre-line' }}>{c.adresse}</div>}
            </>
          : isEditing
            ? <E v={c.adresse || ''} onSave={u('adresse')} ph="Adresse / description du chantier..." multi s={{ display: 'block', fontSize: 11, color: '#333', whiteSpace: 'pre-line', lineHeight: 1.6 }} />
            : <div style={{ fontSize: 11, color: '#333', whiteSpace: 'pre-line', lineHeight: 1.6 }}><T v={c.adresse} ph="Adresse du chantier..." /></div>}
      </div>
    )
  }

  if (block.type === 'objet') {
    const sz = block.style.fontSize || 11
    return (
      <div style={{ fontFamily: 'system-ui, Arial, sans-serif', background: isMin ? 'transparent' : `${acc}0d`, borderLeft: `3px solid ${acc}`, padding: '9px 14px', display: 'flex', gap: 6 }}>
        {isEditing ? <E v={c.prefix || 'Objet :'} onSave={u('prefix')} s={{ fontWeight: 700, fontSize: sz, color: acc, whiteSpace: 'nowrap', flexShrink: 0 }} />
          : <strong style={{ fontWeight: 700, fontSize: sz, color: acc, whiteSpace: 'nowrap', flexShrink: 0 }}>{c.prefix || 'Objet :'}</strong>}
        {isEditing ? <E v={c.text || ''} onSave={u('text')} ph="Description des travaux..." multi s={{ fontSize: sz, color: '#222', flex: 1 }} />
          : <span style={{ fontSize: sz, color: '#222' }}><T v={c.text} ph="Description des travaux..." /></span>}
      </div>
    )
  }

  if (block.type === 'table') {
    const upd = (lid: string, f: keyof Ligne, vv: string) => setLignes(lignes.map(l => l.id === lid ? { ...l, [f]: vv } : l))
    const cols = [{ key: 'h1', w: '38%', al: 'left' as const }, { key: 'h2', w: '9%', al: 'center' as const }, { key: 'h3', w: '16%', al: 'right' as const }, { key: 'h4', w: '10%', al: 'center' as const }, { key: 'h5', w: '17%', al: 'right' as const }]
    const thBg = isMin ? '#f3f4f6' : acc; const thCol = isMin ? '#374151' : '#fff'
    return (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'system-ui, Arial, sans-serif', fontSize: 10.5 }}>
        <thead>
          <tr style={{ background: thBg }}>
            {cols.map(col => (
              <th key={col.key} style={{ padding: '8px 10px', textAlign: col.al, color: thCol, fontWeight: 700, fontSize: 9.5 }}>
                {isEditing ? <E v={c[col.key] || ''} onSave={u(col.key)} s={{ fontWeight: 700, fontSize: 9.5, color: thCol, textAlign: col.al }} /> : <span>{c[col.key]}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => {
            const q = parseFloat(l.qte) || 0; const p = parseFloat(l.pu) || 0
            const rowBg = i % 2 === 0 ? '#fff' : (isMin ? '#f9fafb' : `${acc}05`)
            return (
              <tr key={l.id} style={{ background: rowBg }}>
                <td style={{ padding: '7px 10px', borderBottom: '1px solid #f0f0f0', color: '#111' }}>
                  {isEditing ? <E v={l.designation} onSave={vv => upd(l.id, 'designation', vv)} ph="Désignation..." s={{ color: '#111', fontSize: 10.5 }} /> : <T v={l.designation} ph="Désignation" s={{ color: '#111' }} />}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f0f0f0', color: '#111' }}>
                  {isEditing ? <E v={l.qte} onSave={vv => upd(l.id, 'qte', vv)} s={{ textAlign: 'center', color: '#111' }} /> : l.qte}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid #f0f0f0', color: '#111' }}>
                  {isEditing ? <E v={l.pu} onSave={vv => upd(l.id, 'pu', vv)} ph="0,00" s={{ textAlign: 'right', color: '#111' }} /> : (p > 0 ? fmt(p) + ' €' : '—')}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'center', borderBottom: '1px solid #f0f0f0' }}>
                  {isEditing
                    ? <select value={l.tva} onChange={e => upd(l.id, 'tva', e.target.value)} onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ fontSize: 10, border: 'none', background: 'transparent', color: '#111' }}>
                        {[0, 5.5, 10, 20].map(t => <option key={t} value={t}>{t}%</option>)}
                      </select>
                    : <span style={{ color: '#555' }}>{l.tva}%</span>}
                </td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid #f0f0f0', color: '#111' }}>
                  {q * p > 0 ? fmt(q * p) + ' €' : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  if (block.type === 'totaux') return (
    <div style={{ fontFamily: 'system-ui, Arial, sans-serif', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid #f0f0f0' }}>
        {isEditing ? <E v={c.lht || 'Total HT'} onSave={u('lht')} s={{ fontSize: 10.5, color: '#6b7280' }} /> : <span style={{ fontSize: 10.5, color: '#6b7280' }}>{c.lht || 'Total HT'}</span>}
        <span style={{ fontWeight: 600, fontSize: 11, color: '#111' }}>{fmt(ht)} €</span>
      </div>
      {Object.entries(byTva).filter(([, vv]) => vv > 0).sort(([a], [b]) => +a - +b).map(([r, vv]) => (
        <div key={r} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 14px', borderBottom: '1px solid #f0f0f0' }}>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>TVA {r}%</span><span style={{ fontSize: 10.5, color: '#555' }}>{fmt(vv)} €</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: acc }}>
        {isEditing ? <E v={c.lttc || 'TOTAL TTC'} onSave={u('lttc')} s={{ fontWeight: 800, fontSize: 12, color: '#fff', letterSpacing: 0.5 }} /> : <span style={{ fontWeight: 800, fontSize: 12, color: '#fff', letterSpacing: 0.5 }}>{c.lttc || 'TOTAL TTC'}</span>}
        <span style={{ fontWeight: 800, fontSize: 15, color: '#fff' }}>{fmt(ttc)} €</span>
      </div>
    </div>
  )

  if (block.type === 'conditions') return (
    <div style={{ fontFamily: 'system-ui, Arial, sans-serif' }}>
      {isEditing ? <E v={c.title || ''} onSave={u('title')} s={{ display: 'block', fontWeight: 700, fontSize: 9.5, color: acc, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }} />
        : c.title ? <div style={{ fontWeight: 700, fontSize: 9.5, color: acc, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{c.title}</div> : null}
      {isEditing ? <E v={c.text || ''} onSave={u('text')} multi ph="Conditions..." s={{ fontSize: 10, color: '#555', whiteSpace: 'pre-line', lineHeight: 1.6 }} />
        : <div style={{ fontSize: 10, color: '#555', whiteSpace: 'pre-line', lineHeight: 1.6 }}><T v={c.text} ph="Conditions..." /></div>}
    </div>
  )

  if (block.type === 'signature') return (
    <div style={{ fontFamily: 'system-ui, Arial, sans-serif', display: 'flex', gap: 20 }}>
      {(['l', 'r'] as const).map(side => (
        <div key={side} style={{ flex: 1, border: `1px dashed ${acc}55`, borderRadius: 8, padding: '12px 14px', minHeight: 80 }}>
          {isEditing ? <E v={c[side] || ''} onSave={u(side)} multi s={{ fontSize: 9.5, color: '#888', whiteSpace: 'pre-line', lineHeight: 1.6 }} />
            : <div style={{ fontSize: 9.5, color: '#888', whiteSpace: 'pre-line', lineHeight: 1.6 }}><T v={c[side]} ph="Signature..." /></div>}
        </div>
      ))}
    </div>
  )

  if (block.type === 'footer') return (
    <div style={{ fontFamily: 'system-ui, Arial, sans-serif', borderTop: '1px solid #e5e7eb', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
      {isEditing ? <E v={c.left || ''} onSave={u('left')} ph="Informations légales..." s={{ fontSize: 8, color: '#aaa' }} />
        : <span style={{ fontSize: 8, color: '#aaa' }}>{c.left || artisan?.entreprise || ''}</span>}
      {isEditing ? <E v={c.right || ''} onSave={u('right')} ph="Note..." s={{ fontSize: 8, color: '#aaa', textAlign: 'right' }} />
        : <span style={{ fontSize: 8, color: '#aaa' }}>{c.right}</span>}
    </div>
  )

  return null
}

/* ─── Form helpers ───────────────────────────────────────────────────────────── */
function FLabel({ c }: { c: React.ReactNode }) {
  return <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{c}</label>
}
function FIn({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400 transition-colors" />
}
function FTa({ value, onChange, placeholder, rows = 2 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 bg-white focus:outline-none focus:border-blue-400 resize-none transition-colors" />
}
function FSect({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-2 mt-1">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  )
}

/* ─── Template mini-preview ──────────────────────────────────────────────────── */
function TplPreview({ tpl }: { tpl: TplConfig }) {
  const a = tpl.accent
  const isSidebar = tpl.variant === 'sidebar'
  const isDark = tpl.variant === 'dark'
  const isMin = tpl.variant === 'minimal'
  const isBold = tpl.variant === 'bold'
  return (
    <div style={{ width: '100%', aspectRatio: '0.707', background: '#fff', border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden', position: 'relative', fontFamily: 'system-ui, sans-serif' }}>
      {isSidebar && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '22%', background: a }} />}
      <div style={{ position: 'relative', padding: isSidebar ? '8% 6% 4% 28%' : '8% 8% 4%' }}>
        {/* Header */}
        {isDark && <div style={{ background: a, borderRadius: 4, height: '14%', marginBottom: '4%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8%' }}>
          <div style={{ width: '35%', height: 4, background: 'rgba(255,255,255,0.5)', borderRadius: 2 }} />
          <div style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 3, padding: '2px 6px' }}>
            <div style={{ width: 20, height: 4, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
          </div>
        </div>}
        {!isDark && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3%' }}>
          <div>
            {isMin && <div style={{ width: '70%', height: 2, background: a, borderRadius: 1, marginBottom: 4 }} />}
            <div style={{ width: isBold ? 44 : 38, height: isBold ? 5 : 4, background: '#111', borderRadius: 1, marginBottom: 3 }} />
            <div style={{ width: 26, height: 3, background: '#bbb', borderRadius: 1 }} />
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ display: 'inline-flex', background: isMin ? 'transparent' : a, border: isMin ? `1.5px solid ${a}` : 'none', borderRadius: 3, padding: '2px 6px', marginBottom: 3 }}>
              <div style={{ width: 20, height: isBold ? 5 : 4, background: isMin ? a : '#fff', borderRadius: 1 }} />
            </div>
            <div style={{ width: 22, height: 2.5, background: '#ddd', borderRadius: 1, marginLeft: 'auto', marginBottom: 2 }} />
            <div style={{ width: 18, height: 2.5, background: '#ddd', borderRadius: 1, marginLeft: 'auto' }} />
          </div>
        </div>}
        {/* Divider */}
        <div style={{ height: isDark ? 0 : isMin ? 1 : 2, background: isMin ? '#e5e7eb' : a, marginBottom: '3%' }} />
        {/* Client + Chantier boxes */}
        <div style={{ display: 'flex', gap: '4%', marginBottom: '3%' }}>
          {[0, 1].map(i => (
            <div key={i} style={{ flex: 1, height: '12%', borderLeft: isMin ? 'none' : `2.5px solid ${a}`, border: isMin ? '1px solid #e5e7eb' : undefined, borderRadius: isMin ? 3 : '0 3px 3px 0', background: isMin ? 'transparent' : `${a}10`, padding: '2%' }}>
              <div style={{ width: '50%', height: 2.5, background: a, borderRadius: 1, marginBottom: 3 }} />
              <div style={{ width: '75%', height: 2, background: '#ccc', borderRadius: 1 }} />
            </div>
          ))}
        </div>
        {/* Table header */}
        <div style={{ height: 8, background: isMin ? '#f3f4f6' : a, borderRadius: '2px 2px 0 0', marginBottom: 1 }} />
        {[0, 1, 2].map(i => <div key={i} style={{ height: 6, background: i % 2 === 0 ? '#fff' : '#f9f9f9', borderBottom: '1px solid #f0f0f0', marginBottom: 0 }} />)}
        {/* Totaux */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '3%' }}>
          <div style={{ width: '38%', border: '1px solid #e5e7eb', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: 5, borderBottom: '1px solid #f0f0f0' }} />
            <div style={{ height: 7, background: a, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: '60%', height: 2.5, background: 'rgba(255,255,255,0.7)', borderRadius: 1 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Template Picker ────────────────────────────────────────────────────────── */
function TemplatePicker({ artisan, onSelect, onSelectSaved }: {
  artisan: Artisan | null; onSelect: (t: TplConfig) => void; onSelectSaved: (t: SavedTemplate) => void
}) {
  const [saved, setSaved] = useState<SavedTemplate[]>([])
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingVal, setRenamingVal] = useState('')
  useEffect(() => {
    if (!artisan) return
    supabase.from('devis_templates').select('id,name,blocks,accent').eq('artisan_id', artisan.id).order('created_at', { ascending: false })
      .then(({ data }) => { if (data) setSaved(data as SavedTemplate[]) })
  }, [artisan])
  const del = async (id: string) => { await supabase.from('devis_templates').delete().eq('id', id); setSaved(s => s.filter(t => t.id !== id)) }
  const rename = async (id: string, name: string) => { await supabase.from('devis_templates').update({ name }).eq('id', id); setSaved(s => s.map(t => t.id === id ? { ...t, name } : t)); setRenamingId(null) }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <a href="/dashboard" className="text-blue-600 text-sm hover:underline">← Tableau de bord</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Nouveau devis</h1>
        <p className="text-gray-400 text-sm mt-1">Choisissez un modèle</p>
      </div>
      {saved.length > 0 && (
        <div className="w-full max-w-3xl mb-8">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Mes templates</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {saved.map(tpl => (
              <div key={tpl.id} className="bg-white border-2 border-gray-200 hover:border-blue-400 rounded-2xl p-3 transition-all group">
                <div className="h-1.5 rounded-full mb-3" style={{ background: tpl.accent }} />
                {renamingId === tpl.id
                  ? <div className="flex gap-1 mb-2">
                      <input autoFocus value={renamingVal} onChange={e => setRenamingVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') rename(tpl.id, renamingVal); if (e.key === 'Escape') setRenamingId(null) }}
                        className="flex-1 border border-blue-400 rounded px-1.5 py-0.5 text-xs text-gray-900 bg-white focus:outline-none" />
                      <button onClick={() => rename(tpl.id, renamingVal)} className="text-blue-600 text-xs px-1">✓</button>
                    </div>
                  : <div className="font-semibold text-gray-800 text-xs mb-2 cursor-pointer truncate" onClick={() => onSelectSaved(tpl)}>{tpl.name}</div>
                }
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onSelectSaved(tpl)} className="text-[10px] bg-blue-50 text-blue-600 rounded px-1.5 py-0.5 hover:bg-blue-100 font-medium flex-1">Utiliser</button>
                  <button onClick={() => { setRenamingId(tpl.id); setRenamingVal(tpl.name) }} className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 hover:bg-gray-200">✎</button>
                  <button onClick={() => del(tpl.id)} className="text-[10px] bg-red-50 text-red-400 rounded px-1.5 py-0.5 hover:bg-red-100">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="w-full max-w-3xl">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Modèles</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {SYSTEM_TPLS.map(tpl => (
            <button key={tpl.id} onClick={() => onSelect(tpl)}
              className="bg-white border-2 border-gray-200 hover:border-gray-400 rounded-2xl p-3 text-left transition-all hover:shadow-lg hover:-translate-y-0.5 group">
              <TplPreview tpl={tpl} />
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

/* ─── Block names for toolbar ────────────────────────────────────────────────── */
const BLOCK_NAMES: Record<string, string> = {
  header: 'En-tête', divider: 'Séparateur', client: 'Destinataire', chantier: 'Chantier',
  objet: 'Objet', table: 'Tableau', totaux: 'Totaux', conditions: 'Conditions',
  signature: 'Signature', footer: 'Pied de page',
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */
export default function DevisCreator() {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [artisan, setArtisan] = useState<Artisan | null>(null)
  const [started, setStarted] = useState(false)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [history, setHistory] = useState<Block[][]>([])
  const [lignes, setLignes] = useState<Ligne[]>([{ id: uid(), designation: '', qte: '1', pu: '', tva: 10 }])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [saving, setSaving] = useState(false); const [saved, setSaved] = useState(false)
  const [showTplSave, setShowTplSave] = useState(false); const [tplName, setTplName] = useState(''); const [savingTpl, setSavingTpl] = useState(false)
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null)
  const resize = useRef<{ id: string; prop: 'w' | 'h'; sx: number; sy: number; ow: number; oh: number } | null>(null)
  const blocksRef = useRef<Block[]>([]); blocksRef.current = blocks
  const historyRef = useRef<Block[][]>([]); historyRef.current = history
  const totaux = calcTotaux(lignes)

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: a } = await supabase.from('artisans').select('id,nom,entreprise,logo_url').eq('id', user.id).single()
      if (a) setArtisan(a)
    })()
  }, [])

  useEffect(() => {
    const update = () => { if (containerRef.current) setScale(Math.min(1, (containerRef.current.clientWidth - 48) / A4W)) }
    update(); window.addEventListener('resize', update); return () => window.removeEventListener('resize', update)
  }, [started])

  const undo = useCallback(() => {
    const h = historyRef.current; if (!h.length) return
    setHistory(h.slice(0, -1)); setBlocks(h[h.length - 1])
  }, [])

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if ((document.activeElement as HTMLElement)?.isContentEditable) return
        e.preventDefault(); undo()
      }
      if (e.key === 'Escape') { setEditing(null); setSelected(null) }
    }
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn)
  }, [undo])

  const pushHistory = useCallback(() => setHistory(h => [...h.slice(-30), blocksRef.current]), [])
  const commit = useCallback((nb: Block[]) => { setHistory(h => [...h.slice(-30), blocksRef.current]); setBlocks(nb) }, [])

  const onBlockPD = (id: string) => (e: React.PointerEvent) => {
    if (editing === id) return
    e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId)
    const b = blocksRef.current.find(x => x.id === id)!
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: b.x, oy: b.y, moved: false }
    setSelected(id); setEditing(null)
  }
  const onCanvasPM = (e: React.PointerEvent) => {
    if (resize.current) {
      const r = resize.current
      if (r.prop === 'w') {
        const nw = Math.max(40, r.ow + (e.clientX - r.sx) / scale)
        setBlocks(prev => prev.map(b => b.id === r.id ? { ...b, w: Math.round(nw) } : b))
      } else {
        const nh = Math.max(20, r.oh + (e.clientY - r.sy) / scale)
        setBlocks(prev => prev.map(b => b.id === r.id ? { ...b, h: Math.round(nh) } : b))
      }
      return
    }
    if (!drag.current) return
    const dx = (e.clientX - drag.current.sx) / scale; const dy = (e.clientY - drag.current.sy) / scale
    if (!drag.current.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return
    drag.current.moved = true
    const b = blocksRef.current.find(x => x.id === drag.current!.id)!
    const { x, y, guides: g } = snapBlock(blocksRef.current, drag.current.id, drag.current.ox + dx, drag.current.oy + dy, b.w)
    setGuides(g); setBlocks(prev => prev.map(bl => bl.id === drag.current!.id ? { ...bl, x, y } : bl))
  }
  const onCanvasPU = () => {
    if (resize.current) { pushHistory(); resize.current = null; return }
    if (drag.current?.moved) pushHistory(); drag.current = null; setGuides([])
  }
  const onBlockDbl = (id: string) => (e: React.MouseEvent) => {
    if (id === 'sidebar') return // sidebar handled in form
    e.stopPropagation(); setEditing(id); setSelected(id)
  }
  const onCanvasClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-block]')) return
    setSelected(null); setEditing(null)
  }

  const ubc = (id: string, key: string, val: string) =>
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, content: { ...b.content, [key]: val } } : b))

  const changeAccent = (newAcc: string) => {
    setBlocks(prev => prev.map(b => ({
      ...b, style: { ...b.style, ...(b.style.accent !== undefined ? { accent: newAcc } : {}), ...(b.id === 'div1' ? { bg: newAcc } : {}) }
    })))
  }

  const bc = (id: string) => blocks.find(b => b.id === id)?.content || {}
  const accent = blocks.find(b => b.style.accent)?.style.accent || '#2563eb'
  const selectedBlock = blocks.find(b => b.id === selected)
  const isSidebarTpl = blocks.some(b => b.id === 'sidebar')

  const saveDevis = async () => {
    if (!artisan) return; setSaving(true)
    const hd = bc('header'); const cl = bc('client')
    await supabase.from('devis_docs').insert({
      artisan_id: artisan.id, numero: hd.numero || 'DEV-001',
      template: 'classique', objet: bc('objet').text || '',
      client_nom: cl.nom || '', client_email: cl.email || '',
      client_adresse: cl.adresse || '', chantier_adresse: bc('chantier').adresse || '',
      lignes, conditions: bc('conditions').text || '',
      validite_jours: parseInt(hd.validite || '30'),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const saveTemplate = async () => {
    if (!artisan || !tplName.trim()) return; setSavingTpl(true)
    await supabase.from('devis_templates').insert({ artisan_id: artisan.id, name: tplName.trim(), blocks: blocksRef.current, accent })
    setSavingTpl(false); setShowTplSave(false); setTplName('')
  }

  const handleSelect = (t: TplConfig) => {
    setBlocks(initBlocks(t.accent, t.variant, 'DEV-2026-' + String(Date.now()).slice(-3), artisan))
    setHistory([]); setStarted(true)
  }
  const handleSelectSaved = (t: SavedTemplate) => {
    const numero = 'DEV-2026-' + String(Date.now()).slice(-3)
    setBlocks((t.blocks as Block[]).map(b => b.id === 'header' ? { ...b, content: { ...b.content, numero, date: new Date().toISOString().split('T')[0] } } : b))
    setHistory([]); setStarted(true)
  }

  if (!started) return <TemplatePicker artisan={artisan} onSelect={handleSelect} onSelectSaved={handleSelectSaved} />

  return (
    <>
      <style>{`
        .ce { display: inline-block; }
        .ce:focus { outline: 1.5px solid rgba(37,99,235,0.4) !important; border-radius: 3px; background: rgba(37,99,235,0.04); }
        .ce:empty::before { content: attr(data-ph); color: #c0bfbf; font-style: italic; pointer-events: none; font-weight: 400; }
        .bw:hover > .bh { opacity: 1 !important; }
        @media print {
          body > * { display: none !important; }
          #pz { display: block !important; position: fixed; inset: 0; background: white; z-index: 9999; }
          #pz .ce { outline: none !important; background: transparent !important; }
          @page { size: A4; margin: 0; }
        }
      `}</style>
      <div id="pz" style={{ display: 'none' }}>
        <div style={{ width: A4W, minHeight: 1123, background: '#fff', position: 'relative' }}>
          {blocks.map(b => (
            <div key={b.id} style={{ position: 'absolute', left: b.x, top: b.y, width: b.w, ...(b.h ? { height: b.h } : {}) }}>
              <RenderBlock block={b} artisan={artisan} lignes={lignes} setLignes={setLignes} onContent={() => {}} isEditing={false} />
            </div>
          ))}
        </div>
      </div>

      {/* Save template modal */}
      {showTplSave && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowTplSave(false)}>
          <div className="rounded-2xl p-6 w-80 shadow-2xl" style={{ background: '#ffffff' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#111827', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Enregistrer ce template</h3>
            <p style={{ color: '#6b7280', fontSize: 12, marginBottom: 16 }}>Disponible pour vos prochains devis.</p>
            <input autoFocus value={tplName} onChange={e => setTplName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveTemplate() }}
              placeholder="Nom du template..."
              style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 12, padding: '10px 14px', fontSize: 14, color: '#111827', background: '#f9fafb', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowTplSave(false)} style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 12, padding: '10px', fontSize: 14, color: '#6b7280', background: '#fff', cursor: 'pointer' }}>Annuler</button>
              <button onClick={saveTemplate} disabled={!tplName.trim() || savingTpl}
                style={{ flex: 1, background: accent, color: '#fff', borderRadius: 12, padding: '10px', fontSize: 14, fontWeight: 600, border: 'none', cursor: tplName.trim() ? 'pointer' : 'default', opacity: !tplName.trim() || savingTpl ? 0.4 : 1 }}>
                {savingTpl ? '...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-gray-100 flex flex-col select-none">
        <header className="bg-white border-b border-gray-200 h-14 flex items-center px-4 gap-2 sticky top-0 z-20 shadow-sm">
          <a href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">←</a>
          <button onClick={() => { setStarted(false); setBlocks([]); setHistory([]) }} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-50">Templates</button>
          <button onClick={undo} disabled={history.length === 0} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-50 disabled:opacity-30" title="Ctrl+Z">↩ Annuler</button>
          <span className="flex-1 text-xs text-gray-400 text-center hidden sm:block">
            {editing ? '✏️ Mode édition — Échap pour quitter' : selected ? '⠿ Glisser · Double-clic pour éditer' : 'Double-clic sur un bloc pour tout éditer'}
          </span>
          <button onClick={() => setShowTplSave(true)} className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 text-gray-600 hover:bg-gray-50 font-medium">💾 Sauver template</button>
          <button onClick={saveDevis} disabled={saving}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${saved ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
            {saved ? '✓' : saving ? '...' : 'Sauvegarder'}
          </button>
          <button onClick={() => window.print()} className="text-white px-3 py-1.5 rounded-lg text-sm font-semibold" style={{ background: accent }}>PDF</button>
        </header>

        {/* ── BARRE FORMAT CANVA ─────────────────────────────────────── */}
        {selected && (() => { const sb = blocks.find(b => b.id === selected); return sb && sb.type !== 'sidebar' ? (
          <div style={{ height: 46, background: '#fff', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 6, flexShrink: 0, overflowX: 'auto' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginRight: 4, minWidth: 60 }}>{BLOCK_NAMES[sb.type] || 'Bloc'}</span>
            <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>Taille</span>
            <input type="number" min={6} max={72} value={sb.style.fontSize || 11}
              onChange={e => commit(blocks.map(b => b.id === selected ? { ...b, style: { ...b.style, fontSize: +e.target.value } } : b))}
              style={{ width: 42, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 5px', fontSize: 11, color: '#111', textAlign: 'center' }} />
            <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />
            {(['left','center','right'] as const).map((al, i) => {
              const icons = ['☰̲', '☰', '☰̅']
              const labels = ['Gauche','Centré','Droite']
              const active = (sb.style.textAlign || 'left') === al
              return (
                <button key={al} title={labels[i]}
                  onClick={() => commit(blocks.map(b => b.id === selected ? { ...b, style: { ...b.style, textAlign: al } } : b))}
                  style={{ width: 30, height: 28, borderRadius: 6, border: '1px solid', borderColor: active ? '#2563eb' : '#e5e7eb', background: active ? '#eff6ff' : '#fff', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {i === 0 ? '⇤' : i === 1 ? '↔' : '⇥'}
                </button>
              )
            })}
            <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: '#9ca3af' }}>L</span>
            <input type="number" min={20} value={Math.round(sb.w)}
              onChange={e => commit(blocks.map(b => b.id === selected ? { ...b, w: Math.max(20, +e.target.value) } : b))}
              style={{ width: 52, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 5px', fontSize: 11, color: '#111', textAlign: 'center' }} />
            <span style={{ fontSize: 10, color: '#9ca3af' }}>H</span>
            <input type="number" min={0} value={Math.round(sb.h || 0)} placeholder="auto"
              onChange={e => { const v = +e.target.value; commit(blocks.map(b => b.id === selected ? { ...b, h: v > 0 ? v : undefined } : b)) }}
              style={{ width: 52, border: '1px solid #e5e7eb', borderRadius: 6, padding: '3px 5px', fontSize: 11, color: '#111', textAlign: 'center' }} />
            <div style={{ flex: 1, minWidth: 8 }} />
            <button onClick={() => { commit(blocks.filter(b => b.id !== selected)); setSelected(null) }}
              style={{ fontSize: 11, color: '#ef4444', border: '1px solid #fecaca', borderRadius: 6, padding: '5px 12px', background: '#fff', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
              ✕ Suppr.
            </button>
          </div>
        ) : null })()}

        <div className="flex flex-1 overflow-hidden">
          {/* FORMULAIRE */}
          <aside className="w-72 bg-white border-r border-gray-100 overflow-y-auto flex-shrink-0 text-sm">
            <div className="p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                <span className="text-sm font-bold text-gray-800">Formulaire</span>
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">sync auto</span>
              </div>

              <FSect title="Devis">
                <div><FLabel c="Numéro" /><FIn value={bc('header').numero || ''} onChange={v => ubc('header', 'numero', v)} placeholder="DEV-2026-001" /></div>
                <div><FLabel c="Date" /><FIn type="date" value={bc('header').date || ''} onChange={v => ubc('header', 'date', v)} /></div>
                <div><FLabel c="Validité (jours)" /><FIn type="number" value={bc('header').validite || '30'} onChange={v => ubc('header', 'validite', v)} /></div>
                <div>
                  <FLabel c="Couleur" />
                  <div className="flex items-center gap-2">
                    <input type="color" value={accent} onChange={e => changeAccent(e.target.value)} className="w-8 h-8 rounded border border-gray-200 cursor-pointer p-0.5" />
                    <span className="text-[10px] text-gray-400 font-mono">{accent}</span>
                    <div className="flex gap-1 ml-auto">
                      {['#2563eb', '#0f172a', '#7c3aed', '#111827', '#ea580c'].map(col => (
                        <button key={col} onClick={() => changeAccent(col)} style={{ background: col }} className="w-4 h-4 rounded-full border border-white shadow hover:scale-110 transition-transform" />
                      ))}
                    </div>
                  </div>
                </div>
              </FSect>

              <FSect title="Mon entreprise">
                <div><FLabel c="Nom / Société" /><FIn value={(isSidebarTpl ? bc('sidebar') : bc('header')).companyName || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'companyName', v)} placeholder={artisan?.entreprise || 'Nom entreprise'} /></div>
                <div><FLabel c="Gérant / Métier" /><FIn value={(isSidebarTpl ? bc('sidebar') : bc('header')).companySubtitle || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'companySubtitle', v)} placeholder={artisan?.nom || ''} /></div>
                <div><FLabel c="Adresse" /><FTa value={(isSidebarTpl ? bc('sidebar') : bc('header')).address || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'address', v)} placeholder={"12 rue des Artisans\n75000 Paris"} rows={2} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><FLabel c="Téléphone" /><FIn value={(isSidebarTpl ? bc('sidebar') : bc('header')).phone || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'phone', v)} placeholder="06 …" /></div>
                  <div><FLabel c="Email" /><FIn value={(isSidebarTpl ? bc('sidebar') : bc('header')).email || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'email', v)} placeholder="email@…" /></div>
                </div>
                <div><FLabel c="SIRET" /><FIn value={(isSidebarTpl ? bc('sidebar') : bc('header')).siret || ''} onChange={v => ubc(isSidebarTpl ? 'sidebar' : 'header', 'siret', v)} placeholder="000 000 000 00000" /></div>
              </FSect>

              <FSect title="Client">
                <div><FLabel c="Nom / Société" /><FIn value={bc('client').nom || ''} onChange={v => ubc('client', 'nom', v)} placeholder="Jean Dupont" /></div>
                <div><FLabel c="Téléphone" /><FIn value={bc('client').tel || ''} onChange={v => ubc('client', 'tel', v)} placeholder="06 00 00 00 00" /></div>
                <div><FLabel c="Email" /><FIn type="email" value={bc('client').email || ''} onChange={v => ubc('client', 'email', v)} placeholder="client@email.fr" /></div>
                <div><FLabel c="Adresse" /><FTa value={bc('client').adresse || ''} onChange={v => ubc('client', 'adresse', v)} placeholder={"12 rue des Lilas\n75000 Paris"} rows={3} /></div>
              </FSect>

              <FSect title="Chantier">
                <div><FTa value={bc('chantier').adresse || ''} onChange={v => ubc('chantier', 'adresse', v)} placeholder="Adresse du chantier..." rows={3} /></div>
              </FSect>

              <FSect title="Objet">
                <div><FTa value={bc('objet').text || ''} onChange={v => ubc('objet', 'text', v)} placeholder="Rénovation salle de bain..." rows={2} /></div>
              </FSect>

              <FSect title="Prestations">
                {lignes.map((l, i) => (
                  <div key={l.id} className="border border-gray-200 rounded-xl p-2.5 bg-gray-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] font-semibold text-gray-400">Ligne {i + 1}</span>
                      <button onClick={() => { if (lignes.length > 1) { pushHistory(); setLignes(lignes.filter(x => x.id !== l.id)) } }} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="mb-1.5"><FIn value={l.designation} onChange={v => setLignes(lignes.map(x => x.id === l.id ? { ...x, designation: v } : x))} placeholder="Fourniture et pose..." /></div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div><FLabel c="Qté" /><input type="number" value={l.qte} onChange={e => setLignes(lignes.map(x => x.id === l.id ? { ...x, qte: e.target.value } : x))} className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-gray-900 bg-white focus:outline-none" /></div>
                      <div><FLabel c="PU HT €" /><input type="number" value={l.pu} onChange={e => setLignes(lignes.map(x => x.id === l.id ? { ...x, pu: e.target.value } : x))} className="w-full border border-gray-200 rounded-lg px-1.5 py-1 text-xs text-gray-900 bg-white focus:outline-none" /></div>
                      <div><FLabel c="TVA" /><select value={l.tva} onChange={e => setLignes(lignes.map(x => x.id === l.id ? { ...x, tva: +e.target.value } : x))} className="w-full border border-gray-200 rounded-lg px-1 py-1 text-xs text-gray-900 bg-white">{[0, 5.5, 10, 20].map(t => <option key={t} value={t}>{t}%</option>)}</select></div>
                    </div>
                  </div>
                ))}
                <button onClick={() => setLignes(l => [...l, { id: uid(), designation: '', qte: '1', pu: '', tva: 10 }])} className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl py-2 text-xs text-gray-400 hover:text-blue-500 transition-all w-full">+ Ajouter</button>
                {totaux.ttc > 0 && (
                  <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100">
                    <div className="flex justify-between text-xs text-gray-500 mb-1"><span>Total HT</span><span className="font-medium">{fmt(totaux.ht)} €</span></div>
                    {Object.entries(totaux.byTva).filter(([, vv]) => vv > 0).map(([r, vv]) => (
                      <div key={r} className="flex justify-between text-xs text-gray-400"><span>TVA {r}%</span><span>{fmt(vv)} €</span></div>
                    ))}
                    <div className="flex justify-between text-sm font-bold text-gray-900 border-t border-gray-200 pt-1.5 mt-1">
                      <span>Total TTC</span><span style={{ color: accent }}>{fmt(totaux.ttc)} €</span>
                    </div>
                  </div>
                )}
              </FSect>

              <FSect title="Conditions">
                <FTa value={bc('conditions').text || ''} onChange={v => ubc('conditions', 'text', v)} placeholder={"Paiement à 30 jours...\nAcompte 30% à la commande."} rows={3} />
              </FSect>
            </div>
          </aside>

          {/* CANVAS */}
          <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-400 p-6 flex flex-col items-center"
            onPointerMove={onCanvasPM} onPointerUp={onCanvasPU} onClick={onCanvasClick}>
            <div style={{ width: A4W * scale, height: 1123 * scale, position: 'relative', flexShrink: 0, boxShadow: '0 12px 48px rgba(0,0,0,0.35)' }}>
              <div style={{ width: A4W, height: 1123, background: '#fff', transformOrigin: 'top left', transform: `scale(${scale})`, position: 'absolute' }}>
                {guides.map((g, i) => (
                  g.axis === 'x'
                    ? <div key={i} style={{ position: 'absolute', left: g.pos, top: 0, width: 1, height: '100%', background: '#2563eb', pointerEvents: 'none', zIndex: 200 }} />
                    : <div key={i} style={{ position: 'absolute', top: g.pos, left: 0, height: 1, width: '100%', background: '#2563eb', pointerEvents: 'none', zIndex: 200 }} />
                ))}
                {blocks.map(b => {
                  const isSidebarBlock = b.type === 'sidebar'
                  return (
                    <div key={b.id} data-block="1" className="bw"
                      style={{
                        position: 'absolute', left: b.x, top: b.y, width: b.w,
                        ...(b.h ? { height: b.h } : {}),
                        cursor: isSidebarBlock ? 'default' : editing === b.id ? 'text' : 'move',
                        outline: !isSidebarBlock && selected === b.id ? '2px solid #2563eb' : 'none',
                        outlineOffset: 3,
                        zIndex: isSidebarBlock ? 0 : selected === b.id ? 10 : 1,
                        ...(b.style.textAlign ? { textAlign: b.style.textAlign as React.CSSProperties['textAlign'] } : {}),
                      }}
                      onPointerDown={isSidebarBlock ? undefined : onBlockPD(b.id)}
                      onDoubleClick={isSidebarBlock ? undefined : onBlockDbl(b.id)}>
                      {!isSidebarBlock && selected !== b.id && (
                        <div className="bh" style={{ position: 'absolute', top: -16, left: 0, fontSize: 9, color: '#2563eb', opacity: 0, transition: 'opacity 0.1s', pointerEvents: 'none', whiteSpace: 'nowrap', background: '#eff6ff', padding: '1px 5px', borderRadius: 3 }}>
                          Double-clic pour éditer
                        </div>
                      )}
                      {!isSidebarBlock && selected === b.id && editing !== b.id && (
                        <div style={{ position: 'absolute', top: -20, left: 0, fontSize: 9, color: '#2563eb', background: '#eff6ff', padding: '2px 6px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap' }}>⠿ Glisser · Double-clic pour éditer</div>
                      )}
                      {editing === b.id && (
                        <div style={{ position: 'absolute', top: -20, left: 0, fontSize: 9, color: '#059669', background: '#ecfdf5', padding: '2px 6px', borderRadius: 3, pointerEvents: 'none', whiteSpace: 'nowrap' }}>✏️ Édition — Échap</div>
                      )}
                      <RenderBlock block={b} artisan={artisan} lignes={lignes}
                        setLignes={l => { pushHistory(); setLignes(l) }}
                        onContent={(k, vv) => ubc(b.id, k, vv)}
                        isEditing={editing === b.id} />
                      {/* Resize handles */}
                      {!isSidebarBlock && selected === b.id && (
                        <>
                          <div title="Largeur"
                            style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 12, height: 24, background: '#2563eb', borderRadius: 4, cursor: 'ew-resize', zIndex: 30, touchAction: 'none' }}
                            onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); resize.current = { id: b.id, prop: 'w', sx: e.clientX, sy: e.clientY, ow: b.w, oh: b.h || 80 } }} />
                          <div title="Hauteur"
                            style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 24, height: 12, background: '#2563eb', borderRadius: 4, cursor: 'ns-resize', zIndex: 30, touchAction: 'none' }}
                            onPointerDown={e => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); resize.current = { id: b.id, prop: 'h', sx: e.clientX, sy: e.clientY, ow: b.w, oh: b.h || 80 } }} />
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
