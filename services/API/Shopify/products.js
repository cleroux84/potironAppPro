// Requests with Shopify API for products

const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');


//Get a product by Sku (PP-)
const getProductWeightBySku = async (sku) => {
  const getProductDetailsUrl = 'https://potiron2021.myshopify.com/admin/api/2024-07/graphql.json';
  const getProductDetailsOptions = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFYAPPTOKEN,
    },
    body: JSON.stringify({
      query: `
        {
          productVariants(first: 1, query: "sku:${sku}") {
            edges {
              node {
                id
                sku
                inventoryItem {
                  id
                  weight
                  weightUnit
                }
                product {
                  id
                  title
                  images(first: 1) {
                    edges {
                      node {
                        url
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
    }),
  };
  try {
    const response = await fetch(getProductDetailsUrl, getProductDetailsOptions);
    if (!response.ok) throw new Error(`Erreur lors de la récupération du produit par SKU : ${response.statusText}`);
    const data = await response.json();
    const productVariant = data.data.productVariants.edges[0]?.node;
    if (!productVariant) {
      console.log("Aucun produit trouvé pour ce SKU");
      return null;
    }

    // Récupérer l'URL correcte de l'image
    const featuredImageUrl = productVariant?.product?.images?.edges[0]?.node?.url || null;

    return {
      ...productVariant,
      featuredImageUrl
    };
  } catch (error) {
    console.error("Erreur lors de la récupération du produit par SKU :", error);
  }
};

module.exports = {
  getProductWeightBySku
};