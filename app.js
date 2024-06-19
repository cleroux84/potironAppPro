const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer'); 
const path = require('path');
const fs = require('fs');
const { from } = require('form-data');
const { type } = require('os');
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

const upload = multer({ 
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'uploads/') // Spécifiez le répertoire de destination ici
    },
    filename: function (req, file, cb) {
      cb(null, file.originalname)
    }
  })
});
app.set('appName', 'potironAppPro');

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

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Bienvenue sur votre application !');
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
      const metafields = data.metafields;
      const checkedKbisField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'checkedkbis');
      const mailProSentField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'mailProSent');
      const companyNameField = metafields.find(mf => mf.namespace === 'custom' && mf.key === 'company');

      if(checkedKbisField && mailProSentField) {
        console.log('updatedClient', updatedData.last_name);
        console.log('kBisCheckedState: ', checkedKbisField.value);
        console.log('mailProSentState: ', mailProSentField.value);
        var firstnameCustomer = updatedData.first_name;
        var nameCustomer = updatedData.last_name;
        var mailCustomer = updatedData.email;
        var companyName = companyNameField.value;
        console.log('companyName', companyName);
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

            const newTags = ['VIP', 'PRO validé']  
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
          //console.log("maj mailProSent + add tag proValide");
        } else if(kbisState === false && mailProState === false) {
          console.log("Kbis à valider");
        } else {
          console.log("mail déjà envoyé");
        }
      }
    })
})

app.post('/webhook', (req, res) => {
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
        console.log('nouveau client B2B')
        //res.status(200).json(updatedCustomer);
      })
      .catch(error => {
        console.error('Erreur lors de la mise à jour du client :', error);
        res.status(500).send('Erreur lors de la mise à jour du client.');
      });
  } else {
      console.log("pas vip");
  }
});

app.listen(PORT, () => {
  console.log(`Serveur en cours d'écoute sur le port ${PORT}`);
});
