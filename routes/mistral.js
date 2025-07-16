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
 
// Si la demande semble concerner une commande MAIS infos manquantes
if (demandeSuivi && (!session.orderNumber || !session.email)) {
  const infosManquantes = [];
  if (!session.orderNumber) infosManquantes.push("le numéro de commande");
  if (!session.email) infosManquantes.push("l’adresse e-mail utilisée lors de l’achat");
 
  const missingPrompt = `Pour vous aider à localiser votre commande, j’ai besoin de ${infosManquantes.join(' et ')}. Merci de me les communiquer`;
  return res.json({ reply: missingPrompt });
}
/* ------------------------------------------- */
  /* 1. Construire le promptSystem de base */
  let promptSystem = 'Tu es un assistant SAV et déco de la boutique Potiron. ' +
                     'Réponds brièvement et amicalement.' + 
                     'Le client peut demander des informations sur sa commande avec des phrases comme : "Où est ma commande ?", "Quand vais-je recevoir mon colis ?", "Puis-je avoir un suivi ?"' +
                     'Si les données de suivi sont disponibles, donne-les avec un lien cliquable.' + 
                     "Si les informations sont manquantes, explique-lui poliment que tu as besoin de son numéro de commande et de l'adresse e-mail utilisée lors de l'achat." + 
                     "Si tu donnes un lien, sois sûr qu'il existe, n'invente pas d'url et mets toujours un lien cliquable dans une balise a avec un href";
  
  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (session.orderNumber && session.email) {
    try {
       const order = await getShopifyOrder(session.orderNumber, session.email);
     if (order) {
  const trackingLine = order.trackingUrl
    ? `Lien de suivi : ${order.trackingUrl}`
    : 'Lien de suivi : non disponible';
 
  promptSystem += `
  Parle en français !
Le client a fourni une commande : ${order.name}
Statut actuel : ${order.status}
${trackingLine}
Numéro de suivi : ${order.trackingNumber || 'non disponible'}
 
Si la question concerne cette commande :
- Donne les infos utiles.
- Si le lien de suivi est disponible, donne-le dans un format cliquable.
- Ne l’invente jamais.
- Même si certaines informations comme le statut sont en anglais (ex: "FULLUFILLED"), traduis-les automatiquement en français dans ta réponse.
- Quand tu communiques le lien au client, écris-le avec une balise HTML cliquable comme : <a href="URL" target="_blank">Suivre la livraison</a>.
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