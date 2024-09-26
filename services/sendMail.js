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

async function sendMicrosoftEmailWithKbis(filePath, companyName, fileExtension, firstnameCustomer, nameCustomer, mailCustomer, phone) {
const msaccessToken = "eyJ0eXAiOiJKV1QiLCJub25jZSI6IjhoMmNlU0NHT3dTN3ZSd0NVejlzY1M2NTdra3NVQldSNGlaNU9SRWlVX1kiLCJhbGciOiJSUzI1NiIsIng1dCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyIsImtpZCI6Ik1jN2wzSXo5M2c3dXdnTmVFbW13X1dZR1BrbyJ9.eyJhdWQiOiIwMDAwMDAwMy0wMDAwLTAwMDAtYzAwMC0wMDAwMDAwMDAwMDAiLCJpc3MiOiJodHRwczovL3N0cy53aW5kb3dzLm5ldC9kZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUvIiwiaWF0IjoxNzI3MzU0NzkxLCJuYmYiOjE3MjczNTQ3OTEsImV4cCI6MTcyNzM1OTkxMCwiYWNjdCI6MCwiYWNyIjoiMSIsImFpbyI6IkFWUUFxLzhZQUFBQU5YWGxCYllwejRDL28wU2M4TEVuOHVRNmRiaDlUakFBSndMcW9rbGxCUjBKREUxOVVRQWNFSFZlZXQyMFcyQlRwMU9BUnRGUnByWms0TVJkNExIRHRqbVhPcXA1YlNmanlhNktGSzFKZXBRPSIsImFtciI6WyJwd2QiLCJtZmEiXSwiYXBwX2Rpc3BsYXluYW1lIjoicG90aXJvbk1haWxQcm8iLCJhcHBpZCI6IjVjYWRmNmU2LWFhOTYtNGZmOS05YWY0LWNlOWVlOTA3MjU2MyIsImFwcGlkYWNyIjoiMSIsImZhbWlseV9uYW1lIjoiTEVST1VYIiwiZ2l2ZW5fbmFtZSI6IkPDqWxpbmUiLCJpZHR5cCI6InVzZXIiLCJpcGFkZHIiOiIyYTAxOmUwYTplYjE6NTBjMDo4ZDZkOjFkY2I6YmY2NDplNGUiLCJuYW1lIjoiQ8OpbGluZSBMRVJPVVgiLCJvaWQiOiI1YjNlYTYwZS05NjdjLTRjNjItOGMwYy1kOGQwZWQ1ZjU0NzMiLCJwbGF0ZiI6IjMiLCJwdWlkIjoiMTAwMzIwMDFFOTQ3OTI1RSIsInJoIjoiMC5BWE1BQnJocjNldlZfVXF5dGNNRkpBZHZaUU1BQUFBQUFBQUF3QUFBQUFBQUFBQnpBQ2suIiwic2NwIjoiTWFpbC5TZW5kIFVzZXIuUmVhZCBwcm9maWxlIG9wZW5pZCBlbWFpbCIsInNpZ25pbl9zdGF0ZSI6WyJrbXNpIl0sInN1YiI6InRnWDRmUWFCYW9YOWVLLWI0UldhYUgyLWc4cTdyVlBYU2VmSkNDNDdmaHciLCJ0ZW5hbnRfcmVnaW9uX3Njb3BlIjoiRVUiLCJ0aWQiOiJkZDZiYjgwNi1kNWViLTRhZmQtYjJiNS1jMzA1MjQwNzZmNjUiLCJ1bmlxdWVfbmFtZSI6ImMubGVyb3V4QHBvdGlyb24uY29tIiwidXBuIjoiYy5sZXJvdXhAcG90aXJvbi5jb20iLCJ1dGkiOiJ4SWRQa2JZbUtrQ1N3Q0wyOFNvb0FBIiwidmVyIjoiMS4wIiwid2lkcyI6WyJiNzlmYmY0ZC0zZWY5LTQ2ODktODE0My03NmIxOTRlODU1MDkiXSwieG1zX2lkcmVsIjoiMSAxMCIsInhtc19zdCI6eyJzdWIiOiI2RGF6bjdlSWdKdDFDVThTdzAzSXlEQnZGMVEwOXhsRkJwUEg3aW9NYy1nIn0sInhtc190Y2R0IjoxNjAwMTc4NDE1LCJ4bXNfdGRiciI6IkVVIn0.BJnepI5jgU3nk4aTy5jwzA4ernzfZ9NMUfEXxHT7YS4pQokO3AldwZkRQkN6XENUVcMgMKj-HQPAMWy1XXUmMl47Wf7T72sxEMkMjW6xQXS95ybr4x5jYd4z79B01r6RasCGeX4JMCaniKh2ZNabD-3ydJKQsSflUc3wFpi2XlPzI2MuAFmPVud1ysaiiQ0VcIN5F1lhJK2g-O7mfuO0AIttcuWTryuLbE0VamNgL8Uru8Pypj4soIU5WewQbA0JiJu92s5ByWPzcdQVfCDyhFLXg-giGF8OXXNcAQ0DOBNJATSE_txiYbr8PK8ZtdqSCrfTkJxD2LCXOgvM6dqunA"

  const client = Client.init({
      authProvider: (done) => {
          done(null, msaccessToken); // Utilisation du token
      }
  });

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
    // console.log('message ms365', message.toRecipients);
  try {
      await client.api('/me/sendMail').post({ message });
      // await client.api('/users/5f6d8017-a904-4d6a-9701-644b280f9073/sendMail').post({ message }); //bonjour@potiron.com

      console.log('Email envoyé avec succès');
  } catch (error) {
    if(error.response) {
      console.log('erreur API', error.response.data);
    } else {
      console.log('Erreur lors de l\'envoi de l\'email : ', error);
      }
  }
}

async function authenticateMicrosoftUser() {
  const authCodeUrlParameters = {
    scopes: ["Mail.Send", "User.Read"],
    redirectUri: "http://localhost:3000/auth/callback",
  };
  const authUrl = await cca.getAuthCodeUrl(authCodeUrlParameters);
  console.log(`Please visit this URL to authenticate; ${authUrl}`)
}

async function getAccessTokenFromCode(authCode) {
  const tokenRequest = {
    code: authCode,
    scopes: ['Mail.Send', 'User.Read'],
    redirectUri: 'http://localhost:3000/auth/callback'
  };
  try {
    const authResponse = await cca.acquireTokenByCode(tokenRequest);
    return authResponse.accessToken;
  } catch (error) {
    console.error("Erreur lors de l'acquisition du token", error);
  }
}

// async function getMicrosoftAccessToken() {
//   const clientCredentialRequest = {
//     scopes: ['https://graph.microsoft.com/.default'],
//   };

//   try {
//       const authResponse = await cca.acquireTokenByClientCredential(clientCredentialRequest);
//       // console.log('m365accesstoken', authResponse.accessToken);
//       return authResponse.accessToken;
//   } catch (error) {
//       console.log('Erreur d\'authentification : ', error);
//   }
// }

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