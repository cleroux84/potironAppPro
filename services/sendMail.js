const nodemailer = require('nodemailer'); 
const fs = require('fs');
require('dotenv').config();

const MAILSERVICE = process.env.MAILSERVICE;
const MAILHOST = process.env.MAILHOST;
const MAILPORT = process.env.MAILPORT;
const MAILSENDER = process.env.MAILSENDER;
const MAILSENDERPASS = process.env.MAILSENDERPASS;
const MAILRECIPIENT = process.env.MAILRECIPIENT;

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

  module.exports = {
    sendEmailWithKbis
  }