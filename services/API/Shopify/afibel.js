const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const shopify = require('shopify-api-node');
const fetch = require('node-fetch');
const { getAccessTokenFromDb } = require('../../database/tokens/potiron_shippingbo');
const API_APP_ID = process.env.API_APP_ID;
const fs = require('fs');
const path = require('path');
const {writeToPath} = require('@fast-csv/format');
const { mailCSV } = require('../../sendMails/mailForTeam');
const { getAccessTokenMS365, setAccessTokenMS365, refreshMS365AccessToken } = require('../microsoft');
let Client = require('ssh2-sftp-client');
let sftp = new Client();
let accessToken;
let accessTokenMS365;

//Config SFTP Shippingbo To Send CSV new Orders file
const config = {
    host: process.env.HOST_FTP_SBO,
    port: process.env.PORT_FTP_SBO,
    username: process.env.USERNAME_FTP_SBO,
    password: process.env.PASSWORD_FTP_SBO
}

//Send csv file in shippingbo FTP
const sendCSVToShippingbo = async () => {
    const localPath = path.join(__dirname, 'forwards', 'afibel_orders_08-04.csv')
    const remotePath = `/orders/afibel_orders_08-04.csv`;

    try {
        await sftp.connect(config);
        console.log('Connecté au serveur SFTP');
        await sftp.put(localPath, remotePath);
        console.log(`File send to ${remotePath}` );
        await sftp.end();
        console.log('Sftp closed');

    } catch (error) {
        console.error("Error during sftp transfer", error);        
    }
}



//Retrieve order and select tagged Afibel
const getAfibelOrders = async () => {
    accessToken = await getAccessTokenFromDb();
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
      const allOrders = [];
      let page = 1;
      let keepGoing = true;
      while(keepGoing) {
        const response = await fetch(getOrderUrl, getOrderOptions);
        const data = await response.json();
        if(data.orders && data.orders.length > 0) {
            allOrders.push(...data.orders);
            //TODO no limit to 10 ?
            if(allOrders.length >= 10) {
                allOrders.length = 10;
                keepGoing = false;
            } else {
                page++;
            }
        } else {
            keepGoing = false;
        }
    }
    // console.log('allOrders', allOrders);
    return allOrders;

} 

// Retrieve and select shipments data for each order bt id
const getAfibelTrackings = async (id) => {
    accessToken = await getAccessTokenFromDb();
    const getUrl = `https://app.shippingbo.com/orders/${id}`;
    const getOptions = {
        method: 'GET',
        headers: {
          'Content-type': 'application/json',
          Accept: 'application/json',
          'X-API-VERSION': '1',
          'X-API-APP-ID': API_APP_ID,
          Authorization: `Bearer ${accessToken}`
        },
      };
      const response = await fetch(getUrl, getOptions);
      const data = await response.json();
      console.log("data shipments", data)
      return {
        order_id: data.order.source_ref,
        status: data.order.state,
        created_at: data.order.created_at,
        name: data.order.shipping_address?.fullname,
        tracking_number: data.order.shipments?.[0]?.shipping_ref || '',
        tracking_url: data.order.shipments?[0]?.tracking_url : "",
        carrier: data.order.shipments?[0].carrier_name : '',
        shipped_at: data.order.shipped_at
      }
}

const generateCsv = async () => {
    const orders = await getAfibelOrders();
    await refreshMS365AccessToken();
    accessTokenMS365 = await getAccessTokenMS365();
    // console.log("token ms365", accessTokenMS365);
    // console.log(`${orders.length} commandes Afibel`);
    const result = [];
 
    for (const order of orders) {
        const fullOrder = await getAfibelTrackings(order.id);
        result.push(fullOrder);
        await new Promise(resolve => setTimeout(resolve, 300));
    }
 
    // Export CSV
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const outputPath = path.join(uploadDir, 'afibel_tracking.csv');
    // console.log("Chemin du fichier CSV : ", outputPath);
 
    writeToPath(outputPath, result, { headers: true })
        .on('finish', () => {
            console.log(`CSV exported : ${outputPath}`);
            fs.readFile(outputPath, { encoding: 'base64' }, async (err, fileContent) => {
                if (err) {
                    console.error("Error reading CSV File", err);
                    return;
                }
 
                // console.log("Fichier CSV lu, envoi par email...");
//TODO send to FTP instead of send by mail and REMOVE the file from uploads !
                await mailCSV(accessTokenMS365, fileContent);
                fs.unlink(outputPath, (err) => {
                    if(err) {
                        console.error('Error removing csv fil from uploads dir', err)
                    } else {
                        console.log('CSV file removed');
                    }

                })
            });
        })
        .on('error', (err) => {
            console.error("Error writing CSV File", err);
        });
}


//create order in Shopify SI FTP fonctionne pas !
// const createOrderFromCSV = async () => {
//     //Arg with order to create extracted from csv if ok
//     console.log('PPL createOrderFromCSV')
//     const orderToCreate = {
//         order: {
//             line_items: [
//                 {
//                     variant_id: 49885847421256,
//                     quantity: 2,
//                     price: 0,
//                     tax_lines : [
//                         {
//                             price: 0,
//                             rate: 0,
//                         }
//                     ]
//                 }
//             ],
//             customer: {
//                 first_name: "Test",
//                 last_name: "Name",
//                 email: "test@example.com"
//             },
//             shipping_address: {
//                 first_name: "Test",
//                 last_name: "Name",
//                 address1: "1 rue du test",
//                 city: "Rodez",
//                 zip: "12000",
//                 country: "FR"
//             },
//             billing_addresse : {
//                 first_name: "Test",
//                 last_name: "Name",
//                 address1: "1 rue du test",
//                 city: "Rodez",
//                 zip: "12000",
//                 country: "FR"
//             },
//             transactions: [
//                 {
//                     kind: "sale",
//                     status: "success",
//                 }
//             ],
//             total_tax: 0,
//             currency: "EUR",
//             tags: "afibel_order",
//             financial_status: "paid",  
//             fulfillment_status: "unfulfilled"
//         }
//     };
//     console.log('object to create', orderToCreate)
//     const createUrl = 'https://potiron2021.myshopify.com/admin/api/2025-04/orders.json';
//     const createOptions = {
//         method: 'POST',
//         headers: {             
//           'Content-Type': 'application/json',             
//           'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
//         },
//         body: JSON.stringify(orderToCreate)
//       }
//       try {
//         const response = await fetch(createUrl, createOptions);
//         const data = await response.json();
//         console.log('order afibel created', data);
//       } catch (error) {
//         console.error('Error creating order afibel', error.response?.data || error.mesage)
//       }
// }
// module.exports = { createOrderFromCSV, generateCsv }
module.exports = { generateCsv, sendCSVToShippingbo }
