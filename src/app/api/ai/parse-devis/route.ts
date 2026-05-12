import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const KEYS = (process.env.GROQ_KEYS || process.env.GROQ_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean)

async function callGroq(prompt: string): Promise<string> {
  let lastErr: unknown
  for (const key of KEYS) {
    try {
      const groq = new Groq({ apiKey: key })
      const res = await groq.chat.completions.create({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1024,
        temperature: 0.1,
      })
      return res.choices[0]?.message?.content?.trim() || ''
    } catch (e: any) {
      lastErr = e
      if (e?.status === 429 || e?.message?.includes('rate') || e?.message?.includes('quota')) continue
      throw e
    }
  }
  throw lastErr
}

export async function POST(req: NextRequest) {
  const { text, today } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: 'empty' }, { status: 400 })

  const prompt = `Tu es un assistant qui extrait des informations d'un devis artisan decrit en langage naturel.

Texte : "${text}"

Date du jour : ${today}

Reponds UNIQUEMENT avec du JSON valide, sans markdown, sans explication.

Format :
{
  "clientNom": "civilite + nom (ex: M. Dupont, Mme Martin)",
  "clientAdresse": "adresse complete du client sur une ligne",
  "chantierAdresse": "adresse du chantier UNIQUEMENT si explicitement differente de l'adresse du client, sinon string vide",
  "objet": "description courte des travaux (ex: Renovation cuisine 20m2)",
  "lignes": [
    { "designation": "description de la prestation avec superficie si mentionnee", "qte": "1", "pu": "montant en chiffres HT (le montant donne est considere HORS TAXE par defaut)", "tva": 10 }
  ],
  "date": "date en YYYY-MM-DD"
}

Regles importantes :
- Le montant donne EST le prix HT, ne pas diviser. Sauf si "TTC" est explicitement mentionne dans le texte.
- Si "notre date", "aujourd hui", "la date du jour" : utiliser ${today}
- Si les travaux sont chez le client (sa maison, chez lui, a domicile) : chantierAdresse = ""
- TVA par defaut : 10. Si pas mentionne, mettre 10.
- Inclure la superficie dans la designation si mentionnee`

  const raw = await callGroq(prompt)
  try {
    return NextResponse.json(JSON.parse(raw))
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try { return NextResponse.json(JSON.parse(match[0])) } catch {}
    }
    return NextResponse.json({ error: 'parse_failed', raw }, { status: 500 })
  }
}
