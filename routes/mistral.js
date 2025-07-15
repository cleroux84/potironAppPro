const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();
const router = express.Router();

router.use(cors());
router.use(express.json());

const apiKey = process.env.MISTRAL_API_KEY; 
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;

rrouter.use(express.json());
 
/* ---------- FONCTION utilitaire ------------- */
async function getShopifyOrder(orderNumber, email) {
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
  const variables = { search: `name:${orderNumber} AND email:${email}` };
 
  const { data } = await axios.post(
    'https://potiron.myshopify.com/admin/api/2024-01/graphql.json',
    { query, variables },
    { headers: { 'X-Shopify-Access-Token': SHOPIFYAPPTOKEN } }
  );
 
  const edge = data.data.orders.edges[0];
  if (!edge) return null;
  const o = edge.node, f = o.fulfillments[0] || {}, t = (f.trackingInfo||[{}])[0];
  console.log('search', o);
  return {
    name : o.name,
    status : o.displayFulfillmentStatus,
    trackingUrl : t.url || null,
    trackingNumber : t.number || null,
    eta : f.estimatedDeliveryAt || null,
  };
}
/* ------------------------------------------- */
 
router.post('/chat', async (req, res) => {
  const { message, orderNumber, email } = req.body;
 
  /* 1. Construire le promptSystem de base */
  let promptSystem = 'Tu es un assistant SAV et déco de la boutique Potiron. ' +
                     'Réponds brièvement et amicalement.';
 
  /* 2. Si le client a fourni n° + email, on ajoute l’info commande */
  if (orderNumber && email) {
    try {
      const order = await getShopifyOrder(orderNumber, email);
      if (order) {
        promptSystem += `
Commande : ${order.name}
Statut    : ${order.status}
Suivi     : ${order.trackingUrl || '—'}
Livraison estimée : ${order.eta || '—'}
 
Utilise ces informations si la question concerne la commande.`;
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