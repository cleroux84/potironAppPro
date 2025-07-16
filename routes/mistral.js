const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const router = express.Router();
 
router.use(cors());
router.use(express.json());
 
const apiKey = process.env.MISTRAL_API_KEY;
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
 
/* ---------- FONCTION utilitaire ------------- */
async function getShopifyOrder(orderNumber, email) {
  const num = orderNumber.replace(/^#/, '').trim();
  const mail = email.trim().toLowerCase();
 
  const query = `
    query($search: String!) {
      orders(first: 1, query: $search) {
        edges {
          node {
            name email displayFulfillmentStatus
            fulfillments(first:1){
              trackingInfo { url number }
              estimatedDeliveryAt
            }
          }
        }
      }
    }`;
  const variables = {
    search: `(name:#${num} OR order_number:${num}) AND email:${mail}`
  };
  const { data } = await axios.post(
    'https://potiron2021.myshopify.com/admin/api/2024-01/graphql.json',
    { query, variables },
    { headers: { 'X-Shopify-Access-Token': SHOPIFYAPPTOKEN } }
  );
 
  const edge = data.data.orders.edges[0];
  if (!edge) return null;
  const o = edge.node, f = o.fulfillments[0] || {}, t = (f.trackingInfo || [{}])[0];
 
  return {
    name: o.name,
    status: o.displayFulfillmentStatus,
    trackingUrl: t.url || null,
    trackingNumber: t.number || null
  };
}
 
/* -------- Classification des requêtes -------- */
function classifyMessage(message) {
  const msg = message.toLowerCase();
  if (/(où.*(commande|colis)|statut|suivi|expédiée?|en cours de livraison)/.test(msg)) return 'delivery';
  if (/(cassé|défectueux|endommagé|reçu.*(mauvais|erreur)|manquant|problème|retour|remboursement)/.test(msg)) return 'issue';
  if (/(conditions|délais|frais|livraison|mode d’expédition|temps d’expédition)/.test(msg)) return 'info';
  return 'other';
}
/* ------------------------------------------- */
 
router.post('/chat', async (req, res) => {
  let { message, orderNumber, email } = req.body;
 
  // Extraction automatique si manquant
  if (!orderNumber) {
    const m = message.match(/#?\d{4,}/);
    if (m) orderNumber = m[0];
  }
  if (!email) {
    const e = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (e) email = e[0].toLowerCase();
  }
 
  let promptSystem = `Tu es un assistant SAV et déco de la boutique Potiron. Réponds brièvement et amicalement.`;
  const category = classifyMessage(message);
  let order = null;
 
  // DELIVERY (statut/suivi)
  if (category === 'delivery') {
    if (!orderNumber || !email) {
      const missing = [];
      if (!orderNumber) missing.push("le numéro de commande");
      if (!email) missing.push("l’e-mail utilisé");
      return res.json({
        reply: `Pour que je puisse retrouver votre commande, merci de me préciser ${missing.join(" et ")}. 😊`
      });
    }
    try {
      order = await getShopifyOrder(orderNumber, email);
      if (order) {
        promptSystem += `
Commande : ${order.name}
Statut   : ${order.status === 'FULFILLED' ? 'Livrée' : order.status}
Suivi    : ${order.trackingUrl}
Numéro   : ${order.trackingNumber}
 
Utilise ces informations pour répondre précisément. Si un lien de suivi existe, donne-le de manière cliquable (en HTML si nécessaire). Ne l’invente pas.`;
      } else {
        promptSystem += `
Le client a fourni la commande ${orderNumber}, mais elle n’a pas été trouvée. Demande poliment de vérifier l’email ou le numéro.`;
      }
    } catch (err) {
      console.error('Shopify:', err.message);
    }
  }
 
  // ISSUE (produit cassé, SAV)
  if (category === 'issue') {
    promptSystem += `
Le client semble rencontrer un problème avec une commande (article cassé, erreur, etc.).
Invite-le gentiment à fournir son numéro de commande et son e-mail si ce n’est pas encore fait, pour que l’équipe puisse résoudre rapidement la situation.`;
  }
 
  // INFO (conditions générales)
  if (category === 'info') {
    promptSystem += `
Le client pose une question générale sur les conditions de livraison.
Voici les infos standards :
- Traitement des commandes sous 24 à 48h (jours ouvrés)
- Livraison en 2 à 5 jours via La Poste (Lettre Suivie ou Colissimo)
- Suivi fourni par e-mail à l’expédition
 
Réponds clairement sans demander de numéro ou d’e-mail.`;
  }
 
  // Appel à Mistral
  try {
    const { data } = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small',
        messages: [
          { role: 'system', content: promptSystem },
          { role: 'user', content: message }
        ]
      },
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
 
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error('Mistral :', err.message);
    res.status(500).json({ error: 'Erreur Mistral' });
  }
});
 
module.exports = router;