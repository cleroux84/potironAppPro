// Requests with Shopify API for customers
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');

//Get order to return with customers Id 
const orderById = async (orderName, orderMail, customerId) => {
    console.log("commande recherchée", orderName);
    const orderUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${customerId}/orders.json?status=any`;
    const orderOptions = {
      method: 'GET',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      }
    }
    try {
      const response = await fetch(orderUrl, orderOptions);
      let myOrderData;
      if(!response.ok) {
        console.log(`Error fetching order by name : ${response.statusText}`);
      }
      const ordersData = await response.json();
      if (ordersData) {
        myOrderData = ordersData.orders.find(order => order.name === orderName);
      }
      return myOrderData;
    } catch (error) {
      console.error('Error tor retrieve order by name', error);
    }
}

//Update (more thant create) a customer to become PRO if comes from professional space form
const createProCustomer = async (clientToUpdate, updatedCustomerData) => {
    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
          },
          body: JSON.stringify(updatedCustomerData)
    };
    try {
        const response = await fetch(updateCustomerUrl, updateOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de la mise à jour du client pro', error);
    }
}

//Update Customer
const updateProCustomer = async (clientId, updatedData) => {
    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
      },
      body: JSON.stringify(updatedData)
    };
  
    try {
      const response = await fetch(updateCustomerUrl, updateOptions);
      const updatedClient = await response.json();
      return updatedClient;
    } catch (error) {
      console.error('Error updating client data:', error);
      throw error; // Propager l'erreur pour une gestion ultérieure
    }
};

//METAFIELDS
//Get metafields for a customer
const getCustomerMetafields = async (clientId) => {
    const metafieldsUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${clientId}/metafields.json`;
    const fetchOptions = {         
        method: 'GET',         
        headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        }
    };
    
    try {
        const response = await fetch(metafieldsUrl, fetchOptions);
        const data = await response.json();
        if (data.metafields) {
        return data.metafields;
        }
    } catch (error) {
        console.error('Error fetching metafields:', error);
        throw error; 
    }
};

    //Delete metafields of a customer
const deleteMetafield = async (customerId, metafieldId) => {
    const deleteUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/customers/${customerId}/metafields/${metafieldId}.json`;
    const deleteOptions = {
        method: 'DELETE',
        headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
        }
    };
    
    try {
        const response = await fetch(deleteUrl, deleteOptions);
        if (response.ok) {
        console.log(`Metafield ${metafieldId} supprimé avec succès.`);
        } else {
        console.error(`Erreur lors de la suppression du metafield ${metafieldId}:`, response.statusText);
        }
    } catch (error) {
        console.error('Erreur lors de la suppression du metafield:', error);
    }
};

module.exports = {
    orderById,
    createProCustomer,
    updateProCustomer,
    getCustomerMetafields,
    deleteMetafield
}