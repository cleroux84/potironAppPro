const nodemailer = require('nodemailer'); 
const fs = require('fs');
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require ('isomorphic-fetch');

const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;
const MAILDEV = process.env.MAILDEV;

const signatureAttachement =  {
  '@odata.type': '#microsoft.graph.fileAttachment',
  name: 'signature.png',
  contentId: 'signature', 
  isInline: true,
  contentType: 'image/png',
  contentBytes: fs.readFileSync('assets/signature.png').toString('base64')
} 

const initiMicrosoftGraphClient = (accessTokenMS365) => {
  return Client.init({
    authProvider: (done) => {
        done(null, accessTokenMS365); 
    }
  });
}
//Send email with kbis to Potiron Team (Magalie) from bonjour@potiron.com to check and validate company
async function sendEmailWithKbis(accessTokenMS365, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);

  const message = {
      subject: `Nouveau Kbis pour ${companyName} à vérifier et valider`,
      body: {
          contentType: 'HTML',
          content: `
        <p>Bonjour, </p>
        <p style="margin: 0;">Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameCustomer}</strong>.</p>
        <p style="margin: 0;">Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
        <p style="margin: 0;">Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
        <p style="margin: 0;">Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
        <p>Bonne journée !</p>
        <img src='cid:signature'/>
          `
      },
      toRecipients: [
          {
              emailAddress: {
                  address: MAILRECIPIENT
              }
          }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
          {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: `kbis_${companyName}.pdf`,
              contentBytes: fs.readFileSync(filePath).toString('base64') 
          },
          signatureAttachement
        ]
    };
  try {
      await client.api('/me/sendMail').post({ message });
      console.log('Email KBIS envoyé avec succès');
  } catch (error) {
    if(error.response) {
      console.log('erreur API', error.response.data);
    } else {
      console.log('Erreur lors de l\'envoi de l\'email : ', error);
      }
  }
}

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(accessTokenMS365, firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes) {
  const client = initiMicrosoftGraphClient(accessTokenMS365);
  let paletteNotesValue;
  if(paletteNotes !== undefined && paletteNotes !== "undefined") {
    paletteNotesValue = `<p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>`;
  } else {
    paletteNotesValue = '';
  }
  let deliveryTextIfPalette = '';
    if(deliveryPref.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipment}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${paletteAppointment}</p>
      ${paletteNotesValue}
      `
    }
  const message = {
    subject: 'Validation de votre espace pro - Pro Potiron Paris', 
    body: {
      contentType: 'HTML',
      content: `
        <p>Bonjour ${firstnameCustomer} ${nameCustomer},</p>
        <p style="margin: 0;">Nous vous souhaitons la bienvenue chez Potiron Paris - Espace Pro !</p>
        <p style="margin: 0;">Une fois connecté avec votre login et votre mot de passe, vous aurez accès à l'ensemble de nos produits aux tarifs pour professionnels.</p>
        <p><a href="https://potiron.com">Visitez notre boutique</a></p>
        <p style="text-decoration: underline;">Rappel de vos préférences de livraison : </p>
        <p style="margin: 0;">Possibilité(s) de livraison : ${deliveryPref}</p>
        ${deliveryTextIfPalette}
        <p>Vous pouvez modifier ces informations directement sur votre compte client.</p>
        <p style="margin: 0;">Nous restons à votre entière disposition.</p>
        <p style="margin: 0;">Très belle journée,</p>
        <p>L'équipe de Potiron Paris</p>
        <img src='cid:signature'/>
      `
    },
    toRecipients: [
      {
        emailAddress: {
          address: mailCustomer
        }
      }
    ],
    bccRecipients: [
      {
          emailAddress: {
              address: MAILDEV
          }
      }
    ],
    attachments: [
      signatureAttachement
    ]
  };
  try {
    await client.api('/me/sendMail').post({ message });
    console.log('Email to welcome pro customer send successfully');
  } catch (error) {
    console.error('Error send welcome pro mail', error);
  }  
}

//Send mail to Potiron Team to ask delivery quote
  async function sendNewDraftOrderMail(accessTokenMS365, firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPrefValue, paletteEquipmentValue, appointmentValue, paletteNotes) {
    const client = initiMicrosoftGraphClient(accessTokenMS365);
    let deliveryTextIfPalette = '';
    if(deliveryPrefValue.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipmentValue}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${appointmentValue}</p>
      <p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>
      `
    }
    const message = {
      subject: 'Nouvelle demande de cotation pour Commande Provisoire ' + draftOrderId, 
      body: {
        contentType: 'HTML',
        content: `
          <p>Bonjour, </p>
          <p style="margin: 0;">Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameCustomer}</p>
          <p style="margin: 0;">Il est joignable pour valider la cotation à ${customerMail} et au ${customerPhone} </p>
          <p style="margin: 0;">L'adresse de livraison renseignée est : ${shippingAddress}</p>
          <p>Préférence(s) de livraison : ${deliveryPrefValue}</p>
          ${deliveryTextIfPalette}
          <p>Bonne journée ! </p>
          <img src='cid:signature'/>
        `
      },
      toRecipients: [
        {
          emailAddress: {
            address: MAILCOTATION
          }
        }
      ],
      bccRecipients: [
        {
            emailAddress: {
                address: MAILDEV
            }
        }
      ],
      attachments: [
        signatureAttachement
      ]
    };
    try {
      await client.api('/me/sendMail').post({ message });
      console.log("Email for cotation sucessfully sent");
    } catch (error) {
      console.error('error sending cotation message', error);
    }
  }
  
  module.exports = {
    sendWelcomeMailPro,
    sendNewDraftOrderMail,
    sendEmailWithKbis
  }