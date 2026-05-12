import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function checkSecret(req: NextRequest) {
  return req.headers.get('x-n8n-secret') === process.env.N8N_WEBHOOK_SECRET
}

export async function GET(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'relance1') {
    const { data } = await supabase
      .from('devis')
      .select('*, artisans(nom, entreprise, email)')
      .eq('statut', 'En attente')
      .lte('date_devis', new Date(Date.now() - 4 * 86400000).toISOString().split('T')[0])
    return NextResponse.json(data || [])
  }

  if (action === 'relance2') {
    const { data } = await supabase
      .from('devis')
      .select('*, artisans(nom, entreprise, email)')
      .eq('statut', 'Relance 1x')
      .lte('date_relance_1', new Date(Date.now() - 5 * 86400000).toISOString().split('T')[0])
    return NextResponse.json(data || [])
  }

  if (action === 'perdu') {
    const { data } = await supabase
      .from('devis')
      .select('id')
      .eq('statut', 'Relance 2x')
      .lte('date_relance_2', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0])
    return NextResponse.json(data || [])
  }

  if (action === 'avis') {
    const { data } = await supabase
      .from('devis')
      .select('*, artisans(nom, entreprise, google_review_url)')
      .eq('demander_avis', true)
    return NextResponse.json(data || [])
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function PATCH(req: NextRequest) {
  if (!checkSecret(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, ...updates } = body

  const { error } = await supabase.from('devis').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}