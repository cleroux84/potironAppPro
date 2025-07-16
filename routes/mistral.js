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
 let order= null;
  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (orderNumber && email) {
    try {
       order = await getShopifyOrder(orderNumber, email);
      if (order) {
        console.log("order here", order);
        promptSystem += `
Commande : ${order.name}
Statut    : ${order.status}
Suivi     : ${order.trackingUrl}
 
Utilise ces informations si la question concerne la commande, si un lien de suivi existe, donne le au client: ${order.trackingUrl} le client doit pouvoir cliquer dessus. Ne l'invente pas. Le numéro de suivi doit aussi être donné : ${order.trackingNumber} `;
      
      } else {
        promptSystem += `
Le client a fourni la commande ${orderNumber}, mais je ne l’ai pas trouvée
(vérifie n° ou email).`;
      }
    } catch (err) {
      console.error('Lookup Shopify :', err.message);
    }
  }
 console.log('order1', order);
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
 console.log('order2', order);

    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error('Mistral :', err.message);
    res.status(500).json({ error:'Erreur Mistral' });
  }
});
 
module.exports = router;