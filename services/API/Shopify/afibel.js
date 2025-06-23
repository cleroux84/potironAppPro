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
let sftpSbo = new Client(); // SFTP Shippingbo
let sftpAfibel = new Client(); //SFTP Afibel
let accessToken;
let accessTokenMS365;

//Config SFTP Shippingbo To Send CSV new Orders file
const configSbo = {
    host: process.env.HOST_FTP_SBO,
    port: process.env.PORT_FTP_SBO,
    username: process.env.USERNAME_FTP_SBO,
    password: process.env.PASSWORD_FTP_SBO
}

//Config SFTP Afibel 
const configAfibel = {
    host: process.env.HOST_FTP_AFIBEL,
    port: process.env.PORT_FTP_AFIBEL,
    username: process.env.USERNAME_FTP_AFIBEL,
    password: process.env.PASSWORD_FTP_AFIBEL
}

//Send csv file in shippingbo FTP
const sendCSVToShippingbo = async (localPath, fileName) => {
    // const localPath = path.join(__dirname, 'forwards', 'afibel_orders_08-04.csv')
    // const remotePath = `/orders/afibel_orders_08-04.csv`;
    const remotePath = `/orders/${fileName}`;
    try {
        await sftpSbo.connect(configSbo);
        console.log('Connecté au serveur SFTP Shippingbo');
        await sftpSbo.put(localPath, remotePath);
        console.log(`File send to ${remotePath}` );
        await sftpSbo.end();
        console.log('Sftp closed');

        //Remove file
        fs.unlinkSync(localPath);

    } catch (error) {
        console.error("Error during sftp transfer", error);     
        try {await sftpSbo.end(); } catch {}   
    }
}

//Get new orders file from Afibel sftp
const getNewOrdersFile = async () => {
    // console.log('FUNCTION TO RETRIEVE NEW ORDERS FILE AFIBEL SFTP');
    try {
        await sftpAfibel.connect(configAfibel);
        console.log("Connected to Afibel Sftp");

        const remoteFiles = await sftpAfibel.list('/IN');
        const afibelFile = remoteFiles.find(file => file.name.startsWith('new_orders_afibel'));

        if(!afibelFile) {
            console.log('No file in Afibel IN folder');
            await sftpAfibel.end();
            return;
        }

        const remoteAfibelPath = `/IN/${afibelFile.name}`;
        const localPath = path.join(__dirname, 'forwards', afibelFile.name);
        await sftpAfibel.get(remoteAfibelPath, localPath);
        console.log(`file from Afibel ${afibelFile.name}`);
        await sftpAfibel.end()

        await sendCSVToShippingbo(localPath, afibelFile.name);

    } catch (error) {
        console.error('error getting file from Afibel SFTP', error);
        try { await sftpAfibel.end(); } catch {}
    }
}


//Retrieve order and select tagged Afibel
const getAfibelOrders = async () => {
    accessToken = await getAccessTokenFromDb();
    const getOrderUrl = `https://app.shippingbo.com/orders?search[joins][order_tags][value__eq]=AFIBEL`;    
    // const getOrderUrl = `https://app.shippingbo.com/orders?search[joins][order_tags][value__eq]=BAZARCHIC`;    
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

//Translate status
const stateTranslations = {
    at_pickup_location: "En point relais",
    back_from_client: "Retour client",
    canceled: "Annule",
    closed: "Cloture",
    dispatched: "Expedie",
    handed_to_carrier: "Remis au transporteur",
    in_preparation: "En preparation",
    in_trouble: "Probleme",
    merged: "Fusionne",
    partially_shipped: "Partiellement expedie",
    rejected: "Rejeté",
    sent_to_logistics: "Envoye en logistique",
    shipped: "Expedie",
    splitted: "Scinde",
    to_be_prepared: "A preparer",
    waiting_for_payment: "En attente de paiement",
    waiting_for_stock: "En attente de stock"
  };

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
    //   console.log("STATE reçu de Shippingbo :", data.order.state);
    //   console.log('translation', stateTranslations[data.order.state]);

    //   console.log("data shipments", data.order.shipments)
      return {
        afibel_id: data.order.origin_ref,
        order_id: data.order.source_ref,
        status: stateTranslations[data.order.state?.toLowerCase()] || data.order.state,
        created_at: data.order.created_at,
        name: data.order.shipping_address?.fullname,
        tracking_number: data.order.shipments?.[0]?.shipping_ref || '',
        tracking_url: data.order.shipments?.[0]?.tracking_url || "",
        carrier: data.order.shipments?.[0]?.carrier_name || '',
        shipped_at: data.order.shipped_at
      }
}

//generate CSV tracking file 
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
 
    const date = new Date().toISOString().split('T')[0];
    const fileName = `afibel_tracking_${date}.csv`;
    // Export CSV
    const uploadDir = path.join(__dirname, '..', 'uploads');
    const outputPath = path.join(uploadDir, fileName);
    // console.log("Chemin du fichier CSV : ", outputPath);
 
    writeToPath(outputPath, result, { headers: true })
        .on('finish', () => {
            console.log(`CSV exported : ${outputPath}`);
            fs.readFile(outputPath, { encoding: 'base64' }, async (err, fileContent) => {
                if (err) {
                    console.error("Error reading CSV File", err);
                    return;
                }
 
                await sendTrackingToAfibel(outputPath, path.basename(outputPath));
                await mailCSV(accessTokenMS365, fileContent);
                // fs.unlink(outputPath, (err) => {
                //     if(err) {
                //         console.error('Error removing csv fil from uploads dir', err)
                //     } else {
                //         console.log('CSV file removed');
                //     }

                // })
            });
        })
        .on('error', (err) => {
            console.error("Error writing CSV File", err);
        });
}

const sendTrackingToAfibel = async (localPath, fileName) => {
    const remotePath = `/OUT/${fileName}`;

    try {
        await sftpAfibel.connect(configAfibel);
        console.log('Connected to Afibel SFTP to send csv tracking file');
        await sftpAfibel.put(localPath, remotePath);
        console.log('tracking File sent ');
        await sftpAfibel.end();

        fs.unlinkSync(localPath);
        console.log('CSV rm')
    } catch (error) {
        console.error('Error sending tracking file', error);
        try { await sftpAfibel.end(); } catch {}
    }
}

// 1- programmer cette récup
// 2- recupérer fichier new order de afibel sftp
// 3- l'envoyer à shippingbo SFTP

// 4- programmer cette recup
// 5- recuperer orders trackings sur shippingbo 
// 6- envoyer à afibel sftp

// 7- lier sftp shippingbo et afibel pour les stocks directement sur shippingbo

module.exports = { generateCsv, sendCSVToShippingbo, getNewOrdersFile }
