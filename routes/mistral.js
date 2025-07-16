const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const router = express.Router();

router.use(cors());
router.use(express.json());

const apiKey = process.env.MISTRAL_API_KEY; 
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const sessionStore = new Map();

router.use(express.json());


// session to memorise 5 last questions
function getSession(req) {
  const sessionId = req.headers['x-session-id'] || req.ip;
  if(!sessionStore.has(sessionId)) {
    sessionStore.set(sessionId, {
      messages: [],
      email: null,
      orderNumber: null,
    });
  }
  return { sessionId, data: sessionStore.get(sessionId) };
}

function updateSession(sessionId, data) {
  sessionStore.set(sessionId, {
    ...sessionStore.get(sessionId),
    ...data
  });
}

 
/* ---------- FONCTION utilitaire ------------- */
async function getShopifyOrder(orderNumber, email) {
  const num  = orderNumber.replace(/^#/, '').trim();
  const mail = email.trim().toLowerCase();
  console.log('PPL', orderNumber);

  const query = `
    query($search: String!) {
      orders(first: 1, query: $search) {
        edges { node {
          name email displayFulfillmentStatus
          fulfillments(first:1){
            trackingInfo{url number}
            estimatedDeliveryAt
          }
        }}
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
  const o = edge.node, f = o.fulfillments[0] || {}, t = (f.trackingInfo||[{}])[0];
  console.log('search', o);
  console.log('dump', JSON.stringify(f, null, 2));
  console.log('lien', t.url);
  
  return {
    name : o.name,
    status : o.displayFulfillmentStatus,
    trackingUrl : t.url || null,
    trackingNumber : t.number || null
  };
}
/* ------------------------------------------- */
 
router.post('/chat', async (req, res) => {
  // let { message, orderNumber, email } = req.body;
  let {message} = req.body;
  const { sessionId, data: session } = getSession(req);
  
  session.messages.push({ role: 'user', content: message });
 /* --- Extraction auto si champs manquants --- */
if (!session.orderNumber) {
  const m = message.match(/#?\d{4,6}/);
  if (m) session.orderNumber = m[0].replace(/^#/, '');
}
 
if (!session.email) {
  const e = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (e) session.email = e[0].toLowerCase();
}
updateSession(sessionId, session);

const demandeSuivi = /\b(où|ou)?\b.*\b(command|colis|suivi|statut|livraison|expédié|expedie|reçu|reception)\b/i.test(message);
 
// Si le client parle de commande mais n’a pas fourni toutes les infos
if (demandeSuivi) {
  if (!session.orderNumber || !session.email) {
    const infosManquantes = [];
    if (!session.orderNumber) infosManquantes.push("le numéro de commande");
    if (!session.email) infosManquantes.push("l’adresse e-mail utilisée lors de l’achat");
 
    const missingPrompt = `Pour vous aider à localiser votre commande, j’ai besoin de ${infosManquantes.join(' et ')}. Merci de me les communiquer.`;
    session.messages.push({ role: 'assistant', content: missingPrompt });
    updateSession(sessionId, session);
    return res.json({ reply: missingPrompt });
  }
}
/* ------------------------------------------- */
  /* 1. Construire le promptSystem de base */
  let promptSystem = `Tu es un assistant du service client (SAV) de la boutique Potiron.
  Ta mission est de répondre brièvement, chaleureusement et uniquement en français, même si la question est en anglais. Tu n’utilises jamais l’anglais dans ta réponse.
  Si le client demande où est sa commande ou des infos sur la livraison, et que les données de suivi sont disponibles, tu les donnes avec un lien HTML cliquable.
  Si les informations sont manquantes (numéro ou mail), tu les demandes poliment.
  N’invente jamais de lien, d’information ou d’étapes de suivi.`;

  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (session.orderNumber && session.email) {
    try {
       const order = await getShopifyOrder(session.orderNumber, session.email);
     if (order) {
      let trackingLine = 'Lien de suivi : non disponible';
      if (order.trackingUrl) {
        trackingLine = `Lien de suivi : <a href="${order.trackingUrl}">${order.trackingUrl}</a>`;
      }
 
  promptSystem += `
  Tu réponds dans la même langue que l'utilisateur. Si ce n’est pas clair, tu parles français.
  N'invente jamais de lien.
  Tu ne dois jamais inventer de lien. Si tu n’as pas de lien fourni explicitement ci-dessus, ne fais pas semblant qu’il existe.
  Le client a fourni une commande : ${order.name}
  Statut actuel : ${order.status}
  ${trackingLine}
  Numéro de suivi : ${order.trackingNumber || 'non disponible'}
 
  Si la question concerne cette commande :
  - Donne les infos utiles.
  - Si le lien de suivi est disponible, donne-le dans un format cliquable
  - Ne l’invente jamais.
  - Même si certaines informations comme le statut sont en anglais (ex: "FULLUFILLED"), traduis-les automatiquement en français dans ta réponse.
  - Sois chaleureux et pro, façon SAV.`;
} else {
        promptSystem += `
Le client a fourni la commande ${session.orderNumber}, mais je ne l’ai pas trouvée
(vérifie n° ou email).`;
      }
    } catch (err) {
      console.error('Lookup Shopify :', err.message);
    }
  }
 
  /* 3. Appel Mistral */
  try {
    const { data } = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small',
        messages: [
          { role: 'system', content: promptSystem },
          // { role: 'user',   content: message }
          ...session.messages.slice(-7)
        ]
      },
      { headers:{ Authorization:`Bearer ${apiKey}` } }
    );
 
const reply = data.choices[0].message.content;
session.messages.push({ role: 'assistant', content: reply });
updateSession(sessionId, session);

res.json({ reply });

  } catch (err) {
    console.error('Mistral :', err.message);
    res.status(500).json({ error:'Erreur Mistral' });
  }
});
 
module.exports = router;