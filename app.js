const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer'); 
const path = require('path');
const fs = require('fs');
const { from } = require('form-data');
const { type } = require('os');
const { error } = require('console');
const Shopify = require('shopify-api-node');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 300;
const SHOPIFYAPPTOKEN = process.env.SHOPIFYAPPTOKEN;
const MAILSERVICE = process.env.MAILSERVICE;
const MAILHOST = process.env.MAILHOST;
const MAILPORT = process.env.MAILPORT;
const MAILSENDER = process.env.MAILSENDER;
const MAILSENDERPASS = process.env.MAILSENDERPASS;
const MAILRECIPIENT = process.env.MAILRECIPIENT;
const CLIENT_ID = process.env.CLIENT_ID_SHIPPINGBO;
const CLIENT_SECRET = process.env.CLIENT_SECRET_SHIPPINGBO;
const API_APP_ID = process.env.API_APP_ID;
const YOUR_AUTHORIZATION_CODE = process.env.YOUR_AUTHORIZATION_CODE;
let accessToken = null;
let refreshToken = null;

const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
  })
});
app.set('appName', 'potironAppPro');

const corsOptions = {
  origin: "https://potiron.com",
  method: 'GET, HEAD, PUT, PATCH, POST, DELETE',
  credentials: true,
  optionSuccessStatus: 204
}
//extract data from notes added fields create_customer form
function extractInfoFromNote(note, infoLabel) {
  if(note) {
    const lines = note.split('\n');
    for (const line of lines) {
        if (line.startsWith(`${infoLabel}: `)) {
            return line.substring(infoLabel.length + 2);
        }
    }
    return null;
  }
}
app.use(cors(corsOptions));
app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Bienvenue sur votre application !');
});

//auth for shippingbo
const getToken = async (authorizationCode) => {
  const tokenUrl = 'https://oauth.shippingbo.com/oauth/token';
  const tokenOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: authorizationCode,
      redirect_uri: 'urn:ietf:wg:oauth:2.0:oob'
    })
  };
 
  try {
    const response = await fetch(tokenUrl, tokenOptions);
    const data = await response.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    return {
      accessToken,
      refreshToken
    };
  } catch (error) {
    console.error('Error obtaining access token:', error);
    throw error;
  }
};
 
const refreshAccessToken = async () => {
  const refreshUrl = 'https://oauth.shippingbo.com/oauth/token';
  const refreshOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken
    })
  };
 
  try {
    const response = await fetch(refreshUrl, refreshOptions);
    const data = await response.json();
    accessToken = data.access_token;
    refreshToken = data.refresh_token;
    return accessToken;
  } catch (error) {
    console.error('Error refreshing access token:', error);
    throw error;
  }
};

//update order in shippingbo : change origin Commande PRO
const updateShippingboOrder = async (shippingboOrderId, originRef) => {
  if(originRef.includes('PRO-') === false)  {
    originRef = "PRO-" + originRef;
  }
  const updatedOrder= {
    id: shippingboOrderId,
    origin: "Commande PRO",
    origin_ref: originRef
}
  const updateOrderUrl = `https://app.shippingbo.com/orders/${shippingboOrderId}`;
  const updateOrderOptions = {
    method: 'PATCH',
    headers: {
      'Content-type': 'application/json',
      Accept: 'application/json',
      'X-API-VERSION' : '1',
      'X-API-APP-ID': API_APP_ID,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify(updatedOrder)
  };
  try{
        const response = await fetch(updateOrderUrl, updateOrderOptions);
        const data = await response.json();
        if(response.ok) {
          console.log('pro order updated in shippingbo: ', shippingboOrderId);
        }
      } catch (error) {
         console.error('Error updating shippingbo order', error);
      }
}

//Retrieve shippingbo order ID from Shopify ID
const getShippingboId = async (shopifyOrderId) => {
  const getOrderUrl = `https://app.shippingbo.com/orders?search[source_ref__eq][]=${shopifyOrderId}`;
  const getOrderOptions = {
    method: 'GET',
    headers: {
      'Content-type': 'application/json',
      Accept: 'application/json',
      'X-API-VERSION' : '1',
      'X-API-APP-ID': API_APP_ID,
      Authorization: `Bearer ${accessToken}`
    },
  };
  try {
    const response = await fetch(getOrderUrl, getOrderOptions);
    const data = await response.json();
    const shippingboOrderId = data.orders[0].id;
    let originRef = data.orders[0].origin_ref;
    if(shippingboOrderId){
      await updateShippingboOrder(shippingboOrderId, originRef);
    }
  } catch (err) {
    console.log('nop', err);
  }
}

//webhook on order update : https://potironapppro.onrender.com/updateOrder
//à revoir avec solution finale pour livraison

app.post('/updateOrder', async (req, res) => {
  const orderUpdated = req.body;
  console.log("commande mise à jour", orderUpdated);
  const shopifyOrderId = orderUpdated.id;
  const tagsPRO = orderUpdated.tags;
if(tagsPRO.includes('Commande PRO')) {
  try {
    // Si l'accessToken est expiré ou non défini, rafraîchir avec refreshToken
    if (!accessToken) {
      // Si refreshToken est disponible, rafraîchir l'accessToken
      if (refreshToken) {
        accessToken = await refreshAccessToken();
      } else {
        // Sinon, obtenir un nouvel accessToken avec authorization_code
        const tokens = await getToken(YOUR_AUTHORIZATION_CODE);
        if (!tokens.accessToken || !tokens.refreshToken) {
          throw new Error('Failed to obtain access tokens');
        }
        accessToken = tokens.accessToken;
        refreshToken = tokens.refreshToken;
      }
    }
    await getShippingboId(shopifyOrderId);
  } catch(err) {
    console.log('error shiipingboId', err);
  }
}
});

let uploadedFile = null;
let originalFileName = null;
let fileExtension = null;
let filePath = null;

//send email with kbis to Potiron Team 
async function sendEmailWithAttachment(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
  const transporter = nodemailer.createTransport({
      service: MAILSERVICE,
      host: MAILHOST,
      port: MAILPORT,
      secure: false,
      auth: {
          user: MAILSENDER, 
          pass: MAILSENDERPASS
      },
      tls: {
        ciphers: 'SSLv3'
    }
  });

  const mailOptions = {
      from: '"POTIRON PARIS - Nouveau kBis" <noreply@potiron.com>',
      replyTo: 'bonjour@potiron.com', 
      to: MAILRECIPIENT,
      cc: MAILSENDER,
      subject: 'Nouveau Kbis (' + companyName + ') à vérifier et valider !', 
      html:`
      <p>Bonjour, </p>
      <p>Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameCustomer}</strong>.</p>
      <p>Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
      <p>Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
      <p>Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
      <p>Bonne journée,</p>
      <p>Céline Leroux</p>
      <img src='cid:signature'/>
      `,     
      attachments: [
          {
              filename: 'kbis_' + companyName + fileExtension,
              content: fs.createReadStream(filePath)
          },
          {
            filename: 'signature.png',
            path: 'assets/signature.png',
            cid: 'signature'
          }
      ]
  };

  return transporter.sendMail(mailOptions);
}
async function sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName) {
  const transporter = nodemailer.createTransport({
    service: MAILSERVICE,
    host: MAILHOST,
    port: MAILPORT,
    secure: false,
    auth: {
        user: MAILSENDER, 
        pass: MAILSENDERPASS
    },
    tls: {
      ciphers: 'SSLv3'
    }
  });
  const mailOptions = {
    from: '"POTIRON PARIS PRO" <noreply@potiron.com>',
    replyTo: 'bonjour@potiron.com', 
    to: mailCustomer,
    cc: MAILSENDER,
    subject: 'Accès Pro Potiron Paris', 
    html:`
    <p>Bonjour ${firstnameCustomer} ${nameCustomer},</p>
    <p>Nos équipes ont validé votre KBIS concernant ${companyName}, nous vous souhaitons la bienvenue !</p>
    <p>Vous avez désormais accès, une fois connecté avec votre login et mot de passe, à l'ensemble du site avec les prix dédiés aux professionnels.</p>
    <p><a href="https://potiron.com">Visitez notre boutique</a></p>
    <p>Nous restons à votre entière disposition.</p>
    <p>Très belle journée,</p>
    <p>L'équipe de Potiron</p>
    <img src='cid:signature'/>
    `,     
    attachments: [
        {
          filename: 'signature.png',
          path: 'assets/signature.png',
          cid: 'signature'
        }
    ]
  };
  return transporter.sendMail(mailOptions);
}
app.post('/upload', upload.single('uploadFile'), (req, res) => {
  uploadedFile = req.file;
  originalFileName = req.file.originalname;
  fileExtension = path.extname(originalFileName); 
  filePath = req.file.path;
  res.status(200).send('Fichier téléchargé avec succès.');
});

//webhook on order creation : https://potironapppro.onrender.com/proOrder
app.post('/proOrder', async (req, res) => {
  var orderData = req.body;
  var orderId = orderData.id;
  const tagsArr = orderData.customer.tags.split(', ');
  const isB2B = tagsArr.includes('PRO validé');
  if(isB2B) {
   const updatedOrder = {
    order: {
      id: orderId,
      tags: "Commande PRO"
    }
  };
    const updateOrderUrl = `https://potiron2021.myshopify.com/admin/api/2024-04/orders/${orderId}.json`;
    const updateOptions = {
      method: 'PUT',
      headers: {             
        'Content-Type': 'application/json',             
        'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
      },
      body: JSON.stringify(updatedOrder)
    };
    try {
      const response = await fetch(updateOrderUrl, updateOptions);
      const data = await response.json();       
      console.log('Commande pro maj sur Shopify:', data);  
      res.status(200).send('Order updated');  
    } catch (error) {
      console.error('Error updating order:', error);
      res.status(500).send('Error updating order');
    }
  } else {
    console.log('commande pour client non pro');
  }
});

app.post('/create-pro-draft-order', async (req, res) => {
  console.log('reçoit la commande');
  try {
    console.log('req', req.body);
  } catch (error) {
    console.log(error);
  }
})

//webhook on customer update : https://potironapppro.onrender.com/updatekBis
app.post('/updateKbis', (req, res) => {
  var updatedData = req.body;
  const clientUpdated = updatedData.id;

  const metafieldsUrl = `https://potiron2021.myshopify.com/admin/api/2024-04/customers/${clientUpdated}/metafields.json`
  const fetchOptions = {         
    method: 'GET',         
    headers: {             
      'Content-Type': 'application/json',             
      'X-Shopify-Access-Token': SHOPIFYAPPTOKEN 
    } 
  };
  fetch(metafieldsUrl, fetchOptions)
    .then(response => response.json())
    .then(data => {
      if(!data.metafields){
        console.log('no meta');
        return res.status(404).send('No mate found')
      }
      const metafields = data.metafields;

      const checkedKbisField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'checkedkbis');
      const mailProSentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'mailProSent');
      const companyNameField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'company');

      if(checkedKbisField && mailProSentField) {
        var firstnameCustomer = updatedData.first_name;
        var nameCustomer = updatedData.last_name;
        var mailCustomer = updatedData.email;
        var companyName = companyNameField.value;
        var kbisState = checkedKbisField.value;
        var mailProState = mailProSentField.value;

        if(kbisState === true && mailProState === false) {
          sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName)
            .then(() => {
              console.log('mail envoyé au client pro');  
            })
            
            .catch(error => {
              console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
              res.status(500).send('Erreur lors de l\'envoi de l\'e-mail.');
            });

            const updatedCustomerKbis = {
              customer: {
                id: clientUpdated,
                tags: "VIP, PRO validé",
                metafields: [
                  {
                    id: mailProSentField.id,
                    key: 'mailProSent',
                    value: true,
                    type: 'boolean',
                    namespace: 'custom'
                  }
                ]
              }
            };  
            const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-04/customers/${clientUpdated}.json`
            const updateOptions = {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
                  },
                  body: JSON.stringify(updatedCustomerKbis)
            };      
             fetch(updateCustomerUrl, updateOptions)
             .then(response => response.json())
             .then(updatedKebisState => {
              console.log('mise à jour fiche client suite envoie du mail acces PRO')
             })
             .catch(error => {
              console.error('Erreur lors de la mise à jour du client', error);
              res.status(500).send('Erreur lors de la mise à jour des données clients')
             });
        } else if(kbisState === false && mailProState === false) {
          console.log("Kbis à valider");
        } else {
          console.log("mail déjà envoyé");
        }
      }
    })
})

//webhook on customer creation : https://potironapppro.onrender.com/createProCustomer
app.post('/createProCustomer', (req, res) => {
    var myData = req.body;
    var b2BState = myData.tags;
    if (b2BState && b2BState.includes("VIP")) {
        const clientToUpdate = myData.id;
        //idCustomer = myData.id;
        const siret = extractInfoFromNote(myData.note, 'siret');
        const companyName = extractInfoFromNote(myData.note, 'company_name');
        const tva = extractInfoFromNote(myData.note, 'tva');
        const phone = extractInfoFromNote(myData.note, 'phone');
        const sector = extractInfoFromNote(myData.note, 'sector');
        const mailCustomer = myData.email;
        const nameCustomer = myData.last_name;
        const firstnameCustomer = myData.first_name;

        // Vérifier si un fichier a été téléchargé
        if (!uploadedFile) {
          res.status(400).send('Aucun fichier téléchargé.');
          return;
        }
        // Envoi du fichier par e-mail
        sendEmailWithAttachment(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone)
          .then(() => {
            console.log('mail envoyé');
            fs.unlink(uploadedFile.path, (err) => {
              if (err) {
                  console.error('Erreur lors de la suppression du fichier :', err);
              } else {
                  //console.log('Fichier supprimé avec succès.');
              }
          });
            uploadedFile = null; 
            originalFileName = null;
            fileExtension = null;
            
          })
          .catch(error => {
            console.error('Erreur lors de l\'envoi de l\'e-mail :', error);
            res.status(500).send('Erreur lors de l\'envoi de l\'e-mail.');
          });
        
      const updatedCustomerData = {
        customer: {
          id: clientToUpdate,
          phone: phone,
          note: '', 
          
          metafields: [
            {
              key: 'company',
              value: companyName,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'sector',
              value: sector,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'siret',
              value: Number(siret),
              type: 'number_integer',
              namespace: 'custom'
            },
            {
              key: 'tva',
              value: tva,
              type: 'single_line_text_field',
              namespace: 'custom'
            },
            {
              key: 'checkedkbis',
              value: false,
              type: 'boolean',
              namespace: 'custom'
            },
            {
              key: 'mailProSent',
              value: false,
              type: 'boolean',
              namespace: 'custom'
            }
          ]
        }
      };

    const updateCustomerUrl = `https://potiron2021.myshopify.com/admin/api/2024-04/customers/${clientToUpdate}.json`
    const updateOptions = {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': SHOPIFYAPPTOKEN
          },
          body: JSON.stringify(updatedCustomerData)
    };
    fetch(updateCustomerUrl, updateOptions)
      .then(response => response.json())
      .then(updatedCustomer => {
        console.log('nouveau client pro')
        //res.status(200).json(updatedCustomer);
      })
      .catch(error => {
        console.error('Erreur lors de la mise à jour du client :', error);
        res.status(500).send('Erreur lors de la mise à jour du client.');
      });
  } else {
      console.log("nouveau client créé non pro");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
