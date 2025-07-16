const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const router = express.Router();

router.use(cors());
router.use(express.json());

const apiKey = process.env.MISTRAL_API_KEY; 
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;

router.use(express.json());
 
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
  let { message, orderNumber, email } = req.body;
 /* --- Extraction auto si champs manquants --- */
 if (!orderNumber) {
  const m = message.match(/#?\d{4,}/);
  if (m) orderNumber = m[0];
}
if (!email) {
  const e = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (e) email = e[0].toLowerCase();
}
/* ------------------------------------------- */
  /* 1. Construire le promptSystem de base */
  let promptSystem = 'Tu es un assistant SAV et déco de la boutique Potiron. ' +
                     'Réponds brièvement et amicalement.';
  
  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (orderNumber && email) {
    try {
       const order = await getShopifyOrder(orderNumber, email);
      if (order) {
  promptSystem += `
    Le client a fourni une commande : ${order.name}
    Statut actuel : ${order.status}
    
    Lien de suivi (si le client le demande) : ${order.trackingUrl || 'non disponible'}
    Numéro de suivi : ${order.trackingNumber || 'non disponible'}
    
    Si la question concerne cette commande :
    - Donne les infos utiles (statut, suivi, etc.)
    - Si le lien de suivi est disponible, donne-le clairement pour que le client puisse cliquer dessus.
    - Reste naturel, bref et amical (comme un vrai conseiller SAV).`;
    } else {
        promptSystem += `
Le client a fourni la commande ${orderNumber}, mais je ne l’ai pas trouvée
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
          { role: 'user',   content: message }
        ]
      },
      { headers:{ Authorization:`Bearer ${apiKey}` } }
    );
 
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error('Mistral :', err.message);
    res.status(500).json({ error:'Erreur Mistral' });
  }
});
 
module.exports = router;