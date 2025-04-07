const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const shopify = require('shopify-api-node');
const fetch = require('node-fetch');
const { getAccessTokenFromDb } = require('../../database/tokens/potiron_shippingbo');
const API_APP_ID = process.env.API_APP_ID;


//Retrieve order and select tagged Afibel
const getAfibelOrders = async () => {
    let accessToken = await getAccessTokenFromDb();
    // const getOrderUrl = `https://app.shippingbo.com/orders?search[joins][order_tags][value__eq]=AFIBEL`;    
    const getOrderUrl = `https://app.shippingbo.com/orders?search[joins][order_tags][value__eq]=BAZARCHIC`;    
    const getOrderOptions = {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          Accept: 'application/json',
          'X-API-VERSION': '1',
          'X-API-APP-ID': API_APP_ID,
          Authorization: `Bearer ${accessToken}`
        },
      };
      try {
        const response = await fetch(getOrderUrl, getOrderOptions);
        const data = await response.json();
        console.log('orders Afibel : ', data.orders || data);
      } catch (error) {
        console.error("Erreur getting Abibel orders from Shippingbo", error);
      }

} 



//create order in Shopify SI FTP fonctionne pas !
const createOrderFromCSV = async () => {
    //Arg with order to create extracted from csv if ok
    console.log('PPL createOrderFromCSV')
    const orderToCreate = {
        order: {
            line_items: [
                {
                    variant_id: 49885847421256,
                    quantity: 2,
                    price: 0,
                    tax_lines : [
                        {
                            price: 0,
                            rate: 0,
                        }
                    ]
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
                city: "Rodez",
                zip: "12000",
                country: "FR"
            },
            billing_addresse : {
                first_name: "Test",
                last_name: "Name",
                address1: "1 rue du test",
                city: "Rodez",
                zip: "12000",
                country: "FR"
            },
            transactions: [
                {
                    kind: "sale",
                    status: "success",
                }
            ],
            total_tax: 0,
            currency: "EUR",
            tags: "afibel_order",
            financial_status: "paid",  
            fulfillment_status: "unfulfilled"
        }
    };
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
        const data = await response.json();
        console.log('order afibel created', data);
      } catch (error) {
        console.error('Error creating order afibel', error.response?.data || error.mesage)
      }
}
module.exports = { createOrderFromCSV, getAfibelOrders }