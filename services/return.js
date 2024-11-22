const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const API_APP_WAREHOUSE_ID = process.env.API_APP_WAREHOUSE_ID;
const Shopify = require('shopify-api-node');
const fetch = require('node-fetch');
const { getshippingDetails } = require('./API/Shippingbo/Gma/ordersCRUD');

const createPriceRule = async (customerId, orderName, totalOrder) => {
    const createPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`
    const nowDate = new Date().toISOString();
    const currentDate = new Date();
    // const OneWeekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    currentDate.setMonth(currentDate.getMonth() + 3);
    const endsDiscountThreeMonths = currentDate.toISOString();
    const discountRule = {
        "price_rule": {
            "title": `Retour auto ${orderName}`,
            "target_type": "line_item",
            "target_selection": "all",
            "allocation_method": "across",
            "value_type": "fixed_amount",
            "value": `-${totalOrder}`,
            "customer_selection": "prerequisite",
            "prerequisite_customer_ids": [customerId],
            "starts_at": nowDate,
            "ends_at": endsDiscountThreeMonths,
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

    try {
        const response = await fetch(createPriceRuleUrl, createPriceRuleOptions);
        if(!response.ok) {
            console.log('error fetching price rules', response)
        } else {
            const priceRule = await response.json();
            return await createDiscountCode(orderName, priceRule, discountRule);
        }
    } catch (error) {
        console.error('error creating price rules', error);
    }
    
}

const createDiscountCode = async (orderName, priceRule, discountRule) => {
    const discountCodeUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules/${priceRule.price_rule.id}/discount_codes.json`
    const discountCode = {
        "discount_code": {
            "code": `RETURN${orderName}-${Math.floor(1000 + Math.random() * 9000)}`
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
    try {
        const discountResponse = await fetch(discountCodeUrl, discountCodeOptions);
        if(!discountResponse) {
            console.log('error fetching discount code');
        }
        const discountData = await discountResponse.json();
        return {
            discountData: discountData,
            discountRule: discountRule
        }
    } catch (error) {
        console.error('Error creating discount code', error);
    }
}

const checkIfPriceRuleExists = async (orderName) => {
    const checkPriceRuleUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules.json`;
    const checkPriceRuleOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        }
    }
    try {
        const response = await fetch(checkPriceRuleUrl, checkPriceRuleOptions);
        if(response.ok) {
            const data = await response.json();
            const existingRule = data.price_rules.find(
                rule => rule.title === `Retour auto ${orderName}`
            );
            return existingRule ? true : false;
        } else {
            console.log('Error checking if price rule exists');
        }
    } catch (error) {
        console.error("Error checking price rule exists", error);
    }
}

//function to find if a discount code has been used
const checkDiscountCodeUsage = async (priceRuleId, discountCodeId) => {
    const discountUrl = `https://potiron2021.myshopify.com/admin/api/2024-07/price_rules/${priceRuleId}/discount_codes/${discountCodeId}.json`
    const discountOptions = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        }
    }
    try {
        const response = await fetch(discountUrl, discountOptions);
        const data = await response.json();
        let isUsed;
        if(data.discount_code.usage_count === 0) {
            isUsed = false;
        } else {
            isUsed = true;
        }
        return isUsed;
    } catch (error) {
        
    }
}

//calcule si le délai de rétractation de 15 jours à compter de la livraison est dépassé
const isReturnableDate = async (deliveryDate) => {
    let isReturnable;
    const closeOrderDeliveryDate = new Date(deliveryDate);
    const currentDate = new Date();
    const differenceInTime = currentDate - closeOrderDeliveryDate;
    const differenceInDays = differenceInTime / (1000 * 60 * 60 * 24);
    if(Math.abs(differenceInDays) <= 15) {
      isReturnable = true;
    } else {
      isReturnable = false;
    }
    return isReturnable;
}

module.exports = {
    createPriceRule,
    checkIfPriceRuleExists,
    isReturnableDate,
    checkDiscountCodeUsage
}