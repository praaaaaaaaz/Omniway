'use client'
import { useEffect, useState } from 'react'
import { supabase, type Devis } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Artisan = { id: string; nom: string; entreprise: string; google_review_url: string | null; logo_url: string | null }
type DevisDoc = { id: string; numero: string; template: string; objet: string | null; client_nom: string; created_at: string; lignes: {qte:string;pu:string;tva:number}[] }

const STATUT_META: Record<string, { color: string; bg: string; label: string }> = {
  'En attente':  { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    label: 'En attente' },
  'Relance 1x':  { color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200',  label: '1re relance envoyée' },
  'Relance 2x':  { color: 'text-red-700',     bg: 'bg-red-50 border-red-200',        label: '2e relance envoyée' },
  'Accepte':     { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',label: 'Accepté' },
  'Perdu':       { color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',      label: 'Perdu' },
  'Avis envoye': { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      label: 'Avis envoyé' },
}

const PIPELINE_STEPS = [
  { key: 'En attente',  icon: '📋', label: 'En attente' },
  { key: 'Relance 1x',  icon: '📨', label: '1re relance' },
  { key: 'Accepte',     icon: '✅', label: 'Accepté' },
  { key: 'Avis envoye', icon: '⭐', label: 'Avis envoyé' },
]

const FILTER_LABELS: Record<string, string> = {
  'Tous': 'Tous',
  'En attente': 'En attente',
  'Relance 1x': '1re relance',
  'Relance 2x': '2e relance',
  'Accepte': 'Accepté',
  'Perdu': 'Perdu',
}

function ProgressSteps({ statut }: { statut: string }) {
  const steps = [
    { label: 'Devis envoyé',  active: true },
    { label: '1re relance',   active: ['Relance 1x','Relance 2x','Accepte','Avis envoye'].includes(statut) },
    { label: '2e relance',    active: ['Relance 2x','Accepte','Avis envoye'].includes(statut) },
    { label: statut === 'Perdu' ? 'Perdu' : 'Accepté',
      active: ['Accepte','Perdu','Avis envoye'].includes(statut),
      lost: statut === 'Perdu' },
    { label: 'Avis Google',   active: statut === 'Avis envoye' },
  ]
  return (
    <div className="flex items-center gap-0">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-0.5">
            <div className={`w-2.5 h-2.5 rounded-full border-2 transition-all ${
              s.lost ? 'bg-gray-300 border-gray-300' :
              s.active ? 'bg-blue-500 border-blue-500' : 'bg-white border-gray-300'
            }`} />
            <span className={`text-[9px] font-medium whitespace-nowrap ${
              s.lost ? 'text-gray-400' : s.active ? 'text-blue-600' : 'text-gray-400'
            }`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`w-5 h-0.5 mb-3 ${s.active && steps[i+1].active ? 'bg-blue-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const router = useRouter()
  const [devis, setDevis] = useState<Devis[]>([])
  const [artisan, setArtisan] = useState<Artisan | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'devis' | 'profil' | 'documents'>('devis')
  const [docs, setDocs] = useState<DevisDoc[]>([])
  const [showForm, setShowForm] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)
  const [filterStatut, setFilterStatut] = useState('Tous')
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'montant'>('date_desc')
  const [profile, setProfile] = useState({ nom: '', entreprise: '', google_review_url: '' })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [form, setForm] = useState({ nom_client: '', email_client: '', montant: '', date_devis: new Date().toISOString().split('T')[0], notes: '' })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: a } = await supabase.from('artisans').select('id,nom,entreprise,google_review_url,logo_url').eq('id', user.id).single()
    if (a) { setArtisan(a); setProfile({ nom: a.nom||'', entreprise: a.entreprise||'', google_review_url: a.google_review_url||'' }) }
    const { data } = await supabase.from('devis').select('*').order('created_at', { ascending: false })
    setDevis(data || [])
    const { data: d } = await supabase.from('devis_docs').select('id,numero,template,objet,client_nom,created_at,lignes').order('created_at', { ascending: false })
    setDocs((d || []) as DevisDoc[])
    setLoading(false)
  }

  const addDevis = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('devis').insert({ artisan_id: user.id, nom_client: form.nom_client, email_client: form.email_client, montant: form.montant ? parseFloat(form.montant) : null, date_devis: form.date_devis, notes: form.notes || null })
    setForm({ nom_client: '', email_client: '', montant: '', date_devis: new Date().toISOString().split('T')[0], notes: '' })
    setShowForm(false)
    loadData()
  }

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!artisan) return
    setProfileSaving(true)
    let logo_url = artisan.logo_url
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${artisan.id}/logo.${ext}`
      const { error } = await supabase.storage.from('logos').upload(path, logoFile, { upsert: true })
      if (!error) {
        const { data } = supabase.storage.from('logos').getPublicUrl(path)
        logo_url = data.publicUrl
      }
    }
    await supabase.from('artisans').update({ nom: profile.nom, entreprise: profile.entreprise, google_review_url: profile.google_review_url || null, logo_url }).eq('id', artisan.id)
    setProfileSaving(false); setProfileSaved(true)
    setLogoFile(null)
    setTimeout(() => setProfileSaved(false), 2500)
    loadData()
  }

  const toggleAvis = async (id: string, current: boolean) => {
    await supabase.from('devis').update({ demander_avis: !current }).eq('id', id)
    loadData()
  }

  const updateStatut = async (id: string, statut: string) => {
    await supabase.from('devis').update({ statut }).eq('id', id)
    loadData()
  }

  const deleteDevis = async (id: string) => {
    if (!confirm('Supprimer ce devis ?')) return
    await supabase.from('devis').delete().eq('id', id)
    loadData()
  }

  const logout = async () => { await supabase.auth.signOut(); router.push('/') }

  const initials = (artisan?.nom || 'A').split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0,2)

  const sortedFiltered = (() => {
    const list = filterStatut === 'Tous' ? devis : devis.filter(d => d.statut === filterStatut)
    if (sortBy === "date_asc")  return [...list].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    if (sortBy === 'montant')   return [...list].sort((a,b) => (b.montant||0) - (a.montant||0))
    return [...list].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })()

  const stats = {
    total: devis.length,
    actifs: devis.filter(d => !['Accepte','Perdu','Avis envoye'].includes(d.statut)).length,
    acceptes: devis.filter(d => d.statut === 'Accepte').length,
    ca: devis.filter(d => d.statut === 'Accepte').reduce((s, d) => s + (d.montant || 0), 0),
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white text-xs font-bold">A</span>
            </div>
            <span className="font-semibold text-gray-900">ArtisanAuto</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
              <span className="text-blue-700 text-xs font-bold">{initials}</span>
            </div>
            <span className="text-sm text-gray-700 hidden sm:block">{artisan?.entreprise || artisan?.nom}</span>
            <button onClick={logout} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5">Quitter</button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {([['devis','Mes devis'],['documents','Documents PDF'],['profil','Mon profil']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <a href="/dashboard/devis-creator"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-colors flex items-center gap-2">
            + Créer un devis PDF
          </a>
        </div>

        {/* ── PROFIL ── */}
        {tab === 'profil' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Mon profil</h2>
            <form onSubmit={saveProfile} className="flex flex-col gap-5">
              {[
                { label: 'Votre nom', key: 'nom', placeholder: 'Jean Dupont' },
                { label: "Nom de l'entreprise", key: 'entreprise', placeholder: 'Dupont Plomberie' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{f.label}</label>
                  <input value={(profile as Record<string,string>)[f.key]}
                    onChange={e => setProfile({...profile, [f.key]: e.target.value})}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={f.placeholder} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Lien Google Avis</label>
                <input value={profile.google_review_url}
                  onChange={e => setProfile({...profile, google_review_url: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://g.page/r/..." />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logo de votre entreprise</label>
                {artisan?.logo_url && (
                  <img src={artisan.logo_url} alt="logo" className="h-12 mb-2 rounded-lg object-contain border border-gray-200 p-1" />
                )}
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-700 transition-colors">
                    {logoFile ? logoFile.name : 'Choisir un fichier'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => setLogoFile(e.target.files?.[0] || null)} />
                  </label>
                  {logoFile && <span className="text-xs text-green-600">✓ Prêt à sauvegarder</span>}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">PNG, JPG — apparaît sur vos devis PDF</p>
              </div>
              <button type="submit" disabled={profileSaving}
                className={`py-2.5 rounded-xl text-sm font-semibold transition-all ${profileSaved ? 'bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'} disabled:opacity-50`}>
                {profileSaved ? '✓ Sauvegardé' : profileSaving ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </form>
          </div>
        )}

        {/* ── DOCUMENTS ── */}
        {tab === 'documents' && (
          <div className="flex flex-col gap-3">
            {docs.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 py-20 flex flex-col items-center gap-3 text-gray-400">
                <span className="text-5xl">📁</span>
                <p className="text-sm">{"Aucun devis PDF sauvegardé."}</p>
                <a href="/dashboard/devis-creator" className="text-blue-600 text-sm hover:underline">Créer votre premier devis PDF</a>
              </div>
            ) : docs.map(doc => {
              const ttc = (doc.lignes || []).reduce((s, l) => {
                const q = parseFloat(String(l.qte)) || 0
                const p = parseFloat(String(l.pu)) || 0
                return s + q * p * (1 + l.tva / 100)
              }, 0)
              return (
                <div key={doc.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg">
                      {doc.template === 'moderne' ? '✨' : '📄'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 text-sm">{doc.numero}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{doc.client_nom}{doc.objet ? ` — ${doc.objet}` : ''}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{new Date(doc.created_at).toLocaleDateString('fr-FR')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {ttc > 0 && <span className="text-sm font-bold text-gray-900">{ttc.toLocaleString('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2})} €</span>}
                    <a href="/dashboard/devis-creator"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                      Ouvrir
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── DEVIS ── */}
        {tab === 'devis' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total devis', value: stats.total, icon: '📋', color: 'text-gray-900' },
                { label: 'En cours', value: stats.actifs, icon: '⏳', color: 'text-amber-600' },
                { label: 'Acceptés', value: stats.acceptes, icon: '✅', color: 'text-emerald-600' },
                { label: 'CA signé', value: stats.ca > 0 ? `${stats.ca.toLocaleString('fr-FR')} €` : '—', icon: '💶', color: 'text-blue-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                  <div className="text-2xl mb-1">{s.icon}</div>
                  <div className={`text-2xl font-bold ${s.color} leading-none`}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Pipeline — où en sont vos devis</p>
              <div className="grid grid-cols-4 gap-2">
                {PIPELINE_STEPS.map(step => {
                  const count = devis.filter(d => d.statut === step.key).length
                  const pct = devis.length > 0 ? Math.round((count / devis.length) * 100) : 0
                  return (
                    <button key={step.key}
                      onClick={() => setFilterStatut(filterStatut === step.key ? 'Tous' : step.key)}
                      className={`rounded-xl p-4 text-left border-2 transition-all ${filterStatut === step.key ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-300 bg-gray-50'}`}>
                      <div className="text-xl mb-2">{step.icon}</div>
                      <div className="text-2xl font-bold text-gray-900">{count}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{step.label}</div>
                      <div className="mt-2 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                {Object.keys(FILTER_LABELS).map(s => (
                  <button key={s} onClick={() => setFilterStatut(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filterStatut === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                    {FILTER_LABELS[s]} ({s === 'Tous' ? devis.length : devis.filter(d => d.statut === s).length})
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-xs text-gray-400">Trier :</span>
                {([['date_desc','Plus récent'],['date_asc','Plus ancien'],['montant','Montant']] as [string,string][]).map(([val,lab]) => (
                  <button key={val} onClick={() => setSortBy(val as typeof sortBy)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${sortBy===val ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}>
                    {lab}
                  </button>
                ))}
              </div>
            </div>

            {showForm && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-semibold text-gray-900">Nouveau suivi client</h3>
                  <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>
                <form onSubmit={addDevis} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: 'Nom client *', key: 'nom_client', type: 'text', placeholder: 'Marie Martin', req: true },
                    { label: 'Email client *', key: 'email_client', type: 'email', placeholder: 'marie@email.fr', req: true },
                    { label: 'Montant (€)', key: 'montant', type: 'number', placeholder: '1500', req: false },
                    { label: 'Date du devis', key: 'date_devis', type: 'date', placeholder: '', req: false },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{f.label}</label>
                      <input type={f.type} required={f.req} placeholder={f.placeholder}
                        value={(form as Record<string,string>)[f.key]}
                        onChange={e => setForm({...form, [f.key]: e.target.value})}
                        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  ))}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Notes</label>
                    <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}
                      placeholder="Renovation cuisine, 2e étage..."
                      className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="md:col-span-2 flex gap-3">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold">Ajouter</button>
                    <button type="button" onClick={() => setShowForm(false)} className="text-gray-500 px-4 py-2.5 text-sm">Annuler</button>
                  </div>
                </form>
              </div>
            )}

            {sortedFiltered.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-200 py-20 flex flex-col items-center gap-3 text-gray-400">
                <span className="text-5xl">📋</span>
                <p className="text-sm">{"Aucun devis pour l'instant."}</p>
                <button onClick={() => setShowForm(true)} className="text-blue-600 text-sm hover:underline">Ajouter un suivi client</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sortedFiltered.map(d => {
                  const meta = STATUT_META[d.statut] || STATUT_META['En attente']
                  return (
                    <div key={d.id} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                            <span className="text-blue-700 font-bold text-sm">{d.nom_client.slice(0,2).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 text-sm">{d.nom_client}</div>
                            <div className="text-gray-400 text-xs mt-0.5">{d.email_client}</div>
                            {d.notes && <div className="text-gray-500 text-xs mt-1 italic truncate max-w-xs">{d.notes}</div>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-lg font-bold text-gray-900">{d.montant ? `${d.montant.toLocaleString('fr-FR')} €` : '—'}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{new Date(d.date_devis).toLocaleDateString('fr-FR')}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-4 flex-wrap">
                        <ProgressSteps statut={d.statut} />
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${meta.bg} ${meta.color}`}>{meta.label}</span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium">Statut :</span>
                          <select value={d.statut} onChange={e => updateStatut(d.id, e.target.value)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="En attente">En attente</option>
                            <option value="Accepte">Accepté</option>
                            <option value="Perdu">Perdu</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          {d.statut === 'Avis envoye' ? (
                            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">✓ Avis envoyé</span>
                          ) : d.demander_avis ? (
                            <button onClick={() => toggleAvis(d.id, true)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors">
                              ⏳ Demande planifiée — Annuler
                            </button>
                          ) : (
                            <button onClick={() => toggleAvis(d.id, false)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-gray-600 border border-gray-200 hover:border-blue-400 hover:text-blue-600 transition-colors">
                              ⭐ Demander un avis Google
                            </button>
                          )}
                          <button onClick={() => deleteDevis(d.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors text-sm">✕</button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
