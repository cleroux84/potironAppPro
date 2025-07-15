const express = require('express');
const axios   = require('axios');
const router  = express.Router();
router.use(express.json());
 
const apiKey          = process.env.MISTRAL_API_KEY;
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
 
/* ------- util ------- */
async function getShopifyOrder(orderNumber, email) {
  const num  = orderNumber.replace(/^#/, '').trim();
  const mail = email.trim().toLowerCase();
 
  const q = `
    query($search:String!){
      orders(first:1, query:$search){
        edges{node{
          name displayFulfillmentStatus
          fulfillments(first:1){
            trackingInfo{url number}
            estimatedDeliveryAt
          }
        }}
      }
    }`;
  const vars = { search:`(name:#${num} OR order_number:${num}) AND email:${mail}` };
 
  const { data } = await axios.post(
    'https://potiron2021.myshopify.com/admin/api/2024-01/graphql.json',
    { query:q, variables:vars },
    { headers:{'X-Shopify-Access-Token':SHOPIFYAPPTOKEN}}
  );
 
  const edge = data.data.orders.edges[0];
  if (!edge) return null;
  const o = edge.node, f = o.fulfillments[0] || {}, t = (f.trackingInfo||[{}])[0];
 
  return {
    name   : o.name,
    status : o.displayFulfillmentStatus,        // ex FULFILLED
    url    : t.url || null,
    eta    : f.estimatedDeliveryAt || null
  };
}
/* -------------------- */
 
router.post('/chat', async (req, res) => {
  let { message, orderNumber, email } = req.body;
 
  /* extraction auto si besoin */
  if (!orderNumber) {
    const m = message.match(/#?\d{4,}/);
    if (m) orderNumber = m[0];
  }
  if (!email) {
    const e = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (e) email = e[0].toLowerCase();
  }
 
  /* ---- CAS 1 : on a n° + mail -> réponse SAV directe ---- */
  if (orderNumber && email) {
    try {
      const ord = await getShopifyOrder(orderNumber, email);
      if (ord) {
        const reply =
          `Suivi de votre colis : ${ord.url ?? 'non disponible'}\n` +
          `Statut : ${ord.status.toLowerCase()}` +
          (ord.eta ? ` — livraison estimée le ${new Date(ord.eta).toLocaleDateString('fr-FR')}` : '');
        return res.json({ reply });          // ⬅️ on NE passe PAS par Mistral
      }
      return res.json({ reply: "Je ne trouve pas cette commande. Vérifiez le numéro ou l'e‑mail." });
    } catch (err) {
      console.error('Lookup Shopify :', err.message);
      return res.status(500).json({ reply:"Erreur de consultation Shopify." });
    }
  }
 
  /* ---- CAS 2 : question générale -> on laisse Mistral répondre ---- */
  const promptSystem =
    "Tu es un assistant SAV et déco de la boutique Potiron. " +
    "Réponds brièvement et amicalement.";
 
  try {
    const { data } = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model:'mistral-small',
        messages:[
          { role:'system', content: promptSystem },
          { role:'user',   content: message }
        ]
      },
      { headers:{ Authorization:`Bearer ${apiKey}`}}
    );
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error('Mistral :', err.message);
    res.status(500).json({ reply:"Erreur Mistral." });
  }
});
 
module.exports = router;