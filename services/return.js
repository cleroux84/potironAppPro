const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');

const createDiscountCode = async (customerId, totalOrder) => {
    const createDiscountUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`
    const createDiscountOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        },
    };
    const nowDate = new Date().toISOString();
    const OneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const discountTest = {
        "price_rule": {
            "title": "Test from API",
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": "-20.0", // Montant de la réduction en euros
            "customer_selection": "prerequisite",
            "prerequisite_customer_ids": [customerId],
            "starts_at": nowDate,
            "ends_at": OneWeekLater,
            "currency": "EUR"
         }
    }
    console.log("total", totalOrder);
    const response = await fetch(createDiscountUrl, createDiscountOptions);
    const data = await response.json();
    console.log("created price rules", data);
}

module.exports = {
    createDiscountCode
}