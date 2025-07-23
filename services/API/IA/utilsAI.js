const axios = require('axios');
require('dotenv').config();
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;


//Find details Shopify order with orderNumber and email for tracking answer 
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

//Get all products available
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
          ...(nextPageInfo ? { page_info: nextPageInfo } : {})
        }
      });

      const products = response.data.products || [];
      allProducts.push(...products);

      const linkHeader = response.headers.link;
      const nextMatch = linkHeader?.match(/<([^>]+)>; rel="next"/);

      if (nextMatch) {
        const url = new URL(nextMatch[1]);
        nextPageInfo = url.searchParams.get("page_info");
      } else {
        nextPageInfo = null;
      }

    } while (nextPageInfo);

    console.log(`🛍️ Catalogue complet chargé ici : ${allProducts.length} produits`);
    return allProducts
    .filter(p => p.status === 'active' && p.published_at) 
    .filter(p => p.variants?.some(v => v.inventory_quantity > 0))
    .map(p => ({
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

//Get all collections
async function fetchAllCollections() {
  const headers = {
    'X-Shopify-Access-Token': process.env.SHOPIFYAPPTOKEN,
    'Content-Type': 'application/json',
  };

  try {
    //Smart collections (automatic)
    const smartRes = await axios.get(
      'https://potiron2021.myshopify.com/admin/api/2024-01/smart_collections.json',
      { headers }
    );
    const smartCollections = smartRes.data.smart_collections || [];

    // Custom collections (manual)
    const customRes = await axios.get(
      'https://potiron2021.myshopify.com/admin/api/2024-01/custom_collections.json',
      { headers }
    );
    const customCollections = customRes.data.custom_collections || [];

    const allCollections = [...smartCollections, ...customCollections].map(c => ({
      id: c.id,
      title: c.title,
      handle: c.handle,
      url: `https://potiron2021.myshopify.com/collections/${c.handle}`
    }));

    return allCollections;
  } catch (err) {
    console.error('❌ Erreur lors du fetch des collections :', err.message);
    return [];
  }
}

function generateCollectionLinks(collections, query) {
  console.log('generate collection')
  if (collections.length === 0) {
    return `Désolé, je n'ai trouvé aucune collection correspondant à ${query} !`;
  }

  let reply = `Voici quelques collections qui pourraient vous intéresser :<br><ul>`;
  reply += collections.map(c =>
    `<li><a href="${c.url}" target="_blank">${c.title}</a></li>`
  ).join('');
  reply += `</ul>`;
  return reply;
}

function generateProductLinks(products, query) {
  if (products.length === 0) {
    return `Désolé, je n’ai trouvé aucun produit correspondant à "${query}". 😕`;
  }

  const limited = products.slice(0, 3);
  let reply = `Voici quelques produits qui pourraient vous intéresser :<br><ul>`;
  reply += limited.map(p =>
    `<li><a href="${p.url}" target="_blank">${p.title}</a></li>`
  ).join('');
  reply += `</ul>`;
  return reply;
}

module.exports = { getShopifyOrder, fetchProducts, fetchAllCollections, generateCollectionLinks, generateProductLinks };

