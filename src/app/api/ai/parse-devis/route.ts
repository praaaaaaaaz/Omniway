import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { text, today } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const prompt = `Tu es un assistant qui extrait des informations d'un devis artisan decrit en langage naturel.

Texte : "${text}"

Date du jour : ${today}

Reponds UNIQUEMENT avec du JSON valide, sans markdown, sans explication.

Format attendu :
{
  "clientNom": "civilite + nom ou nom societe",
  "clientAdresse": "adresse complete sur une ligne",
  "chantierAdresse": "adresse chantier si differente, sinon vide",
  "objet": "description courte des travaux",
  "lignes": [
    { "designation": "description prestation", "qte": "1", "pu": "montant HT en chiffres seulement", "tva": 10 }
  ],
  "date": "date en YYYY-MM-DD"
}

Regles :
- Si montant TTC avec TVA 10%, divise par 1.1 pour HT
- Si pas de TVA precisee, utilise 10
- Si pas de montant, laisse pu vide string
- Si "notre date" ou "aujourd hui", utilise la date du jour fournie
- Inclure la civilite dans clientNom si mentionnee
- Inclure superficie dans designation si mentionnee`

  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })

  const raw = (msg.content[0] as { type: string; text: string }).text.trim()
  try {
    const data = JSON.parse(raw)
    return NextResponse.json(data)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { return NextResponse.json(JSON.parse(match[0])) } catch {}
    }
    return NextResponse.json({ error: 'parse_failed', raw }, { status: 500 })
  }
}
