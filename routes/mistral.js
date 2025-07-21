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

let productCache = [];

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
//Récupère une commande 
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

//Récupère les produits du catalogue
async function fetchProducts() {
  const allProducts = [];
  let nextPageInfo = null;

  try {
    do {
      const response = await axios.get('https://potiron2021.myshopify.com/admin/api/2024-01/products.json', {
        headers: {
          'X-Shopify-Access-Token': SHOPIFYAPPTOKEN,
          'Content-Type': 'application/json'
        },
        params: {
          limit: 250,
           published_status: 'published',
          ...(nextPageInfo ? { page_info: nextPageInfo } : {})
        }
      });

      const products = response.data.products || [];
      allProducts.push(...products);

      // Lire le header Link pour pagination
      const linkHeader = response.headers.link;
      const nextMatch = linkHeader?.match(/<([^>]+)>; rel="next"/);

      if (nextMatch) {
        const url = new URL(nextMatch[1]);
        nextPageInfo = url.searchParams.get("page_info");
      } else {
        nextPageInfo = null;
      }

    } while (nextPageInfo);

    console.log(`🛍️ Catalogue complet chargé : ${allProducts.length} produits`);
    return allProducts.map(p => ({
      id: p.id,
      title: p.title,
      tags: p.tags ? p.tags.split(',').map(tag => tag.trim().toLowerCase()) : [],
      handle: p.handle,
      description: p.body_html,
      image: p.image?.src || null,
      url: `https://potiron2021.myshopify.com/products/${p.handle}`
    }));

  } catch (error) {
    console.error('❌ Erreur récupération produits Shopify :', error.message);
    return [];
  }
}

function normalizeWord(word) {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^\w\s]/g, '') // ponctuation
    .replace(/(es|s|e)$/, ''); // simplifieur de fin
}

function normalizeAll(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '');
}


async function refreshProductCache() {
  console.log('lauch fetch products');
  productCache = await fetchProducts();
  console.log(`🛍️ Catalogue Shopify chargé : ${productCache.length} produits`);
}

// Lancer au démarrage
refreshProductCache();

// Recharger toutes les 6h
setInterval(refreshProductCache, 6 * 60 * 60 * 1000);

async function findProductsWithAI(query) {
  try {
    // On sélectionne un échantillon du catalogue pour ne pas dépasser les limites de contexte
    const candidates = productCache.slice(0, 100).map(p => ({
      title: p.title,
      // description: p.description || '',
      url: p.url
    }));

   console.log('candidates', candidates)

    const { data } = await axios.post(
      'https://api.mistral.ai/v1/chat/completions',
      {
        model: 'mistral-small',
        messages: [
          {
            role: 'system',
            content: `Voici une liste de produits (titre + description). Donne uniquement ceux qui correspondent à la recherche : "${query}". Réponds avec un JSON d’objets : [{ "title": ..., "url": ... }]. Ne réponds rien si aucun match.`
          },
          {
            role: 'user',
            content: JSON.stringify(candidates)
          }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      }
    );

    const raw = data.choices[0].message.content;
    console.log('📨 Réponse brute de Mistral :\n', raw);

    const matches = JSON.parse(raw);
    return matches;
  } catch (err) {
    console.error('❌ Erreur Mistral (produit matching) :', err.message);
    return [];
  }
}




function generateProductLinks(products, query) {
  if (products.length === 0) {
    return `Désolé, je n’ai trouvé aucun produit correspondant à "${query}". 😕`;
  }

  let reply = `Voici quelques produits qui pourraient vous intéresser :<br><ul>`;
  reply += products.map(p =>
    `<li><a href="${p.url}" target="_blank">${p.title}</a></li>`
  ).join('');
  reply += `</ul>`;
  return reply;
}


/* ------------------------------------------- */
 
router.post('/chat', async (req, res) => {
  // let { message, orderNumber, email } = req.body;
  let {message} = req.body;
  const { sessionId, data: session } = getSession(req);
  
  session.messages.push({ role: 'user', content: message });
 /* --- Extraction auto si champs manquants --- */
const orderMatch = message.match(/#?\d{4,6}/);
if (orderMatch) {
  const newOrderNumber = orderMatch[0].replace(/^#/, '');
  if (newOrderNumber !== session.orderNumber) {
    session.orderNumber = newOrderNumber;
    session.messages = []; 
  }
}

const emailMatch = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
if (emailMatch) {
  const newEmail = emailMatch[0].toLowerCase();
  if (newEmail !== session.email) {
    session.email = newEmail;
  }
}
updateSession(sessionId, session);

// const demandeSuivi = /\b(où|ou)?\b.*\b(command|colis|suivi|statut|livraison|expédié|expedie|reçu|reception)\b/i.test(message);
 const demandeSuivi = /\b(où est|suivre|statut|livraison|colis|expédiée|envoyée|reçu[e]?)\b/i.test(message);
// --- Détection d'intention produit ---
const isRechercheProduit = /\b(avez[- ]?vous|proposez[- ]?vous|je cherche|est[- ]?ce que vous avez|vous vendez).*\b(chaise|canapé|vase|table|décoration|meuble|produit|article|coussin|lampe|miroir|tapis|rideau|buffet|console|tabouret)\b/i.test(message);



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
} else if (isRechercheProduit) {
  const matchingProducts = await findProductsWithAI(message);
  const productReply = generateProductLinks(matchingProducts, message);

  session.messages.push({ role: 'assistant', content: productReply });
  updateSession(sessionId, session);
  return res.json({ reply: productReply });
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

✅ Tu peux répondre à une recherche de produit UNIQUEMENT si :
- Le client a demandé un produit 


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
          ...session.messages.slice(-10)
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