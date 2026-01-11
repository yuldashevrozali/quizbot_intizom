require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");

const bot1 = new Telegraf(process.env.BOT_TOKEN);
const bot2 = new Telegraf(process.env.BOT_TOKEN2);
const ADMIN_ID = process.env.ADMIN_ID;
const CHANNEL = process.env.CHANNEL_USERNAME;
const DATA_FILE = "./tests.json";

let store = { tests: {}, users: {} };
if (fs.existsSync(DATA_FILE)) {
  store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  store.users = store.users || {};
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}

// user session for test code
let userSession = {};
let adminState = {};
// user registration state
let userReg = {};
// leaderboard state
let leaderboardState = {};

function setupBot(bot) {
// =============================
// START
// =============================
bot.start((ctx) => {
  const id = ctx.from.id;
  if (store.users[id]) {
    ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz. Menudan foydalaning.", Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize());
  } else {
    userReg[id] = { step: 1 };
    ctx.reply("📝 To‘liq Familiya-Ism kiriting (faqat lotin harflarida):\n\nMasalan: Mashrapov Aburayxon");
  }
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
// LEADERBOARD
// =============================
bot.hears("🏆 Leaderboard", (ctx) => {
  leaderboardState[ctx.from.id] = true;
  ctx.reply("Leaderboard ko'rish uchun test kodini kiriting (masalan 11134):");
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
      return ctx.reply("Test kalitlarini kiriting (masalan:\n1.a\n2.b\n3.c\n4.d)");
    }

    // STEP 2 — ANSWER KEYS
    if (state.step === 2) {
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      const questions = [];

      for (const line of lines) {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          questions.push({ id: Number(match[1]), answer: match[2].trim().toLowerCase() });
        }
      }

      if (questions.length === 0) return ctx.reply("Xato format, qayta kiriting:\n1.a\n2.b\n3.c");

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
      if (store.users[id] && store.users[id].solvedTests[text]) return ctx.reply("Siz bu testni allaqachon yechgansiz. Boshqa test kodini kiriting.");

      us.code = text;
      us.step = 2;
      return ctx.reply("Test kalitlaringizni kiriting (masalan:\n1.a\n2.b\n3.c\n4.d)");
    }

    // STEP 2 — USER ANSWERS
    if (us.step === 2) {
      const test = store.tests[us.code];
      const lines = text.split('\n').map(line => line.trim()).filter(line => line);
      const answers = {};

      for (const line of lines) {
        const match = line.match(/^(\d+)\.\s*(.+)$/);
        if (match) {
          answers[Number(match[1])] = match[2].trim().toLowerCase();
        }
      }

      let correct = 0;
      const total = test.questions.length;

      test.questions.forEach((q) => {
        if (answers[q.id] && answers[q.id] === q.answer) correct++;
      });

      if (!store.users[id].solvedTests[us.code]) {
        store.users[id].solvedTests[us.code] = correct;
        save();
      }

      delete userSession[id];

      return ctx.reply(`📊 Natija:\n${total} ta savoldan ${correct} tasini to‘g‘ri topdingiz.`);
    }
  }

  // ================= LEADERBOARD FLOW =================
  if (leaderboardState[id]) {
    delete leaderboardState[id];
    if (store.tests[text]) {
      const testCode = text;
      const scores = Object.entries(store.users).filter(([id, user]) => user.solvedTests[testCode]).map(([id, user]) => {
        return { name: user.name, score: user.solvedTests[testCode] };
      }).sort((a, b) => b.score - a.score).slice(0, 100);
      let msg = `🏆 Leaderboard for test ${testCode}:\n`;
      scores.forEach((s, i) => {
        msg += `${i + 1}. ${s.name} - ${s.score}\n`;
      });
      if (scores.length === 0) msg += "Hozircha hech kim bu testni yechmagan.";
      ctx.reply(msg);
    } else {
      ctx.reply("Noto'g'ri test kodi. Qayta kiriting.");
    }
    return;
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
      store.users[id] = { name: userReg[id].name, phone: userReg[id].phone, solvedTests: {} };
      save();
      delete userReg[id];
      ctx.reply("Botimizdan foydalanishingiz mumkin! Test ishlash uchun quyidagi tugmani bosing.", Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize());
    } else {
      ctx.answerCbQuery("Siz kanalga obuna bo'lmagansiz. Avval obuna bo'ling.");
    }
  } catch (e) {
    console.error(e);
    ctx.answerCbQuery("Xatolik yuz berdi.");
  }
});
}

// Setup both bots
setupBot(bot1);
setupBot(bot2);

// =============================
// BOT RUN (WEBHOOK MODE)
// =============================
const app = express();
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Bot is running');
});

// Webhook endpoints
app.use('/telegram1', bot1.webhookCallback('/telegram1'));
app.use('/telegram2', bot2.webhookCallback('/telegram2'));

// Set webhook or polling
if (process.env.RENDER_EXTERNAL_URL) {
  const WEBHOOK_URL1 = process.env.RENDER_EXTERNAL_URL + '/telegram1';
  const WEBHOOK_URL2 = process.env.RENDER_EXTERNAL_URL + '/telegram2';
  bot1.telegram.setWebhook(WEBHOOK_URL1).then(() => {
    console.log(`Bot1 webhook set to ${WEBHOOK_URL1}`);
  });
  bot2.telegram.setWebhook(WEBHOOK_URL2).then(() => {
    console.log(`Bot2 webhook set to ${WEBHOOK_URL2}`);
  });
} else {
  bot1.launch().then(() => {
    console.log('Bot1 started in polling mode');
  });
  bot2.launch().then(() => {
    console.log('Bot2 started in polling mode');
  });
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
