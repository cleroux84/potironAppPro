const nodemailer = require('nodemailer'); 
const fs = require('fs');
require('dotenv').config();

const MAILSERVICE = process.env.MAILSERVICE;
const MAILHOST = process.env.MAILHOST;
const MAILPORT = process.env.MAILPORT;
const MAILSENDER = process.env.MAILSENDER;
const MAILSENDERPASS = process.env.MAILSENDERPASS;
const MAILRECIPIENT = process.env.MAILRECIPIENT;
const MAILCOTATION = process.env.MAILCOTATION;

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

//Send email to b2b customer when kBis validate
async function sendWelcomeMailPro(firstnameCustomer, nameCustomer, mailCustomer, companyName, deliveryPref, paletteEquipment, paletteAppointment, paletteNotes) {
  let paletteNotesValue;
  console.log('notes : ', typeof paletteNotes);
  if(paletteNotes !== undefined || paletteNotes !== "undefined") {
    paletteNotesValue = `<p>Notes complémentaires concernant la livraison : ${paletteNotes}</p>`
  }
  let deliveryTextIfPalette = '';
    if(deliveryPref.includes("palette")) {
      deliveryTextIfPalette = `<p> Equipement nécessaire : ${paletteEquipment}</p>
      <p>Nécessité de prendre RDV pour la livraison : ${paletteAppointment}</p>
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
      <p>Nos équipes ont validé votre KBIS concernant ${companyName}, nous vous souhaitons la bienvenue !</p>
      <p>Vous avez désormais accès, une fois connecté avec votre login et mot de passe, à l'ensemble du site avec les prix dédiés aux professionnels.</p>
      <p><a href="https://potiron.com">Visitez notre boutique</a></p>
      <p style="text-decoration: underline;">Rappel de vos préférences de livraison: </p>
      <p>Possibilité(s) de livraison : ${deliveryPref}</p>
      ${deliveryTextIfPalette}
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

//Send mail to Potiron Team to ask delivery quote
  async function sendNewDraftOrderMail(firstnameCustomer, nameCustomer, draftOrderId, customerMail, customerPhone, shippingAddress, deliveryPrefValue, paletteEquipmentValue, appointmentValue, paletteNotes) {
    let deliveryTextIfPalette = '';
    if(deliveryPrefValue.includes("palette")) {
      deliveryTextIfPalette = `<p> Equipement nécessaire : ${paletteEquipmentValue}</p>
      <p>Nécessité de prendre RDV pour la livraison : ${appointmentValue}</p>
      <p>Notes complémentaires concernant la livraison : ${paletteNotes}</p>
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
      <p>Une nouvelle commande provisoire a été créée pour le client PRO : ${firstnameCustomer} ${nameCustomer}</p>
      <p>Il est joignable pour valider la cotation à ${customerMail} et au ${customerPhone} </p>
      <p>L'adresse de livraison renseignée est : ${shippingAddress}</p>
      <p>Préférence(s) de livraison : ${deliveryPrefValue}</p>
      ${deliveryTextIfPalette}
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
    sendNewDraftOrderMail
  }