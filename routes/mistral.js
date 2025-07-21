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
  let promptSystem = `Tu es un assistant du service client de la boutique Potiron.

Ta mission est :
- de répondre chaleureusement et brièvement, uniquement en français, même si le client écrit en anglais.
- de ne jamais inventer d'informations : si tu ne sais pas, dis-le.
- de ne JAMAIS inventer de lien de suivi ou d'étape de livraison.

Voici les règles obligatoires :

1. Tu NE DONNES DES INFORMATIONS DE COMMANDE QUE si le client a fourni :
   - un numéro de commande valide
   - ET une adresse e-mail
   - ET que ces deux informations correspondent à une commande retrouvée.

2. Si tu n’as pas ces deux éléments ou si la commande n’a pas été trouvée, tu demandes poliment les informations manquantes, sans jamais rien supposer.

3. Si la commande est trouvée :
   - Tu indiques son **statut**, en le traduisant en français si besoin.
   - Tu donnes le **numéro de suivi** s’il est disponible.
   - Tu donnes le **lien de suivi** uniquement s’il est disponible. Tu ne dois **jamais** en inventer un.
   - Le lien doit être cliquable, formaté en HTML avec la balise <a href="...">Suivre la livraison</a>.

4. Si une information est indisponible, indique-le simplement (“le lien de suivi n’est pas encore disponible”, etc.), sans inventer.

Tu réponds toujours comme un assistant humain sympathique, clair et professionnel. Tu ne signes jamais les messages.`;

  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (session.orderNumber && session.email) {
    try {
       const order = await getShopifyOrder(session.orderNumber, session.email);
     if (order) {
        const trackingLine = order.trackingUrl
    ? `Lien de suivi : <a href="${order.trackingUrl}" target=_blank>Suivre la livraison</a>`
    : "Aucun lien de suivi n'est disponible actuellement";
 
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