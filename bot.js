const { 
  Client, 
  GatewayIntentBits, 
  Partials, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  EmbedBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  PermissionsBitField 
} = require('discord.js');
const Database = require('better-sqlite3');

// --- DATABASE SETUP ---
const db = new Database('applications.db');

db.prepare(`
  CREATE TABLE IF NOT EXISTS applications (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    display_name TEXT,
    full_name TEXT,
    age TEXT,
    country TEXT,
    reason TEXT,
    forex_knowledge TEXT,
    activity TEXT,
    respect TEXT,
    suggestion TEXT,
    previous_group TEXT,
    application_id TEXT,
    has_applied INTEGER DEFAULT 0,
    application_status TEXT DEFAULT 'PENDING',
    assigned_group TEXT,
    current_roles TEXT,
    discord_created_at TEXT,
    server_joined_at TEXT,
    submitted_at TEXT,
    reviewed_at TEXT,
    reviewed_by TEXT,
    approval_reason TEXT,
    denial_reason TEXT,
    blacklisted INTEGER DEFAULT 0,
    blacklist_reason TEXT,
    blacklisted_at TEXT,
    blacklisted_by TEXT,
    ticket_id TEXT,
    ticket_status TEXT,
    ticket_created_at TEXT,
    ticket_closed_at TEXT,
    ticket_closed_by TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS counters (
    key TEXT PRIMARY KEY,
    value INTEGER
  )
`).run();

const getNextAppId = () => {
  let row = db.prepare('SELECT value FROM counters WHERE key = ?').get('app_id');
  if (!row) {
    db.prepare('INSERT INTO counters (key, value) VALUES (?, ?)').run('app_id', 1);
    row = { value: 1 };
  }
  const nextVal = row.value;
  db.prepare('UPDATE counters SET value = ? WHERE key = ?').run(nextVal + 1, 'app_id');
  return `APP-${String(nextVal).padStart(4, '0')}`;
};

// --- BOT SETUP ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember]
});

const CONFIG = {
  PANEL_CHANNEL: "1507637723828195348",
  REVIEW_CHANNEL: "1533385697610829924",
  DENIED_CHANNEL: "1533385599778558043",
  APPROVED_CHANNEL: "1533385650630299710",
  GROUP_RULES_CHANNEL: "1510492937631305788",
  GROUPS: {
    A: "1455596540428292248",
    B: "1455596589942046893",
    C: "1455596654437601565",
    D: "1530867036849438832",
    E: "1455596755126194372",
    F: "1478846160167895273"
  }
};

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  await registerCommands();
});

async function registerCommands() {
  const commands = [
    {
      name: 'reset-application',
      description: 'Reset a user application status (Admin Only)',
      options: [
        {
          name: 'user',
          type: 6,
          description: 'The user to reset',
          required: true
        }
      ]
    },
    {
      name: 'setup-panel',
      description: 'Send the Application Panel (Admin Only)'
    }
  ];

  await client.application.commands.set(commands);
}

function checkAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || 
         member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

async function updateStatisticsPanel(channel) {
  try {
    const total = db.prepare('SELECT COUNT(*) as c FROM applications').get().c;
    const groupA = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'A'").get().c;
    const groupB = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'B'").get().c;
    const groupC = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'C'").get().c;
    const groupD = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'D'").get().c;
    const groupE = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'E'").get().c;
    const groupF = db.prepare("SELECT COUNT(*) as c FROM applications WHERE assigned_group = 'F'").get().c;
    const pending = db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status = 'PENDING'").get().c;
    const denied = db.prepare("SELECT COUNT(*) as c FROM applications WHERE application_status = 'DENIED'").get().c;
    const blacklisted = db.prepare("SELECT COUNT(*) as c FROM applications WHERE blacklisted = 1").get().c;
    const openTickets = db.prepare("SELECT COUNT(*) as c FROM applications WHERE ticket_status = 'OPEN'").get().c;
    const closedTickets = db.prepare("SELECT COUNT(*) as c FROM applications WHERE ticket_status = 'CLOSED'").get().c;

    const embed = new EmbedBuilder()
      .setTitle("🎯 GROUP APPLICATION CENTER")
      .setDescription(`«👋 Ku soo dhawoow Group Application-ka\n\nHaddii aad rabto inaad ku biirto mid ka mid ah Groups-keena, fadlan halkaan ka buuxi Application-kaaga.\n\n📋 Codsigaaga waxaa si taxadar leh u eegi doona maamulka.\n\n⏱️ Jawaabta waxaad heli doontaa sida ugu dhakhsaha badan, waxaana isku dayaynaa inaan kaga jawaabno 30 daqiyood gudahood.\n\n⚠️ Fadlan hal mar oo keliya codso.\n\nHaddii aad horey Application u soo dirtay, mar labaad ma codsan kartid.»\n\n` +
        `📊 APPLICATION STATISTICS\n\n` +
        `👥 Total Applications: "${total}"\n` +
        `🔵 Group A: "${groupA}"\n` +
        `🟢 Group B: "${groupB}"\n` +
        `🟡 Group C: "${groupC}"\n` +
        `🟠 Group D: "${groupD}"\n` +
        `🟣 Group E: "${groupE}"\n` +
        `🔴 Group F: "${groupF}"\n` +
        `⏳ Pending: "${pending}"\n` +
        `❌ Denied: "${denied}"\n` +
        `⚫ Blacklisted: "${blacklisted}"\n` +
        `🎫 Open Tickets: "${openTickets}"\n` +
        `🔒 Closed Tickets: "${closedTickets}"`)
      .setColor(0x00AE86);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('open_apply_modal')
        .setLabel('📝 Codso Group')
        .setStyle(ButtonStyle.Primary)
    );

    const messages = await channel.messages.fetch({ limit: 10 });
    const existing = messages.find(m => m.author.id === client.user.id);
    if (existing) {
      await existing.edit({ embeds: [embed], components: [row] });
    } else {
      await channel.send({ embeds: [embed], components: [row] });
    }
  } catch (err) {
    console.error("Error updating stats panel:", err);
  }
}

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'setup-panel') {
        if (!checkAdmin(interaction.member)) {
          return interaction.reply({ content: '❌ Ogolaansho Ma Haysatid\n\nMa lihid permission-ka aad action-kan ku sameyn lahayd.', ephemeral: true });
        }
        const channel = await client.channels.fetch(CONFIG.PANEL_CHANNEL);
        await updateStatisticsPanel(channel);
        return interaction.reply({ content: 'Panel-ka waa la diray/cusbooneysiiyay!', ephemeral: true });
      }

      if (interaction.commandName === 'reset-application') {
        if (!checkAdmin(interaction.member)) {
          return interaction.reply({ content: '❌ Ogolaansho Ma Haysatid\n\nMa lihid permission-ka aad action-kan ku sameyn lahayd.', ephemeral: true });
        }
        const targetUser = interaction.options.getUser('user');
        db.prepare('UPDATE applications SET has_applied = 0 WHERE user_id = ?').run(targetUser.id);
        return interaction.reply({ content: `Application-ka user-ka ${targetUser.tag} waa la reset-gareeyay.`, ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      const { customId, user, member } = interaction;

      if (customId === 'open_apply_modal') {
        const record = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(user.id);
        if (record && record.blacklisted === 1) {
          return interaction.reply({
            content: `«⚫ Application Lama Oggola\n\nWaxaad kujirtaa Blacklist.\n\n🚫 Group kuma biiri kartid, Application cusubna ma soo diri kartid.\n\n📌 Sababta: ${record.blacklist_reason || 'Horey ayaa Group looga saaray inactivity ama jebinta xeerarka Group-ka.'}»`,
            ephemeral: true
          });
        }

        if (record && record.has_applied === 1) {
          return interaction.reply({
            content: `«⚠️ Application Hore Ayaa Loo Soo Diray\n\nWaxaad horey u soo dirtay Application.\n\n🚫 Mar labaad Application ma soo diri kartid.\n\nHaddii aad arrin ku saabsan Application-kaaga kala hadli rabto maamulka, fadlan isticmaal Ticket-kaaga.»`,
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('application_modal')
          .setTitle('Group Application Form');

        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('Magacaaga buuxa waa maxay?').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('Meeqo sano jirtaa?').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('Wadankee ku nooshahay?').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('Maxaad uga mid noqonaysaa Group-kan?').setStyle(TextInputStyle.Paragraph).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('Aqoontaada Forex halkee maraysaa?').setStyle(TextInputStyle.Short).setRequired(true))
        );

        return interaction.showModal(modal);
      }

      const adminButtons = ['approve', 'approve_reason', 'deny', 'deny_reason', 'blacklist', 'ticket', 'group_a', 'group_b', 'group_c', 'group_d', 'group_e', 'group_f', 'close_ticket'];
      
      if (adminButtons.some(b => customId.startsWith(b))) {
        if (!checkAdmin(member)) {
          return interaction.reply({ content: '❌ Ogolaansho Ma Haysatid\n\nMa lihid permission-ka aad action-kan ku sameyn lahayd.', ephemeral: true });
        }

        const embed = interaction.message.embeds[0];
        if (!embed) return interaction.reply({ content: 'Application embed not found.', ephemeral: true });
        
        const userIdField = embed.fields.find(f => f.name === 'User ID');
        if (!userIdField) return interaction.reply({ content: 'User ID not found in embed.', ephemeral: true });
        const applicantId = userIdField.value;

        const applicantMember = await interaction.guild.members.fetch(applicantId).catch(() => null);

        if (customId === 'approve') {
          db.prepare("UPDATE applications SET application_status = 'APPROVED', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?")
            .run(new Date().toISOString(), user.id, applicantId);

          if (applicantMember) {
            await applicantMember.send(`«🎉 Hambalyo!\n\nApplication-kaaga waa la aqbalay.\n\n👥 Waxaa lagugu daray Group.\n\n❤️ Soo dhawoow Group-ka!\n\n📖 Fadlan akhri oo raac xeerarka Group-ka:\n\n<#${CONFIG.GROUP_RULES_CHANNEL}>\n\n👮 Waxaa ku aqbalay: <@${user.id}>»`).catch(() => {});
          }

          return interaction.reply({ content: `Application approved for <@${applicantId}>`, ephemeral: true });
        }

        if (customId === 'blacklist') {
          db.prepare("UPDATE applications SET blacklisted = 1, application_status = 'BLACKLISTED', blacklisted_at = ?, blacklisted_by = ? WHERE user_id = ?")
            .run(new Date().toISOString(), user.id, applicantId);

          if (applicantMember) {
            for (const rId of Object.values(CONFIG.GROUPS)) {
              if (applicantMember.roles.cache.has(rId)) {
                await applicantMember.roles.remove(rId).catch(() => {});
              }
            }
            await applicantMember.send(`«⚫ BLACKLIST NOTICE\n\nWaxaa lagugu daray Blacklist.\n\n🚫 Group kuma biiri kartid sababtoo ah horey ayaa Group looga saaray.\n\n📌 Sababta:\nInactivity ama jebinta xeerarka Group-ka.\n\nSidaas darteed hadda uma qalantid inaad ku biirto Groups-keena.\n\n❌ Application cusub ma soo diri kartid.\n\n👮 Blacklist waxaa ku daray: <@${user.id}>\n\n🕐 Taariikh: "${new Date().toISOString()}"»`).catch(() => {});
          }

          return interaction.reply({ content: `User <@${applicantId}> has been blacklisted.`, ephemeral: true });
        }
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'application_modal') {
        const { user } = interaction;
        const q1 = interaction.fields.getTextInputValue('q1');
        const q2 = interaction.fields.getTextInputValue('q2');
        const q3 = interaction.fields.getTextInputValue('q3');
        const q4 = interaction.fields.getTextInputValue('q4');
        const q5 = interaction.fields.getTextInputValue('q5');

        const appId = getNextAppId();
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const rolesList = member ? member.roles.cache.map(r => r.name).join(', ') : 'None';

        db.prepare(`
          INSERT OR REPLACE INTO applications (
            user_id, username, display_name, full_name, age, country, reason, 
            forex_knowledge, application_id, has_applied, application_status, 
            current_roles, discord_created_at, server_joined_at, submitted_at, ticket_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?, ?, ?, 'CLOSED')
        `).run(
          user.id, user.tag, user.displayName, q1, q2, q3, q4, q5, appId,
          rolesList, user.createdAt.toISOString(), member?.joinedAt?.toISOString() || 'N/A',
          new Date().toISOString()
        );

        const reviewChannel = await client.channels.fetch(CONFIG.REVIEW_CHANNEL);
        const embed = new EmbedBuilder()
          .setTitle(`New Application: ${appId}`)
          .setColor(0xFFAA00)
          .addFields(
            { name: 'Applicant', value: `${user.tag}`, inline: true },
            { name: 'User ID', value: `${user.id}`, inline: true },
            { name: 'Full Name', value: q1 },
            { name: 'Age', value: q2, inline: true },
            { name: 'Country', value: q3, inline: true },
            { name: 'Reason', value: q4 },
            { name: 'Forex Knowledge', value: q5 },
            { name: 'Current Roles', value: rolesList },
            { name: 'Application ID', value: appId, inline: true },
            { name: 'Submission Time', value: new Date().toISOString(), inline: true },
            { name: 'Application Status', value: 'PENDING', inline: true }
          );

        const row1 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('approve').setLabel('🟢 Approve').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('approve_reason').setLabel('🟢 Approve with a Reason').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('deny').setLabel('🔴 Deny').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('deny_reason').setLabel('🔴 Deny with a Reason').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('blacklist').setLabel('⚫ Blacklist').setStyle(ButtonStyle.Secondary)
        );

        const row2 = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('ticket').setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId('group_a').setLabel('🔵 Group A').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('group_b').setLabel('🟢 Group B').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('group_c').setLabel('🟡 Group C').setStyle(ButtonStyle.Secondary)
        );

        await reviewChannel.send({ embeds: [embed], components: [row1, row2] });

        const panelChannel = await client.channels.fetch(CONFIG.PANEL_CHANNEL);
        await updateStatisticsPanel(panelChannel);

        return interaction.reply({
          content: '✅ Codsigaag waa la diray! Waan ka soo jawaabi doonaa dhawaan.',
          ephemeral: true
        });
      }
    }
  } catch (err) {
    console.error("Interaction error:", err);
    if (interaction.isRepliable()) {
      await interaction.reply({ content: 'Wax khalad ah ayaa dhacay. Fadlan dib u day.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login('YOUR_BOT_TOKEN_HERE');
