const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { getShopifyOrder, fetchProducts, fetchAllCollections, generateCollectionLinks, generateProductLinks } = require('../services/API/IA/utilsAI');
require('dotenv').config();
const router = express.Router();

router.use(cors());
router.use(express.json());

const apiKey = process.env.MISTRAL_API_KEY; 
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const sessionStore = new Map();

router.use(express.json());

let productCache = [];
let collectionCache = [];

// session to memorise last questions
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


//Récupère les produits du catalogue



async function refreshProductCache() {
  productCache = await fetchProducts();
}



function getCachedCollections() {
  return collectionCache;
}
function findMatchingCollections(userQuery) {
  const queryWords = userQuery.toLowerCase().split(/\s+/);
  return collectionCache.filter(c => {
    const title = c.title.toLowerCase();
    return queryWords.some(word => title.includes(word));
  });
}


// Lancer au démarrage
refreshProductCache();
fetchAllCollections().then(collections => {
  collectionCache = collections;
});


// Recharger toutes les 6h
setInterval(refreshProductCache, 6 * 60 * 60 * 1000);

async function findProductsWithAI(query) {
  try {
    // On sélectionne un échantillon du catalogue pour ne pas dépasser les limites de contexte
    const candidates = productCache.map(p => ({
      title: p.title,
      // description: p.description || '',
      url: p.url
    }));

  //  console.log('candidates', candidates);
//    console.log("chaises",
//   candidates.filter(p => p.title.toLowerCase().includes('chaise'))
// );

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
    // console.log('📨 Réponse brute de Mistral :\n', raw);

    const matches = JSON.parse(raw);
    return matches;
  } catch (err) {
    console.error('❌ Erreur Mistral (produit matching) :', err.message);
    return [];
  }
}

function shouldSearchProducts(message) {
  const query = message.toLowerCase().replace(/[^\w\s]/g, '');
  const words = query.split(/\s+/);
  const motsUtiles = words.filter(w => !['je', 'veux', 'un', 'une', 'des', 'de', 'le', 'la', 'les', 'du', 'au', 'à', 'est', 'ce', 'cette', 'qui', 'me', 'vous', 'avez', 'tu', 'il', 'elle', 'on'].includes(w));

  return motsUtiles.length > 1;
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

const lowerMessage = message.toLowerCase();


const demandeSuivi = /\b(où est|suivre|statut|livraison|colis|expédiée|envoyée|reçu[e]?)\b/i.test(message);
const isRechercheProduit = /(je cherche|je veux|avez[- ]?vous|vous vendez|j’aimerais|je voudrais|proposez[- ]?vous)/.test(lowerMessage);
const useProductSearch = isRechercheProduit && shouldSearchProducts(message);

// console.log('isRechercheProduit:', isRechercheProduit);
// console.log('message:', message);

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
  const matchingCollections = findMatchingCollections(message);

  // console.log("matchingCollections", matchingCollections);
  // console.log("matchingProducts", matchingProducts);

  let combinedReply = '';

  if (matchingProducts.length > 0) {
    combinedReply += generateProductLinks(matchingProducts, message) + "<br><br>";
  }

  if (matchingCollections.length > 0) {
    combinedReply += generateCollectionLinks(matchingCollections, message);
  }

  if (combinedReply === '') {
    combinedReply = `Désolé, je n’ai trouvé aucun produit ni collection correspondant à "${message}". 😕`;
  }

  session.messages.push({ role: 'assistant', content: combinedReply });
  updateSession(sessionId, session);
  return res.json({ reply: combinedReply });
}


/* ------------------------------------------- */
  /* 1. Construire le promptSystem de base */
 let promptSystem = `Tu es un assistant du service client (SAV) de la boutique Potiron Paris qui vend du mobilier de la décoration d'intérieur (canapé, fauteuil, chaise, luminaire, vase, miroir, etc).

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
 const notFoundMsg = `Je n’ai pas retrouvé de commande correspondant au numéro **${session.orderNumber}** et à l’e-mail **${session.email}**. 
Merci de vérifier les informations et de me les renvoyer.`;

  session.messages.push({ role: 'assistant', content: notFoundMsg });
  updateSession(sessionId, session);
  return res.json({ reply: notFoundMsg });
      }
    } catch (err) {
      console.error('Lookup Shopify :', err.message);
    }
  }

const collections = getCachedCollections();
const collectionDescriptions = collections.map(c => `- ${c.title} : ${c.url}`).join('\n');

promptSystem += `

Voici les collections disponibles sur le site Potiron :
${collectionDescriptions}

🧠 Instructions importantes :
⛔️ Tu ne dois jamais proposer une collection ou un lien si tu n’en as pas reçu la liste.
⛔️ Tu ne dois jamais inventer le nom ou le lien d’une collection.
✅ Si tu veux parler d’une collection, utilise uniquement les liens et titres fournis par le système ou les messages précédents.

- Si la demande du client correspond à une ou plusieurs collections, propose les liens HTML exacts vers ces collections.
- Utilise le format suivant pour insérer un lien : <a href="https://URL" target="_blank">Nom de la collection</a>
- Ne dis jamais "cliquez ici" sans inclure un vrai lien.
- Ne fais pas de liens imaginaires : utilise seulement les URLs ci-dessus.
- Tu peux proposer plusieurs collections si besoin.
`;


 
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