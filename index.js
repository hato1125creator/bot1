import 'dotenv/config';
import fetch from 'node-fetch';
import {
  Client,
  GatewayIntentBits,
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const GAS_URL = process.env.GAS_URL;

// --- スラッシュコマンド登録 ---
const commands = [
  new SlashCommandBuilder().setName('addschedule').setDescription('活動予定を追加'),
  new SlashCommandBuilder().setName('list').setDescription('予定一覧を表示')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log('✅ Slashコマンド登録完了');
})();

// --- ボットイベント ---
client.on(Events.InteractionCreate, async interaction => {

  // ---------- /addschedule コマンド ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'addschedule') {

    const modal = new ModalBuilder()
      .setCustomId('addScheduleModal')
      .setTitle('予定タイトル入力');

    const titleInput = new TextInputBuilder()
      .setCustomId('title')
      .setLabel('予定タイトル')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(titleInput));

    await interaction.showModal(modal);
  }

  // ---------- モーダル送信 ----------
  if (interaction.isModalSubmit() && interaction.customId === 'addScheduleModal') {
    await interaction.deferReply({ ephemeral: true }); // ← deferReply を先に

    const title = interaction.fields.getTextInputValue('title');

    // 日付選択メニュー（2週間分）
    const today = new Date();
    const dateOptions = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const label = d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
      dateOptions.push({ label, value: d.toISOString().split('T')[0] });
    }

    const dateSelect = new StringSelectMenuBuilder()
      .setCustomId(`selectDate|${title}`)
      .setPlaceholder('日付を選択')
      .addOptions(dateOptions);

    await interaction.editReply({
      content: '日付を選択してください',
      components: [new ActionRowBuilder().addComponents(dateSelect)]
    });
  }

  // ---------- 日付選択 ----------
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('selectDate|')) {
    const title = interaction.customId.split('|')[1];
    const date = interaction.values[0];

    const times = [];
    for (let h = 9; h <= 17; h++) {
      times.push({ label: `${h}:00`, value: `${h}:00` });
      times.push({ label: `${h}:30`, value: `${h}:30` });
    }

    const timeSelect = new StringSelectMenuBuilder()
      .setCustomId(`selectTime|${title}|${date}`)
      .setPlaceholder('時間を選択')
      .addOptions(times);

    await interaction.update({
      content: '時間を選択してください',
      components: [new ActionRowBuilder().addComponents(timeSelect)]
    });
  }

  // ---------- 時間選択 ----------
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('selectTime|')) {
    const [_, title, date] = interaction.customId.split('|');
    const time = interaction.values[0];

    const places = ['会議室A', '会議室B', '体育館', '講堂', 'その他'].map(p => ({ label: p, value: p }));
    const placeSelect = new StringSelectMenuBuilder()
      .setCustomId(`selectPlace|${title}|${date}|${time}`)
      .setPlaceholder('場所を選択')
      .addOptions(places);

    await interaction.update({
      content: '場所を選択してください',
      components: [new ActionRowBuilder().addComponents(placeSelect)]
    });
  }

  // ---------- 場所選択 ----------
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('selectPlace|')) {
    const [_, title, date, time] = interaction.customId.split('|');
    const place = interaction.values[0];

    // GAS へ送信
    await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, date, time, place })
    });

    await interaction.update({
      content: `✅ 予定を追加しました: ${title} ${date} ${time} @${place}`,
      components: []
    });
  }

  // ---------- /list コマンド ----------
  if (interaction.isChatInputCommand() && interaction.commandName === 'list') {
    const res = await fetch(GAS_URL);
    const data = await res.json();
    if (!data || data.length === 0) return interaction.reply({ content: '予定はまだありません！', ephemeral: true });

    const text = data.map(r => `📌 ${r[1]} - ${r[2]} ${r[3]} - ${r[4]}`).join('\n\n');
    await interaction.reply({ content: text, ephemeral: true });
  }

});

client.login(TOKEN);
