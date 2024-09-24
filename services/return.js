const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');

const createDiscountCode = async (customerId, totalOrder) => {
    const createPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`
    const nowDate = new Date().toISOString();
    const OneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const discountRule = {
        "price_rule": {
            "title": "Auto from API",
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": `-${(totalOrder / 100).toFixed(2)}`,
            "customer_selection": "prerequisite",
            "prerequisite_customer_ids": [customerId],
            "starts_at": nowDate,
            "ends_at": OneWeekLater,
            "once_per_customer": true,
            "usage_limit": 1,
            "currency": "EUR"
         }
    }
    const createPriceRuleOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        },
        body: JSON.stringify(discountRule)
    };

    // console.log("total", totalOrder);
    try {
        const response = await fetch(createPriceRuleUrl, createPriceRuleOptions);
        if(!response.ok) {
            console.log('error fetching price rules', response)
        }
        const priceRule = await response.json();
        // console.log("created price rules", data);
        const discountCodeUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules/${priceRule.price_rule.id}/discount_codes.json`
        const discountCode = {
            "discount_code": {
                "code": `RETURN-${customerId}`
            }
        }
        const discountCodeOptions = {
            method: 'POST',
            headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
            },
            body: JSON.stringify(discountCode)
        }
        const discountResponse = await fetch(discountCodeUrl, discountCodeOptions);
        if(!discountResponse) {
            console.log('error fetching discount code');
        }
        const discountData = await discountResponse.json();
        return discountData;
        // console.log('Discount code created to record in customer account ? ', discountData)


    } catch (error) {
        console.error('erreur creation code de reduction');
    }
    
}

module.exports = {
    createDiscountCode
}