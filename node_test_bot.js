require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNEL = process.env.CHANNEL_USERNAME;
const DATA_FILE = "./tests.json";

// =============================
// STORAGE
// =============================
let store = { tests: {} };
if (fs.existsSync(DATA_FILE)) {
  store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// user session for test code
let userSession = {};
let adminState = {};
// user registration state
let userReg = {};


// =============================
// START
// =============================
bot.start((ctx) => {
  const id = ctx.from.id;
  userReg[id] = { step: 1 };
  ctx.reply("📝 To‘liq Familiya-Ism kiriting (faqat lotin harflarida):\n\nMasalan: Mashrapov Aburayxon");
});


// =============================
// ADMIN PANEL (BIRINCHI TURADI!)
// =============================
bot.command("adminman", (ctx) => {
  console.log("ADMIN CMD:", ctx.from.id);

  if (ctx.from.id.toString() !== ADMIN_ID)
    return ctx.reply("Siz admin emassiz ❌");

  ctx.reply(
    "Admin panelga xush kelibsiz!",
    Markup.keyboard([["➕ Test qo‘shish"]]).resize()
  );
});

// ADMIN add test
bot.hears("➕ Test qo‘shish", (ctx) => {
  if (ctx.from.id.toString() !== ADMIN_ID)
    return ctx.reply("Faqat admin test qo‘sha oladi ❌");

  adminState[ctx.from.id] = { step: 1 };
  ctx.reply("Yangi test kodini kiriting (5 xonali):");
});


// =============================
// USER: TEST ISHLASH
// =============================
bot.hears("📝 Test ishlash", (ctx) => {
  const id = ctx.from.id;
  userSession[id] = { step: 1 };
  ctx.reply("Test kodini kiriting (masalan 15214):");
});


// =============================
// TEXT HANDLER — OXIRIDA TURADI!
// =============================
bot.on("text", (ctx) => {
  const id = ctx.from.id.toString();
  const text = ctx.message.text.trim();

  // ================= REGISTRATION FLOW =================
  if (userReg[id]) {
    const reg = userReg[id];

    if (reg.step === 1) {
      if (!/^[a-zA-Z\s]+$/.test(text)) return ctx.reply("Faqat lotin harflarida kiriting.");
      if (text.length < 3 || text.length > 50) return ctx.reply("Ism 3-50 ta belgidan iborat bo'lishi kerak.");

      reg.name = text;
      reg.step = 2;
      return ctx.reply("📞 Telefon raqamingizni yuboring:", Markup.keyboard([[Markup.button.contactRequest("📞 Telefon raqamini yuborish")]]).resize());
    }
  }

  // ================= ADMIN FLOW =================
  if (adminState[id]) {
    const state = adminState[id];

    // STEP 1 — TEST CODE
    if (state.step === 1) {
      if (!/^\d{5}$/.test(text)) return ctx.reply("Kod 5 xonali raqam bo‘lishi kerak.");
      if (store.tests[text]) return ctx.reply("Bu kod bilan test mavjud. Yangi kod kiriting:");

      state.code = text;
      state.step = 2;
      return ctx.reply("Test kalitlarini kiriting (masalan 1a2b3c4d):");
    }

    // STEP 2 — ANSWER KEYS
    if (state.step === 2) {
      const regex = /(\d+)([a-z])/gi;
      let match;
      const questions = [];

      while ((match = regex.exec(text.toLowerCase())) !== null) {
        questions.push({ id: Number(match[1]), answer: match[2] });
      }

      if (questions.length === 0) return ctx.reply("Xato format, qayta kiriting: 1a2b3c");

      store.tests[state.code] = {
        code: state.code,
        createdAt: new Date().toISOString(),
        questions,
      };

      save();
      delete adminState[id];

      return ctx.reply(`✅ Test saqlandi! Kod: ${state.code}, savollar: ${questions.length}`);
    }
  }

  // ================= USER FLOW =================
  if (userSession[id]) {
    const us = userSession[id];

    // STEP 1 — CODE INPUT
    if (us.step === 1) {
      if (!/^\d{5}$/.test(text)) return ctx.reply("Kod 5 xonali bo‘lishi kerak.");
      if (!store.tests[text]) return ctx.reply("Bunday kodli test yo‘q. Qayta kiriting.");

      us.code = text;
      us.step = 2;
      return ctx.reply("Test kalitlaringizni kiriting (masalan 1a2b3c4d):");
    }

    // STEP 2 — USER ANSWERS
    if (us.step === 2) {
      const test = store.tests[us.code];
      const regex = /(\d+)([a-z])/gi;
      let match;
      const answers = {};

      while ((match = regex.exec(text.toLowerCase())) !== null) {
        answers[Number(match[1])] = match[2];
      }

      let correct = 0;
      const total = test.questions.length;

      test.questions.forEach((q) => {
        if (answers[q.id] && answers[q.id] === q.answer) correct++;
      });

      delete userSession[id];

      return ctx.reply(`📊 Natija:\n${total} ta savoldan ${correct} tasini to‘g‘ri topdingiz.`);
    }
  }
});


// =============================
// CONTACT HANDLER
// =============================
bot.on('contact', (ctx) => {
  const id = ctx.from.id.toString();
  if (userReg[id] && userReg[id].step === 2) {
    const phone = ctx.message.contact.phone_number;
    userReg[id].phone = phone;
    userReg[id].step = 3;
    ctx.reply("Botdan foydalanish uchun ushbu kanalga obuna bo'lishingiz zarur:", Markup.inlineKeyboard([
      [Markup.button.url("Kanalga obuna bo'lish", `https://t.me/${CHANNEL}`)],
      [Markup.button.callback("Tekshirish", 'check_sub')]
    ]));
  }
});

// =============================
// CALLBACK QUERY HANDLER
// =============================
bot.action('check_sub', async (ctx) => {
  const id = ctx.from.id;
  try {
    const member = await ctx.telegram.getChatMember(`@${CHANNEL}`, id);
    if (member.status === 'member' || member.status === 'administrator' || member.status === 'creator') {
      delete userReg[id];
      ctx.reply("Botimizdan foydalanishingiz mumkin! Test ishlash uchun quyidagi tugmani bosing.", Markup.keyboard([["📝 Test ishlash"]]).resize());
    } else {
      ctx.answerCbQuery("Siz kanalga obuna bo'lmagansiz. Avval obuna bo'ling.");
    }
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery("Xatolik yuz berdi.");
  }
});

// =============================
// BOT RUN (WEBHOOK MODE)
// =============================
const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Bot is running');
});

// Webhook endpoint
app.use(bot.webhookCallback('/telegram'));

// Set webhook
const WEBHOOK_URL = process.env.RENDER_EXTERNAL_URL + '/telegram';
bot.telegram.setWebhook(WEBHOOK_URL).then(() => {
  console.log(`Webhook set to ${WEBHOOK_URL}`);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
