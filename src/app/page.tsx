export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <span className="text-xl font-bold text-blue-600">ArtisanAuto</span>
          <a href="/login" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
            Connexion
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Relancez vos devis.<br />
          <span className="text-blue-600">Automatiquement.</span>
        </h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          Chaque devis sans réponse vous coûte de l'argent. ArtisanAuto envoie les relances à votre place et demande les avis Google après chaque chantier.
        </p>
        <a href="/inscription" className="bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 inline-block">
          Essayer 14 jours gratuit →
        </a>
        <p className="text-sm text-gray-500 mt-4">Sans carte bancaire. 39€/mois après l'essai.</p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-3xl mb-4">📋</div>
            <h3 className="font-bold text-lg mb-2">Suivi des devis</h3>
            <p className="text-gray-600">Visualisez tous vos devis en cours, relancés ou perdus en un coup d'œil.</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-3xl mb-4">📧</div>
            <h3 className="font-bold text-lg mb-2">Relances automatiques</h3>
            <p className="text-gray-600">J+4, J+9, J+16 : les emails partent tout seuls. Vous n'y pensez plus.</p>
          </div>
          <div className="bg-white rounded-xl p-6 border border-gray-200">
            <div className="text-3xl mb-4">⭐</div>
            <h3 className="font-bold text-lg mb-2">Avis Google</h3>
            <p className="text-gray-600">Cochez une case quand le chantier est terminé. Le client reçoit un email pour laisser un avis.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-5xl mx-auto px-6 py-16 text-center">
        <h2 className="text-3xl font-bold mb-10">Un seul tarif, simple</h2>
        <div className="bg-white rounded-2xl border-2 border-blue-600 p-10 max-w-sm mx-auto">
          <div className="text-5xl font-bold text-blue-600 mb-2">39€</div>
          <div className="text-gray-500 mb-6">/mois, sans engagement</div>
          <ul className="text-left space-y-3 mb-8 text-gray-700">
            <li>✅ Relances illimitées</li>
            <li>✅ Demandes d'avis Google</li>
            <li>✅ Tableau de bord</li>
            <li>✅ Support inclus</li>
          </ul>
          <a href="/inscription" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 block text-center">
            Commencer l'essai gratuit
          </a>
        </div>
      </section>

      <footer className="text-center py-8 text-gray-400 text-sm">
        © 2026 ArtisanAuto — contact@artisanauto.fr
      </footer>
    </main>
  )
}
