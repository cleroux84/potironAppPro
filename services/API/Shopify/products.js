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
        query {
          products(first: 1, query: "sku:${sku}") {
            edges {
              node {
                id
                title
                variants(first: 1, query: "sku:${sku}") {
                  edges {
                    node {
                      id
                      sku
                      weight
                      price
                    }
                  }
                }
                featuredImage {
                  url
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
    const product = data.data.products.edges[0]?.node;
 
    if (!product || !product.variants.edges[0]) {
      console.log("Aucun produit trouvé pour ce SKU");
      return null;
    }
 
    const productVariant = product.variants.edges[0].node;
    return {
      id: productVariant.id,
      sku: productVariant.sku,
      weight: productVariant.weight,
      price: productVariant.price,
      title: product.title,
      featuredImage: product.featuredImage ? product.featuredImage.url : null,
    };
 
  } catch (error) {
    console.error("Erreur lors de la récupération du produit par SKU :", error);
  }
};

  module.exports = {
    getProductWeightBySku
  }
