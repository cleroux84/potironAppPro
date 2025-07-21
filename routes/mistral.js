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
 let promptSystem = `Tu es un assistant du service client (SAV) de la boutique Potiron Paris.

Ta mission :
- Répondre brièvement, chaleureusement, et uniquement en français, même si le client écrit en anglais.
- Ne jamais inventer d'information. Si tu ne sais pas, dis-le, et propose au client de contacter le service client.
- Ne jamais inventer de lien de suivi ou de statut de commande.

⛔️ Tu NE DOIS PAS répondre à une demande de suivi de commande si les deux éléments suivants ne sont pas fournis et valides :
1. Un numéro de commande
2. Une adresse e-mail

✅ Tu peux répondre à une demande de suivi UNIQUEMENT si :
- Le client a demandé à suivre sa commande (il mentionne livraison, statut, suivi, etc.)
- Il a fourni un numéro de commande ET une adresse e-mail
- La commande correspondante est retrouvée

---

Si la commande est retrouvée :
- Donne son statut (et traduis-le en français si besoin)
- Donne le numéro de suivi s’il est disponible
- Donne le lien de suivi UNIQUEMENT s’il est disponible (et seulement s’il est fourni dans les données)
  → Format du lien : <a href="URL" target=_blank>Suivre la livraison</a>
- Si l'information n'est pas disponible (statut ou lien), indique-le poliment, sans rien inventer

Si la commande n’est **pas retrouvée**, ou si une information est **manquante**, demande-la poliment au client.

Ne signe jamais tes messages. Tu t’exprimes comme un humain sympathique, professionnel et clair.`;



  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (session.orderNumber && session.email) {
    try {
       const order = await getShopifyOrder(session.orderNumber, session.email);
     if (order) {
        const trackingLine = order.trackingUrl
    ? `Lien de suivi : <a href="${order.trackingUrl}" target=_blank>Suivre la livraison</a>`
    : "Aucun lien de suivi n'est disponible actuellement";
 
  promptSystem += `

Commande retrouvée :
- Numéro : ${order.name}
- Statut : ${order.status}
- Numéro de suivi : ${order.trackingNumber || 'non disponible'}
- ${order.trackingUrl ? `Lien de suivi : <a href="${order.trackingUrl}" target=_blank>Suivre la livraison</a>` : "Aucun lien de suivi disponible"}

Important :
- Ne donne ces informations que si le client a bien demandé le suivi de commande.
- Ne transforme jamais ces données. Utilise exactement ce qui est fourni ici.
- Si une info est absente (ex: pas de lien), indique-le clairement, sans jamais inventer ou deviner.
- Traduis les statuts anglais automatiquement si besoin.`;

} else {
promptSystem += `
Le client a fourni un numéro de commande (${session.orderNumber}), mais aucune commande correspondante n’a été trouvée avec l’e-mail indiqué (${session.email}). 
Informe-le poliment que la commande n’a pas été retrouvée, et invite-le à vérifier les informations.`;

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