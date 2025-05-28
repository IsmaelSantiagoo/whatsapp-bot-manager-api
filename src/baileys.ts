import { DisconnectReason, makeWASocket, useMultiFileAuthState, WASocket } from '@whiskeysockets/baileys';
import { pino } from 'pino';
import { Boom } from '@hapi/boom';
import { BaileysEvent } from './interfaces/Baileys';
import NodeCache from '@cacheable/node-cache'
import fs from 'fs';
import path from 'path';

export let currentStatus: BaileysEvent["status"] | null = null;
export let sock: WASocket | null = null;

export async function initBaileys(emitEvent: (event: BaileysEvent) => void): Promise<WASocket> {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const groupCache = new NodeCache({ })
  
  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // para silenciar logs
    cachedGroupMetadata: async (jid) => groupCache.get(jid)
  });

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => handleUpdate({ connection, lastDisconnect, qr }, emitEvent));
  sock.ev.on('messages.upsert', ({ messages, type }) => handleMessages({ messages, type }, emitEvent));

  return sock;
}

async function handleUpdate({ connection, lastDisconnect, qr }: any, emitEvent: (event: BaileysEvent) => void) {
  
  if (qr) {
    currentStatus = "wa-waiting-connection";
    emitEvent({ origin: "whatsapp", qr, status: currentStatus });
  }

  if (connection === 'open') {
    currentStatus = "wa-connected";
    emitEvent({ origin: "whatsapp", status: currentStatus });
    console.log('✅ Conectado ao WhatsApp!');
  }

  if (connection === 'close') {

    sock = null;
    const errMsg = (lastDisconnect?.error as Boom)?.message || '';
    const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;

    if (errMsg.includes('Stream Errored')) {
      currentStatus = "wa-reconnecting";
      emitEvent({ origin: "whatsapp", status: currentStatus });
      console.log('🟡 Stream Errored. Tentando reconectar...');
      
      initBaileys(emitEvent).catch(console.error);
    } else {

      currentStatus = "wa-disconnected";
      emitEvent({ origin: "whatsapp", status: currentStatus });
      console.log('❌ Conexão encerrada:', errMsg);
    }

    if (statusCode === DisconnectReason.loggedOut) {
      console.log('❌ Usuário se desconectou manualmente. Limpando credenciais e solicitando novo QR code.');
      // Limpe as credenciais salvas
      await clearAuthState("auth_info_baileys");
      // Re-inicialize a conexão para gerar um novo QR code
      initBaileys(emitEvent);
    }
  }
}

function handleMessages({ type, messages }: any, onEvent: (event: BaileysEvent) => void) {
  onEvent({ origin: "whatsapp", type, messages, status: "wa-connected" });
}

function clearAuthState(folderPath: string) {
  if (fs.existsSync(folderPath)) {
    fs.readdirSync(folderPath).forEach((file) => {
      const curPath = path.join(folderPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursivamente remove subdiretórios
        clearAuthState(curPath);
      } else {
        // Remove arquivos
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(folderPath);
    console.log('Pasta removida com sucesso.');
  }
}
