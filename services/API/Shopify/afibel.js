const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const shopify = require('shopify-api-node');
const fetch = require('node-fetch');

//create order
const createOrderFromCSV = async () => {
    //Arg with order to create extracted from csv if ok
    console.log('PPL createOrderFromCSV')
    const orderToCreate = {
        order: {
            line_items : [
                {
                    sku: "PP-24300610",
                    quantity: 2
                }
            ],
            customer: {
                first_name: "Test",
                last_name: "Name",
                email: "test@example.com"
            },
            shipping_address: {
                first_name: "Test",
                last_name: "Name",
                address1: "1 rue du test",
                city: "Test",
                zip: "12000",
                country: "FR"
            },
            transactions: [
                {
                    kind: "sale",
                    status: "success",
                    amount: 100.00
                }
            ],
            total_tax: 10.00,
            currency: "EUR",
            tags_to_add: ["afibel_order"]
        }
    }
    console.log('object to create', orderToCreate)
    const createUrl = 'https://potiron2021.myshopify.com/admin/api/2025-04/orders.json';
    const createOptions = {
        method: 'POST',
        headers: {             
          'Content-Type': 'application/json',             
          'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
        },
        body: JSON.stringify(orderToCreate)
      }
      try {
        const response = await fetch(createUrl, createOptions);
        console.log('order afibel created', response.data);
      } catch (error) {
        console.error('Error creating order afibel', error.response?.data || error.mesage)
      }
}
module.exports = { createOrderFromCSV }