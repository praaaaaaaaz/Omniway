import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Artisan = {
  id: string
  email: string
  nom: string
  entreprise: string
  google_review_url: string | null
  abonnement_actif: boolean
  trial_ends_at: string
}

export type Devis = {
  id: string
  artisan_id: string
  nom_client: string
  email_client: string
  montant: number | null
  date_devis: string
  statut: string
  date_relance_1: string | null
  date_relance_2: string | null
  demander_avis: boolean
  notes: string | null
  created_at: string
}
