// Requests with Shopify API for orders

const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');

//Get order by id
const getOrderByShopifyId = async (orderId) => {
    const getOrderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/orders/${orderId}.json`;
    const getOrderOptions = {
      method: 'GET',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      },
    }
    try {
      const response = await fetch(getOrderUrl, getOrderOptions);
      const data = await response.json();
      return data;
    } catch (error) {
      
    }
  }

// update order
const updateOrder =  async (tagsToAdd, orderId) => {
    const updateUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/orders/${orderId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      },
      body: JSON.stringify(tagsToAdd)
    };
    try {
      const response = await fetch(updateUrl, updateOptions);
      const data = await response.json();
      console.log('Order updated with tags for future discount code', data)
    } catch (error) {
      console.error('error updating order with tags for future discount code', orderId);
    }
  }
  module.exports = {
    getOrderByShopifyId,
    updateOrder
  }