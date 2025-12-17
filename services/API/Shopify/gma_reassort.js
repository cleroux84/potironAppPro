const SHOPIFYREASSORTTOKEN = process.env.SHOPIFYREASSORTTOKEN;
const fetch = require('node-fetch');

// new customer webhook to create meta data from notes
const createMetaCustomer = async(clientToUpdate, updatedCustomer) => {
    const updateCustomerUrl = `https://gma-reassort.myshopify.com/admin/api/2024-07/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYREASSORTTOKEN
          },
          body: JSON.stringify(updatedCustomer)
    };
    try {
        const response = await fetch(updateCustomerUrl, updateOptions);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Erreur lors de la création des meta données sur GMA Reassort', error);
    }
}

module.exports = {
    createMetaCustomer
}