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
const { useMultiFileAuthState, makeCacheableSignalKeyStore, DisconnectReason } = baileys;

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

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6JDaPXY4NMFBJ0CK4jG4o495HwTfw1qlvXGoiQBx3Quvg';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const ARJIT_PHONE = process.env.ARJIT_DIRECT_PHONE || '+919071122560';

// 🛡️ PERSONAL PROTECTION FILTER:
// AI will NEVER auto-reply to any number in this list (family, friends & contacts from mobile).
const PERSONAL_WHITELIST = [
    '919071122560', '1800407267864', '919654297000', '919930683505',
    '919664229837', '918764723831', '917023627001', '919998811047', '917297884140',
    '918739875825', '917375082590', '918278604903', '919783838772', '918619080492',
    '917665377315', '919024967276', '919928918894', '919660099398', '919054805495',
    '918003031489', '917073228441', '917742043891', '917990893591', '916376148941',
    '919352187466', '917597347210', '919104637538', '919983214417', '9170283666403',
    '917340145929', '918302551480', '916377201821', '918239986154', '917073254492',
    '918904345072', '919351974207', '919983253180', '919916220307', '919694885176',
    '916367222589', '919509549657', '917000770007', '919828147599', '919358757244',
    '919982427308', '916367316689', '919352015910', '918104710610', '919610279310',
    '918278632913', '917877011745', '917710955555', '918955147364', '917023998760',
    '917691831772', '919398426006', '919024955396', '919509729688', '917891530030',
    '917665323827', '919351210241', '917851939793', '917339709661', '916375579136',
    '918796321758', '919358558280', '919256784284', '919982244818', '918209401143',
    '919079803356', '919982356200', '918955018484', '918306364906', '918302419801',
    '917665618720', '918114403817', '918949396303', '919358048327', '917229999245',
    '917678128593', '919829284100', '919636237461', '919982423221', '918000197251',
    '919358429121', '919960698251', '916367794353', '917073880472', '919982155567',
    '919982108085', '918290481956', '919461062705', '918788438219', '917073232876',
    '919261827945', '918619003340', '917976084576', '919351900395', '918290425990',
    '918890332908', '918079068014', '919680843626', '919166827437', '917023660963',
    '917357833358', '916377131569'
];

const PERSONAL_LAST10_SET = new Set(
    PERSONAL_WHITELIST.map(num => String(num).replace(/[^0-9]/g, '').slice(-10)).filter(n => n.length === 10)
);

function isPersonalShielded(senderNumber) {
    const clean = (senderNumber || '').replace(/[^0-9]/g, '');
    if (!clean) return false;
    // Arjit's test phone - ALWAYS allowed to test and chat
    if (clean.includes('7231919133') || clean.includes('9982427308')) return false;
    if (PERSONAL_WHITELIST.includes(clean)) return true;
    const last10 = clean.slice(-10);
    if (last10.length === 10 && PERSONAL_LAST10_SET.has(last10)) return true;
    return false;
}

let currentQRDataUrl = null;
let connectionStatus = 'WAITING_FOR_SCAN';
let connectedUser = null;

const CANDIDATE_MODELS = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite'
];

// 🧠 Multi-turn conversation memory (stores last 10 messages per chat)
const chatHistories = new Map();
const sentByBotIds = new Set();
const sentMessagesCache = new Map();

function getHistory(chatId) {
    if (!chatHistories.has(chatId)) {
        chatHistories.set(chatId, []);
    }
    return chatHistories.get(chatId);
}

const SYSTEM_PROMPT = `You are Vikas, Senior Technical Consultant & Development Partner at AuraWeb Technologies Pvt. Ltd. (working alongside Founder & CTO Arjit).
You are directly chatting with a prospective client on WhatsApp or Instagram.

VOICE & BEHAVIOR (CRITICAL RULES):
1. Language: Professional, polite, consultative conversational Hindi / Hinglish. Sound 100% like a seasoned human professional.
2. FIRST CONSULT & DISCUSS REQUIREMENTS:
   - NEVER jump straight to "hum project start karne ke liye ready hain" or rushing into work.
   - First listen to the client, understand their needs, and discuss their exact requirements and scope politely.
   - Ask 1 or 2 relevant, thoughtful questions to clarify what they need (e.g. industry, target audience, preferred style/format, reference work).
3. ADAPT TO USER'S DOMAIN LIKE AN EXPERT:
   - RESUME / CV / PORTFOLIO: Ask about their field/job role, target company, whether they need an ATS-friendly format, modern corporate look, or graphic design. Discuss previous CV details if available.
   - EXCEL / GOOGLE SHEETS: Discuss what data they track, formula requirements, or if they need automated invoicing/dashboards.
   - CANVA / GRAPHICS: Discuss branding colors, poster/flyer purpose, or social media pack details.
   - WEBSITES / APPS: Discuss core user features, number of pages, or reference websites they like.
4. RESUME / CV TEMPLATES:
   - If the user provides their details (like name, education "12th pass", etc.) for a resume, DO NOT just send a website link.
   - You MUST offer 3 to 4 actual resume template styles (e.g., "1. Modern ATS-Friendly PDF", "2. Creative Canva Design", "3. Professional Corporate"). Tell them we will build it using these premium templates.
5. DEMO & LINKS:
   - NEVER just throw the website link directly. Always ask proactively first: "Kya aap humara live demo ya samples dekhna chahte hain?"
   - Only if they say yes, then share the showcase: https://auraweb-pvt-ltd.netlify.app
6. Keep messages warm, conversational, crisp (2-3 sentences max). No pushy sales talk. Always focus on understanding and discussion first.`;

async function callGeminiAI(chatId, userText) {
    const history = getHistory(chatId);
    history.push({ role: 'user', parts: [{ text: userText }] });

    for (const model of CANDIDATE_MODELS) {
        try {
            // FORCE the correct key, ignoring environment variables to prevent Render cache issues
            const FORCE_KEY = 'AQ.Ab8RN6JDaPXY4NMFBJ0CK4jG4o495HwTfw1qlvXGoiQBx3Quvg';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${FORCE_KEY}`;
            
            const requestBody = {
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                },
                contents: history
            };

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
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
    let humanFallback = "Haanji bilkul! Thoda sa details share kar dijiye aapki kya requirement hai, hum pehle discuss kar lete hain fir best solution suggest karunga.";
    if (lower.includes('resume') || lower.includes('cv') || lower.includes('biodata') || lower.includes('bio data')) {
        humanFallback = "Haanji bilkul! Resume ke liye pehle format aur details discuss kar lete hain—aap kis role ke liye apply kar rahe hain aur kitna experience hai? Agar koi purani CV ya reference ho toh zaroor share kijiye.";
    } else if (lower.includes('excel') || lower.includes('sheet') || lower.includes('macro') || lower.includes('vlookup') || lower.includes('dashboard')) {
        humanFallback = "Haanji! Excel me dynamic dashboards, automated sheets, aur formulas me aapki exact requirement kya hai? Thoda discuss kar lete hain taaki best setup suggest kar sakoon.";
    } else if (lower.includes('canva') || lower.includes('design') || lower.includes('banner') || lower.includes('poster') || lower.includes('flyer')) {
        humanFallback = "Haanji bilkul! Graphics aur creatives me aapko kis type ke designs chahiye? Thoda brand ya concept discuss kar lete hain.";
    } else if (lower.includes('demo') || lower.includes('sample') || lower.includes('prototype') || lower.includes('template')) {
        humanFallback = "Ji bilkul! Hamara official live showcase aap https://auraweb-pvt-ltd.netlify.app par dekh sakte hain. Aur aapke project ke liye hum 48 ghante me direct live demo ready karke dete hain bina advance payment ke (50/50 Protected Escrow). Aapke paas koi reference photo ya idea ho toh zaroor share karein!";
    } else if (lower.includes('price') || lower.includes('kitna') || lower.includes('rate') || lower.includes('cost') || lower.includes('charges')) {
        humanFallback = "Haanji! Hamari pricing project ke exact scope par depend karti hai—pehle aapki requirements samajh lete hain, uske baad realistic quote decide karenge. Aur 50/50 Protected Escrow hai, pehle live demo dekhkar approve karenge.";
    } else if (lower.includes('app') || lower.includes('software') || lower.includes('game') || lower.includes('portal')) {
        humanFallback = "Haanji, mobile apps aur web platforms hum full-stack high-speed stack par build karte hain. App ke main features aur workflow pehle discuss kar lete hain.";
    } else if (lower.includes('hi') || lower.includes('hello') || lower.includes('hey')) {
        humanFallback = "Haanji hello! Boliye aapko kis service ya project me help chahiye? Pehle aapki requirement samajh lete hain aur detail me discuss kar lete hain.";
    }

    history.push({ role: 'model', parts: [{ text: humanFallback }] });
    return humanFallback;
}

async function startWhatsAppBot() {
    const authPath = path.join(__dirname, 'auth_info');
    if (!fs.existsSync(authPath)) fs.mkdirSync(authPath, { recursive: true });
    
    const { state, saveCreds } = await useMultiFileAuthState(authPath);

    const sock = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
        },
        printQRInTerminal: true,
        logger: pino({ level: 'silent' }),
        browser: ['AuraWeb AI Gateway', 'Chrome', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        getMessage: async (key) => {
            if (key?.id && sentMessagesCache.has(key.id)) {
                return sentMessagesCache.get(key.id);
            }
            return undefined;
        }
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

            // 🧪 1. Messages sent by this phone (outgoing messages by Arjit)
            if (msg.key.fromMe) {
                // If it is in "Message Yourself" and explicitly tagged with #test
                const isSelfChat = senderJid.includes('9071122560');
                if (isSelfChat && text.toLowerCase().startsWith('#test')) {
                    const userPrompt = text.replace(/^#test\s*/i, '').trim();
                    console.log(`\n🧪 [SELF-TEST #test] (+${senderNumber}): "${userPrompt}"`);
                    const aiReply = await callGeminiAI(`self_${senderNumber}`, userPrompt);
                    console.log(`[Vikas Replying to Self-Test]:\n${aiReply}\n`);
                    const sent = await sock.sendMessage(senderJid, { text: aiReply });
                    if (sent?.key?.id) {
                        sentByBotIds.add(sent.key.id);
                        if (sent.message) sentMessagesCache.set(sent.key.id, sent.message);
                    }
                }
                // Skip all other outgoing messages so bot never interferes with Arjit's own typing
                continue;
            }

            // 🛡️ 2. Personal Protection Shield (All contacts from mobile)
            if (isPersonalShielded(senderNumber)) {
                console.log(`[Shield Active]: Ignored personal contact +${senderNumber} (Saved Contact Shield).`);
                continue;
            }

            // 🌟 3. Inbound Prospective Client Message
            console.log(`\n[Client Inbound] from +${senderNumber}: "${text}"`);

            // Acknowledge read and show typing indicator to force WhatsApp E2E key handshake
            try {
                await sock.readMessages([msg.key]);
                await sock.sendPresenceUpdate('composing', senderJid);
            } catch (e) {}

            // Generate AI response with conversation history
            const aiReply = await callGeminiAI(senderNumber, text);
            console.log(`[Vikas Replying to +${senderNumber}]:\n${aiReply}\n`);

            try {
                await sock.sendPresenceUpdate('paused', senderJid);
            } catch (e) {}

            // Send reply
            const sent = await sock.sendMessage(senderJid, { text: aiReply });
            if (sent?.key?.id) {
                sentByBotIds.add(sent.key.id);
                if (sent.message) {
                    sentMessagesCache.set(sent.key.id, sent.message);
                    if (sentMessagesCache.size > 200) {
                        const first = sentMessagesCache.keys().next().value;
                        sentMessagesCache.delete(first);
                    }
                }
            }
            
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
