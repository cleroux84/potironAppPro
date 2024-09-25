const nodemailer = require('nodemailer'); 
const fs = require('fs');
require('dotenv').config();
const { ConfidentialClientApplication } = require('@azure/msal-node');
const { Client } = require('@microsoft/microsoft-graph-client');
require ('isomorphic-fetch');

const MAILSERVICE = process.env.MAILSERVICE;
const MAILHOST = process.env.MAILHOST;
const MAILPORT = process.env.MAILPORT;
const MAILSENDER = process.env.MAILSENDER;
const MAILSENDERPASS = process.env.MAILSENDERPASS;
const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;
const MS365CLIENTID = process.env.MS365_CLIENT_ID; //ID de l'application microsoft
const MS365TENANTID = process.env.MS365_TENANT_ID; // ID du locataire
const MS365SECRET = process.env.MS365_CLIENT_SECRET;

//config miscrosoft data
const config = {
  auth: {
      clientId: MS365CLIENTID, 
      authority: `https://login.microsoftonline.com/${MS365TENANTID}`, 
      clientSecret: MS365SECRET 
  }
};
const cca = new ConfidentialClientApplication(config);

async function sendMicrosoftEmailWithKbis(accessToken, filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
  const client = Client.init({
      authProvider: (done) => {
          done(null, accessToken); // Utilisation du token
      }
  });
console.log('MICROSOFT USER', user.id);

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
                  address: "c.leroux@potiron.com"
              }
          }
      ],
      attachments: [
          {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: `kbis_${companyName}.pdf`,
              contentBytes: fs.readFileSync(filePath).toString('base64')  // Conversion en base64
          },
          {
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: 'signature.png', // Nom de la signature
            contentId: 'signatureImage', // ID utilisé dans le cid
            isInline: true, // Indique que l'image est inline (pas comme pièce jointe classique)
            contentBytes: fs.readFileSync('assets/signature.png').toString('base64') // Conversion de la signature en base64
          } 
        ]
    };
    console.log('message ms365', message.toRecipients);
  try {
      await client.api('/users/me/sendMail').post({ message });
      console.log('Email envoyé avec succès');
  } catch (error) {
      console.log('Erreur lors de l\'envoi de l\'email : ', error);
  }
}

async function getMicrosoftAccessToken() {
  const clientCredentialRequest = {
    scopes: ['https://graph.microsoft.com/.default'],
  };

  try {
      const authResponse = await cca.acquireTokenByClientCredential(clientCredentialRequest);
      // console.log('m365accesstoken', authResponse.accessToken);
      return authResponse.accessToken;
  } catch (error) {
      console.log('Erreur d\'authentification : ', error);
  }
}

//Send email with kbis to Potiron Team to check and validate company
async function sendEmailWithKbis(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
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
        <p style="margin: 0;">Une nouvelle demande d'inscription pro est arrivée pour <strong>${firstnameCustomer} ${nameCustomer}</strong>.</p>
        <p style="margin: 0;">Vous trouverez le KBIS de <strong>${companyName}</strong> ci-joint.</p>
        <p style="margin: 0;">Ce nouveau client est joignable à ${mailCustomer} et au ${phone}.</p>
        <p style="margin: 0;">Pensez à le valider pour que le client ait accès aux prix destinés aux professionnels.</p>
        <p>Bonne journée !</p>
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

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes) {
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
      <p style="margin: 0;">Nos équipes ont validé votre KBIS concernant ${companyName}, nous vous souhaitons la bienvenue !</p>
      <p style="margin: 0;">Vous avez désormais accès, une fois connecté avec votre login et mot de passe, à l'ensemble du site avec les prix dédiés aux professionnels.</p>
      <p><a href="https://potiron.com">Visitez notre boutique</a></p>
      <p style="text-decoration: underline;">Rappel de vos préférences de livraison: </p>
      <p style="margin: 0;">Possibilité(s) de livraison : ${deliveryPref}</p>
      ${deliveryTextIfPalette}
      <p>Vous pouvez modifier ces informations directement sur votre compte client.</p>
      <p style="margin: 0;">Nous restons à votre entière disposition.</p>
      <p style="margin: 0;">Très belle journée,</p>
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

//Send mail to Potiron Team to ask delivery quote
  async function sendNewDraftOrderMail(firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPrefValue, paletteEquipmentValue, appointmentValue, paletteNotes) {
    let deliveryTextIfPalette = '';
    if(deliveryPrefValue.includes("palette")) {
      deliveryTextIfPalette = `<p style="margin: 0;"> Equipement nécessaire : ${paletteEquipmentValue}</p>
      <p style="margin: 0;">Nécessité de prendre RDV pour la livraison : ${appointmentValue}</p>
      <p style="margin: 0;">Notes complémentaires concernant la livraison : ${paletteNotes}</p>
      `
    }
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
      to: MAILCOTATION,
      cc: MAILSENDER,
      subject: 'Nouvelle demande de cotation pour Commande Provisoire ' + draftOrderId, 
      html:`
      <p>Bonjour, </p>
      <p style="margin: 0;">Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameCustomer}</p>
      <p style="margin: 0;">Il est joignable pour valider la cotation à ${customerMail} et au ${customerPhone} </p>
      <p style="margin: 0;">L'adresse de livraison renseignée est : ${shippingAddress}</p>
      <p>Préférence(s) de livraison : ${deliveryPrefValue}</p>
      ${deliveryTextIfPalette}
      <p>Bonne journée ! </p>
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
  
  module.exports = {
    sendEmailWithKbis,
    sendWelcomeMailPro,
    sendNewDraftOrderMail,
    getMicrosoftAccessToken,
    sendMicrosoftEmailWithKbis
  }