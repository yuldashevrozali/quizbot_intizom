require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const express = require("express");
const fs = require("fs");
const path = require("path");

// =============================
// ENV
// =============================
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_TOKEN2 = process.env.BOT_TOKEN2;
const ADMIN_ID = String(process.env.ADMIN_ID || ""); // string qilib olamiz
const CHANNEL = process.env.CHANNEL_USERNAME; // "mychannel" ( @sizsiz )

if (!BOT_TOKEN || !BOT_TOKEN2) {
  console.error("❌ BOT_TOKEN yoki BOT_TOKEN2 yo‘q. Render Environment ga qo‘sh.");
}

if (!ADMIN_ID) {
  console.warn("⚠️ ADMIN_ID yo‘q. /adminman ishlamasligi mumkin.");
}

if (!CHANNEL) {
  console.warn("⚠️ CHANNEL_USERNAME yo‘q. Obuna tekshirish ishlamasligi mumkin.");
}

// =============================
// BOTS
// =============================
const bot1 = new Telegraf(BOT_TOKEN);
const bot2 = new Telegraf(BOT_TOKEN2);

// =============================
// STORAGE (tests.json)
// Render’da file system ba’zan ephemeral bo‘ladi,
// lekin demo uchun ishlaydi. Pro versiyada DB ishlat.
// =============================
const DATA_FILE = path.join(__dirname, "tests.json");

let store = { tests: {}, users: {} };

try {
  if (fs.existsSync(DATA_FILE)) {
    store = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
} catch (e) {
  console.error("Failed to read tests.json:", e);
}

store.tests = store.tests || {};
store.users = store.users || {};

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error("Failed to save tests.json:", e);
  }
}

// =============================
// STATES
// =============================
let userSession = {};        // { [userId]: {step, code} }
let adminState = {};         // { [adminId]: {step, code} }
let userReg = {};            // { [userId]: {step, name, phone} }
let leaderboardState = {};   // { [userId]: true }

// =============================
// BOT SETUP
// =============================
function setupBot(bot) {
  // START
  bot.start((ctx) => {
    const id = String(ctx.from.id);

    if (store.users[id]) {
      return ctx.reply(
        "Siz allaqachon ro'yxatdan o'tgansiz. Menudan foydalaning.",
        Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize()
      );
    }

    userReg[id] = { step: 1 };
    return ctx.reply(
      "📝 To‘liq Familiya-Ism kiriting (faqat lotin harflarida):\n\nMasalan: Mashrapov Aburayxon"
    );
  });

  // ADMIN PANEL
  bot.command("adminman", (ctx) => {
    const id = String(ctx.from.id);
    console.log("ADMIN CMD:", id);

    if (id !== ADMIN_ID) return ctx.reply("Siz admin emassiz ❌");

    return ctx.reply(
      "Admin panelga xush kelibsiz!",
      Markup.keyboard([["➕ Test qo‘shish"]]).resize()
    );
  });

  bot.hears("➕ Test qo‘shish", (ctx) => {
    const id = String(ctx.from.id);
    if (id !== ADMIN_ID) return ctx.reply("Faqat admin test qo‘sha oladi ❌");

    adminState[id] = { step: 1 };
    return ctx.reply("Yangi test kodini kiriting (5 xonali):");
  });

  // USER: TEST ISHLASH
  bot.hears("📝 Test ishlash", (ctx) => {
    const id = String(ctx.from.id);
    userSession[id] = { step: 1 };
    return ctx.reply("Test kodini kiriting (masalan 15214):");
  });

  // LEADERBOARD
  bot.hears("🏆 Leaderboard", (ctx) => {
    const id = String(ctx.from.id);
    leaderboardState[id] = true;
    return ctx.reply("Leaderboard ko'rish uchun test kodini kiriting (masalan 11134):");
  });

  // CONTACT HANDLER
  bot.on("contact", (ctx) => {
    const id = String(ctx.from.id);

    if (userReg[id] && userReg[id].step === 2) {
      const phone = ctx.message.contact.phone_number;
      userReg[id].phone = phone;
      userReg[id].step = 3;

      if (!CHANNEL) {
        // kanal env yo‘q bo‘lsa ham ro‘yxatdan o‘tkazib yuboramiz (demo)
        store.users[id] = { name: userReg[id].name, phone: userReg[id].phone, solvedTests: {} };
        save();
        delete userReg[id];
        return ctx.reply(
          "✅ Ro'yxatdan o'tdingiz! (CHANNEL_USERNAME yo‘q, obuna tekshirilmagan)",
          Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize()
        );
      }

      return ctx.reply(
        "Botdan foydalanish uchun ushbu kanalga obuna bo'lishingiz zarur:",
        Markup.inlineKeyboard([
          [Markup.button.url("Kanalga obuna bo'lish", `https://t.me/${CHANNEL}`)],
          [Markup.button.callback("Tekshirish", "check_sub")],
        ])
      );
    }
  });

  // CALLBACK QUERY HANDLER
  bot.action("check_sub", async (ctx) => {
    const id = String(ctx.from.id);

    try {
      if (!CHANNEL) {
        await ctx.answerCbQuery("CHANNEL_USERNAME yo‘q.");
        return;
      }

      const member = await ctx.telegram.getChatMember(`@${CHANNEL}`, Number(id));

      if (member.status === "member" || member.status === "administrator" || member.status === "creator") {
        store.users[id] = {
          name: userReg[id]?.name || "Unknown",
          phone: userReg[id]?.phone || "",
          solvedTests: {},
        };
        save();
        delete userReg[id];

        await ctx.answerCbQuery("✅ Obuna tasdiqlandi!");
        return ctx.reply(
          "Botimizdan foydalanishingiz mumkin! Test ishlash uchun quyidagi tugmani bosing.",
          Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize()
        );
      } else {
        return ctx.answerCbQuery("Siz kanalga obuna bo'lmagansiz. Avval obuna bo'ling.");
      }
    } catch (e) {
      console.error(e);
      return ctx.answerCbQuery("Xatolik yuz berdi.");
    }
  });

  // TEXT HANDLER — OXIRIDA
  bot.on("text", (ctx) => {
    const id = String(ctx.from.id);
    const text = ctx.message.text.trim();

    // ============ REGISTRATION FLOW ============
    if (userReg[id]) {
      const reg = userReg[id];

      if (reg.step === 1) {
        if (!/^[a-zA-Z\s]+$/.test(text)) return ctx.reply("Faqat lotin harflarida kiriting.");
        if (text.length < 3 || text.length > 50)
          return ctx.reply("Ism 3-50 ta belgidan iborat bo'lishi kerak.");

        reg.name = text;
        reg.step = 2;

        return ctx.reply(
          "📞 Telefon raqamingizni yuboring:",
          Markup.keyboard([[Markup.button.contactRequest("📞 Telefon raqamini yuborish")]]).resize()
        );
      }
      // reg step 2/3 da text kiritsa – hech narsa qilmaymiz
    }

    // ============ ADMIN FLOW ============
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
        const lines = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

        const questions = [];

        for (const line of lines) {
          const match = line.match(/^(\d+)\.\s*(.+)$/);
          if (match) {
            questions.push({ id: Number(match[1]), answer: match[2].trim().toLowerCase() });
          }
        }

        if (questions.length === 0)
          return ctx.reply("Xato format, qayta kiriting:\n1.a\n2.b\n3.c");

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

    // ============ USER FLOW ============
    if (userSession[id]) {
      // ro‘yxatdan o‘tmagan bo‘lsa, majburlaymiz:
      if (!store.users[id]) {
        return ctx.reply("Avval /start qilib ro'yxatdan o'ting ✅");
      }

      const us = userSession[id];

      // STEP 1 — CODE INPUT
      if (us.step === 1) {
        if (!/^\d{5}$/.test(text)) return ctx.reply("Kod 5 xonali bo‘lishi kerak.");
        if (!store.tests[text]) return ctx.reply("Bunday kodli test yo‘q. Qayta kiriting.");

        store.users[id].solvedTests = store.users[id].solvedTests || {};
        if (store.users[id].solvedTests[text] !== undefined)
          return ctx.reply("Siz bu testni allaqachon yechgansiz. Boshqa test kodini kiriting.");

        us.code = text;
        us.step = 2;
        return ctx.reply("Test kalitlaringizni kiriting (masalan:\n1.a\n2.b\n3.c\n4.d)");
      }

      // STEP 2 — USER ANSWERS
      if (us.step === 2) {
        const test = store.tests[us.code];
        if (!test) {
          delete userSession[id];
          return ctx.reply("Test topilmadi. Qayta urinib ko‘ring.");
        }

        const lines = text
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);

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

        store.users[id].solvedTests = store.users[id].solvedTests || {};
        store.users[id].solvedTests[us.code] = correct;
        save();

        delete userSession[id];
        return ctx.reply(`📊 Natija:\n${total} ta savoldan ${correct} tasini to‘g‘ri topdingiz.`);
      }
    }

    // ============ LEADERBOARD FLOW ============
    if (leaderboardState[id]) {
      delete leaderboardState[id];

      if (!store.tests[text]) {
        return ctx.reply("Noto'g'ri test kodi. Qayta kiriting.");
      }

      const testCode = text;

      const scores = Object.entries(store.users)
        .filter(([_, user]) => user?.solvedTests && user.solvedTests[testCode] !== undefined)
        .map(([_, user]) => ({ name: user.name, score: user.solvedTests[testCode] }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 100);

      let msg = `🏆 Leaderboard for test ${testCode}:\n`;
      scores.forEach((s, i) => {
        msg += `${i + 1}. ${s.name} - ${s.score}\n`;
      });
      if (scores.length === 0) msg += "Hozircha hech kim bu testni yechmagan.";

      return ctx.reply(msg);
    }

    // default
    return ctx.reply("Menudan foydalaning 😊", Markup.keyboard([["📝 Test ishlash"], ["🏆 Leaderboard"]]).resize());
  });
}

// Setup both bots
setupBot(bot1);
setupBot(bot2);

// =============================
// WEBHOOK SERVER (Render) - FIXED
// =============================
const app = express();
app.use(express.json());

// health
app.get("/", (req, res) => res.status(200).send("OK"));

// IMPORTANT: POST + exact path
app.post("/telegram1", bot1.webhookCallback("/telegram1"));
app.post("/telegram2", bot2.webhookCallback("/telegram2"));

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log("Server running on port", PORT);

  // Render’da bo‘lmasa fallback:
  const BASE_URL =
    process.env.RENDER_EXTERNAL_URL || "https://quizbot-intizom.onrender.com";

  const WEBHOOK_URL1 = `${BASE_URL}/telegram1`;
  const WEBHOOK_URL2 = `${BASE_URL}/telegram2`;

  try {
    await bot1.telegram.setWebhook(WEBHOOK_URL1, { drop_pending_updates: true });
    await bot2.telegram.setWebhook(WEBHOOK_URL2, { drop_pending_updates: true });

    console.log("Bot1 webhook set to", WEBHOOK_URL1);
    console.log("Bot2 webhook set to", WEBHOOK_URL2);
  } catch (e) {
    console.error("❌ Webhook set error:", e);
  }
});
