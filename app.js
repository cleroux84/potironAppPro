const express = require('express');
const multer = require('multer');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const nodemailer = require('nodemailer'); 
const path = require('path');
const fs = require('fs');
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

const upload = multer({dest: 'uploads/'});

app.set('appName', 'potironAppPro');

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
function deleteFile(filePath) {
  fs.unlink(filePath, (err) => {
      if (err) {
          console.error('Erreur lors de la suppression du fichier :', err);
      } else {
          console.log('Fichier supprimé avec succès :', filePath);
      }
  });
}

app.use(bodyParser.json());

app.get('/', (req, res) => {
    res.send('Bienvenue sur votre application !');
  });
let uploadedFile = null;
let fileName = null;

async function sendEmailWithAttachment(filePath, companyName, fileExtension) {
  const transporter = nodemailer.createTransport({
      service: MAILSERVICE,
      host: MAILHOST,
      port: MAILPORT,
      secure: 'false',
      auth: {
          user: MAILSENDER, 
          pass: MAILSENDERPASS
      }
  });
  const mailOptions = {
      from: MAILSENDER, 
      to: MAILRECIPIENT, //mailmagali ou laura
      subject: 'Nouveau Kbis (' + companyName + ') à vérifier et valider !', 
      text: "Une nouvelle demande d'inscription pro est arrivée. Voici le kbis ci-joint, pensez à le valider pour que le client B2B ait accès aux prix de gros", 
      attachments: [
          {
              filename: 'kbis_' + companyName + fileExtension,
              path: filePath
          }
      ]
  };

  return transporter.sendMail(mailOptions);
}
app.post('/upload', upload.single('uploadFile'), (req, res) => {
  uploadedFile = req.file
  fileName = req.file.originalname;  
  res.send('Fichier téléversé avec succès.');
});

app.post('/webhook', (req, res) => {
    var myData = req.body;
    var b2BState = myData.tags;
    if (b2BState.includes("VIP")) {
        const clientToUpdate = myData.id;
        idCustomer = myData.id;
        const siret = extractInfoFromNote(myData.note, 'siret');
        const companyName = extractInfoFromNote(myData.note, 'company_name');
        const tva = extractInfoFromNote(myData.note, 'tva');
        const phone = extractInfoFromNote(myData.note, 'phone');
        const sector = extractInfoFromNote(myData.note, 'sector');
        const mailCustomer = myData.email;
        const fileExtension = path.extname(fileName);

        sendEmailWithAttachment(uploadedFile.path, companyName, fileExtension)
        .then(() => {
          console.log('E-mail envoyé avec succès.')
          //deleteFile(uploadedFile.path);
        })
        .catch(error => console.error('Erreur lors de l\'envoi de l\'e-mail :', error));

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
        res.status(200).json(updatedCustomer);
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
