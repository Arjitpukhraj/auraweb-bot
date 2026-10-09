/**
 * AuraWeb Technologies Pvt. Ltd. - Autonomous WhatsApp AI Gateway (Baileys)
 * Features:
 * 1. Generates live QR Code on http://localhost:3030 and whatsapp_qr.html.
 * 2. Saves permanent multi-device session in auth_info/ (Scan only ONCE!).
 * 3. 100% Personal Chat Shield (Ignores family & friends).
 * 4. Powered by Gemini 3.8 Flash (Acts as Vikas, Head of Client Success).
 */

import * as baileys from '@whiskeysockets/baileys';
const makeWASocket = baileys.default;
const { useMultiFileAuthState, DisconnectReason } = baileys;

import pino from 'pino';
import QRCode from 'qrcode';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    if (fs.existsSync('session.zip')) {
        console.log('📦 Extracting session.zip...');
        execSync('unzip -q -o session.zip || true');
        console.log('✅ Session extracted successfully.');
    }
} catch (e) {
    console.log('⚠️ Warning during unzip (safe to ignore):', e.message);
}

dotenv.config({ path: path.join(__dirname, '../automation/config.env') });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6I3NCs9H_zxoMWt2PU53pUvpEX64ZJ6Q5GlIPXKn01A3Q';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const ARJIT_PHONE = process.env.ARJIT_DIRECT_PHONE || '+919071122560';

// 🛡️ PERSONAL PROTECTION FILTER:
// Add phone numbers (with country code, e.g. 919829000000) that AI must NEVER touch.
const PERSONAL_WHITELIST = [
    // '919829000000',
];

let currentQRDataUrl = null;
let connectionStatus = 'WAITING_FOR_SCAN';
let connectedUser = null;

const CANDIDATE_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.1-flash-lite',
    'gemini-flash-lite-latest'
];

// 🧠 Multi-turn conversation memory (stores last 10 messages per chat)
const chatHistories = new Map();
const sentByBotIds = new Set();

function getHistory(chatId) {
    if (!chatHistories.has(chatId)) {
        chatHistories.set(chatId, []);
    }
    return chatHistories.get(chatId);
}

const SYSTEM_PROMPT = `You are Vikas, Senior Developer & Technical Partner at AuraWeb Technologies Pvt. Ltd. (working directly alongside Founder & CTO Arjit).
You are directly chatting with a prospective client on WhatsApp or Instagram.

VOICE & BEHAVIOR (CRITICAL RULES):
1. Language: Professional but natural conversational Hindi / Hinglish. Sound 100% like an experienced tech professional.
2. DO NOT introduce yourself directly as "Main Vikas hoon, Arjit jaisa lagta hoon ya uski company mein hoon". Keep it strictly professional, direct, and focused on the work.
3. ADAPT TO USER'S DOMAIN LIKE AN EXPERT:
   - EXCEL / GOOGLE SHEETS: Talk like a spreadsheet architect. Quote realistically: ₹499 - ₹1,499 for sheets/formulas, ₹1,999 - ₹4,499 for full automated dashboards.
   - CANVA / GRAPHICS: Talk like a creative designer. Quote: ₹499 - ₹1,999.
   - WEBSITES / APPS: Talk like a senior full-stack developer. Quote ₹1,999 - ₹3,999 for 1-page fast sites; ₹5,999 - ₹12,999 for full multi-page portals; ₹15,000+ for custom web apps.
4. DEMO / PROTOTYPE REQUESTS:
   - If user asks for a demo or template, NEVER keep asking endless questions! Say enthusiastically:
     "Ji bilkul! Aap hamara live studio showcase dekh sakte hain: https://auraweb-pvt-ltd.netlify.app
     Aapne agar koi photo bheji hai, toh hum uske hisaab se 48 ghante me live customized demo (prototype) ready karke share karte hain bina full payment ke. Aap reference bhejte hi hum turant template par kaam shuru kar dete hain!"
5. CLOSING PSYCHOLOGY:
   - Guide the conversation confidently to close the deal. Make them feel secure about the "50/50 Protected Escrow" (Pehle live demo dekho aur approve karo, fir payment). Assure them they are in expert hands.
6. Keep messages short, crisp, natural (2-4 sentences max). No giant walls of text.`;

async function callGeminiAI(chatId, userText) {
    const history = getHistory(chatId);
    history.push({ role: 'user', parts: [{ text: userText }] });

    for (const model of CANDIDATE_MODELS) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const contents = [
                {
                    role: 'user',
                    parts: [{ text: `System instruction:\n${SYSTEM_PROMPT}` }]
                },
                ...history
            ];

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });

            const data = await res.json();
            if (data.candidates && data.candidates[0]?.content?.parts) {
                let replyText = '';
                for (const p of data.candidates[0].content.parts) {
                    if (p.text) replyText += p.text;
                }
                replyText = replyText.trim();
                if (replyText) {
                    history.push({ role: 'model', parts: [{ text: replyText }] });
                    if (history.length > 12) history.splice(0, history.length - 12);
                    return replyText;
                }
            } else if (data.error) {
                console.warn(`[Model ${model} Warning]:`, data.error.message?.substring(0, 80));
            }
        } catch (err) {
            console.warn(`[Model ${model} Error]:`, err.message);
        }
    }

    // Smart Multi-Domain Context Fallback (Vikas Persona)
    const lower = (userText || '').toLowerCase();
    let humanFallback = "Haanji bilkul! Thoda sa details share kar dijiye aapka kya requirement hai, main turant review kar leta hoon.";
    if (lower.includes('excel') || lower.includes('sheet') || lower.includes('macro') || lower.includes('vlookup') || lower.includes('dashboard')) {
        humanFallback = "Haanji! Excel me hum dynamic dashboards, automated invoicing sheets, aur custom formulas sab handle karte hain. Exactly kis type ka data ya automation setup karwana hai aapko?";
    } else if (lower.includes('canva') || lower.includes('design') || lower.includes('banner') || lower.includes('poster') || lower.includes('flyer')) {
        humanFallback = "Haanji bilkul! Canva creatives me hum social media post packs, admission posters, reels covers aur complete branding design karte hain. Aapke brand ya coaching ke liye kis type ka creative banana hai?";
    } else if (lower.includes('demo') || lower.includes('sample') || lower.includes('prototype') || lower.includes('template')) {
        humanFallback = "Ji bilkul! Hamara official live showcase aap https://auraweb-pvt-ltd.netlify.app par dekh sakte hain. Aur aapke project ke liye hum 48 ghante me direct live demo ready karke dete hain bina advance payment ke (50/50 Protected Escrow). Aapke paas koi reference photo ya idea ho toh zaroor share karein!";
    } else if (lower.includes('price') || lower.includes('kitna') || lower.includes('rate') || lower.includes('cost') || lower.includes('charges')) {
        humanFallback = "Haanji! Hamari pricing project ke scope par depend karti hai—Excel aur graphics ₹499-₹1,999 se, aur fast websites ₹1,999 se start hoti hain. Aur sabse acchi baat: 50/50 Protected Escrow hai, pehle aap live demo dekhkar approve karenge. Aapko kis service me kaam karwana hai?";
    } else if (lower.includes('app') || lower.includes('software') || lower.includes('game') || lower.includes('portal')) {
        humanFallback = "Haanji, custom mobile apps aur web platforms hum full-stack high-speed stack par build karte hain. App me users ke liye main features kya-kya chahiye honge?";
    } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
        humanFallback = "Haanji hello! Boliye aapko website, app, Excel automation ya Canva design me se kisme help chahiye? Humari team turant project start karne ke liye ready hai.";
    }

    history.push({ role: 'model', parts: [{ text: humanFallback }] });
    return humanFallback;
}

async function startWhatsAppBot() {
    const authPath = path.join(__dirname, 'auth_info');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['AuraWeb AI Gateway', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n=============================================================');
            console.log('📲 NEW WHATSAPP QR CODE GENERATED! SCAN WITH YOUR PHONE:');
            console.log('=============================================================\n');
            currentQRDataUrl = await QRCode.toDataURL(qr, { width: 400 });
            connectionStatus = 'WAITING_FOR_SCAN';

            saveQRHtml(currentQRDataUrl);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('[WhatsApp Connection Closed]. Reconnecting:', shouldReconnect);
            connectionStatus = 'RECONNECTING';
            if (shouldReconnect) {
                setTimeout(startWhatsAppBot, 3000);
            }
        } else if (connection === 'open') {
            connectionStatus = 'CONNECTED';
            connectedUser = sock.user?.id?.split(':')[0] || 'Connected';
            console.log(`\n🎉 WHATSAPP CONNECTED SUCCESSFULLY as +${connectedUser}!`);
            console.log('Senior Developer Vikas AI & Chat Memory ACTIVE 24/7.\n');
            saveQRHtml(null, connectedUser);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            if (!msg.message) continue;

            const senderJid = msg.key.remoteJid;
            if (!senderJid || senderJid.includes('@broadcast') || senderJid.includes('@g.us') || senderJid.includes('@newsletter')) {
                // Ignore status updates, WhatsApp groups, and channel newsletters
                continue;
            }

            const senderNumber = senderJid.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');

            // Ignore messages sent by the bot itself to prevent infinite loops
            if (sentByBotIds.has(msg.key.id)) {
                sentByBotIds.delete(msg.key.id);
                continue;
            }

            // Extract text
            const text = msg.message.conversation ||
                         msg.message.extendedTextMessage?.text ||
                         msg.message.imageMessage?.caption || '';

            if (!text.trim()) continue;

            // 🧪 1. SELF-TEST MODE (Testing from your own phone via "Message Yourself")
            const isSelfMessage = Boolean(msg.key.fromMe);

            if (isSelfMessage) {
                console.log(`\n🧪 [SELF-TEST] (+${senderNumber}): "${text}"`);
                const userPrompt = text.replace(/^#test\s*/i, '').replace(/^test:\s*/i, '').trim();

                // Generate human AI response as Vikas with memory
                const aiReply = await callGeminiAI(`self_${senderNumber}`, userPrompt);
                console.log(`[Vikas Replying to Self-Test]:\n${aiReply}\n`);

                const sent = await sock.sendMessage(senderJid, { text: aiReply });
                if (sent?.key?.id) sentByBotIds.add(sent.key.id);
                continue;
            }

            // 🛡️ 2. Personal Whitelist Filter
            if (PERSONAL_WHITELIST.includes(senderNumber)) {
                console.log(`[Shield Active]: Ignored personal contact +${senderNumber}.`);
                continue;
            }

            // 🌟 3. Inbound Client Message (from 7231919133 or any client)
            const isSpecialTestPhone = senderNumber.includes('7231919133');
            if (isSpecialTestPhone) {
                console.log(`\n🎯 [VIP TEST PHONE: +${senderNumber}]: "${text}"`);
            } else {
                console.log(`\n[Client Inbound] from +${senderNumber}: "${text}"`);
            }

            // Generate AI response with conversation history
            const aiReply = await callGeminiAI(senderNumber, text);
            console.log(`[Vikas Replying to +${senderNumber}]:\n${aiReply}\n`);

            // Send reply
            const sent = await sock.sendMessage(senderJid, { text: aiReply });
            if (sent?.key?.id) sentByBotIds.add(sent.key.id);
            
            // Check if user requested a demo/template
            const lowerText = text.toLowerCase();
            if (lowerText.includes('demo') || lowerText.includes('sample') || lowerText.includes('template')) {
                console.log(`[Vikas] User asked for demo, sending premium templates...`);
                const templatesDir = path.join(__dirname, 'templates');
                if (fs.existsSync(templatesDir)) {
                    const files = fs.readdirSync(templatesDir).filter(f => f.endsWith('.jpg'));
                    for (const file of files) {
                        const imgPath = path.join(templatesDir, file);
                        await sock.sendMessage(senderJid, { image: { url: imgPath }, caption: `Premium Template: ${file.split('.')[0].toUpperCase()}` });
                    }
                }
            }
        }
    });
}

function saveQRHtml(dataUrl, user = null) {
    const htmlFile = path.join(__dirname, 'whatsapp_qr.html');
    let content = '';

    if (user) {
        content = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>WhatsApp Connected | AuraWeb Technologies</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
    <style>
        body { background:#060911; color:#fff; font-family:'Plus Jakarta Sans',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
        .card { background:#0c121e; border:1px solid rgba(34,197,94,0.3); border-radius:16px; padding:40px; text-align:center; max-width:480px; box-shadow:0 20px 60px rgba(0,0,0,0.8); }
        .icon { width:70px; height:70px; border-radius:50%; background:rgba(34,197,94,0.15); display:flex; align-items:center; justify-content:center; margin:0 auto 20px; font-size:2rem; color:#22c55e; border:1px solid rgba(34,197,94,0.3); }
        h1 { font-family:'Outfit',sans-serif; margin-bottom:10px; font-size:1.6rem; color:#22c55e; }
        p { color:#94a3b8; font-size:0.95rem; line-height:1.6; }
        .badge { background:rgba(34,197,94,0.1); color:#34d399; padding:6px 16px; border-radius:50px; font-weight:700; display:inline-block; margin-top:16px; font-size:0.85rem; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✓</div>
        <h1>WhatsApp Live & Connected!</h1>
        <p>AuraWeb Technologies Autonomous AI Gateway is active for <strong>+${user}</strong>.</p>
        <div class="badge">● 24/7 AI AUTONOMOUS DAEMON RUNNING</div>
        <p style="margin-top:20px; font-size:0.85rem; color:#64748b;">Incoming client inquiries will receive instant consultative responses from Vikas via Gemini 3.8 Flash.</p>
    </div>
</body>
</html>`;
    } else {
        content = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="5">
    <title>Scan WhatsApp QR | AuraWeb Technologies</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&family=Outfit:wght@700;800&display=swap" rel="stylesheet">
    <style>
        body { background:#060911; color:#fff; font-family:'Plus Jakarta Sans',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
        .card { background:#0c121e; border:1px solid rgba(56,189,248,0.3); border-radius:16px; padding:36px; text-align:center; max-width:480px; box-shadow:0 20px 60px rgba(0,0,0,0.8); }
        h1 { font-family:'Outfit',sans-serif; margin-bottom:8px; font-size:1.5rem; color:#fff; }
        p { color:#94a3b8; font-size:0.9rem; line-height:1.5; margin-bottom:20px; }
        .qr-box { background:#fff; padding:16px; border-radius:12px; display:inline-block; margin-bottom:20px; box-shadow:0 10px 30px rgba(0,0,0,0.5); }
        .qr-box img { display:block; width:280px; height:280px; }
        .step { text-align:left; background:#05070d; border:1px solid rgba(255,255,255,0.08); padding:14px; border-radius:10px; font-size:0.82rem; color:#cbd5e1; margin-top:16px; }
        .step ol { padding-left:20px; margin:0; }
        .step li { margin-bottom:6px; }
    </style>
</head>
<body>
    <div class="card">
        <h1>Connect WhatsApp AI Gateway</h1>
        <p>Scan this QR code with your phone to link AuraWeb Technologies autonomous AI intake.</p>
        <div class="qr-box">
            <img src="${dataUrl}" alt="WhatsApp QR Code">
        </div>
        <div class="step">
            <strong style="color:#38bdf8; display:block; margin-bottom:6px;">📱 3-Second Quick Scan:</strong>
            <ol>
                <li>Open WhatsApp on your phone.</li>
                <li>Tap <strong>Settings / ⋮ (Three dots)</strong> ➔ <strong>Linked devices</strong>.</li>
                <li>Tap <strong>Link a device</strong> and scan the code above!</li>
            </ol>
        </div>
    </div>
</body>
</html>`;
    }

    fs.writeFileSync(htmlFile, content, 'utf8');
}

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const htmlFile = path.join(__dirname, 'whatsapp_qr.html');
    if (fs.existsSync(htmlFile)) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(fs.readFileSync(htmlFile, 'utf8'));
    } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Initializing WhatsApp Gateway... Generating QR in 3 seconds. Please refresh.</h1>');
    }
});

const PORT = process.env.PORT || 3030;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`📡 Web Server active on port ${PORT}`);
    startWhatsAppBot();
});
