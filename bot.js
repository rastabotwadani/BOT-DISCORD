const { 
  Client, 
  GatewayIntentBits, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  EmbedBuilder, 
  PermissionFlagsBits, 
  ChannelType 
} = require('discord.js');
const Database = require('better-sqlite3');

// ==========================================
// CONFIGURATION & CONSTANTS
// ==========================================
const CHANNELS = {
  PANEL: '1507637723828195348',
  REVIEW: '1533385697610829924',
  DENIED: '1533385599778558043',
  APPROVED: '1533385650630299710',
  RULES: '1510492937631305788',
  STATISTICS: '1535993987700232303'
};

const ROLES = {
  GROUP_A: '1455596540428292248',
  GROUP_B: '1455596589942046893',
  GROUP_C: '1455596654437601565',
  GROUP_D: '1530867036849438832',
  GROUP_E: '1455596755126194372',
  GROUP_F: '1478846160167895273'
};

const GROUP_ROLE_MAP = {
  'GROUP_A': ROLES.GROUP_A,
  'GROUP_B': ROLES.GROUP_B,
  'GROUP_C': ROLES.GROUP_C,
  'GROUP_D': ROLES.GROUP_D,
  'GROUP_E': ROLES.GROUP_E,
  'GROUP_F': ROLES.GROUP_F
};

// ==========================================
// DATABASE SETUP (SQLite)
// ==========================================
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
    ticket_channel_id TEXT,
    ticket_status TEXT,
    ticket_created_at TEXT,
    ticket_created_by TEXT,
    ticket_closed_at TEXT,
    ticket_closed_by TEXT
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS app_counter (
    id INTEGER PRIMARY KEY,
    seq INTEGER
  )
`).run();

const counter = db.prepare('SELECT seq FROM app_counter WHERE id = 1').get();
if (!counter) {
  db.prepare('INSERT INTO app_counter (id, seq) VALUES (1, 0)').run();
}

function getNextAppId() {
  const info = db.prepare('SELECT seq FROM app_counter WHERE id = 1').get();
  const nextSeq = info.seq + 1;
  db.prepare('UPDATE app_counter SET seq = ? WHERE id = 1').run(nextSeq);
  return `APP-${String(nextSeq).padStart(4, '0')}`;
}

// ==========================================
// CLIENT INITIALIZATION
// ==========================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ==========================================
// STATISTICS MANAGEMENT
// ==========================================
async function updateStatistics(guild) {
  try {
    const statsChannel = await guild.channels.fetch(CHANNELS.STATISTICS).catch(() => null);
    if (!statsChannel) return;

    const totalApps = db.prepare('SELECT COUNT(*) as count FROM applications').get().count;
    const pendingApps = db.prepare("SELECT COUNT(*) as count FROM applications WHERE application_status = 'PENDING'").get().count;
    const approvedApps = db.prepare("SELECT COUNT(*) as count FROM applications WHERE application_status = 'APPROVED'").get().count;
    const deniedApps = db.prepare("SELECT COUNT(*) as count FROM applications WHERE application_status = 'DENIED'").get().count;
    const blacklistedUsers = db.prepare('SELECT COUNT(*) as count FROM applications WHERE blacklisted = 1').get().count;

    const openTickets = db.prepare("SELECT COUNT(*) as count FROM applications WHERE ticket_status = 'OPEN'").get().count;
    const closedTickets = db.prepare("SELECT COUNT(*) as count FROM applications WHERE ticket_status = 'CLOSED'").get().count;

    const countMembers = async (roleId) => {
      try {
        await guild.members.fetch();
        const role = guild.roles.cache.get(roleId);
        return role ? role.members.size : 0;
      } catch {
        return 0;
      }
    };

    const groupACount = await countMembers(ROLES.GROUP_A);
    const groupBCount = await countMembers(ROLES.GROUP_B);
    const groupCCount = await countMembers(ROLES.GROUP_C);
    const groupDCount = await countMembers(ROLES.GROUP_D);
    const groupECount = await countMembers(ROLES.GROUP_E);
    const groupFCount = await countMembers(ROLES.GROUP_F);

    const statsEmbed = new EmbedBuilder()
      .setTitle('📊 GROUP APPLICATION STATISTICS')
      .setColor(0x2b2d31)
      .setDescription(
        `👥 Total Applications: **${totalApps}**\n` +
        `⏳ Pending Applications: **${pendingApps}**\n` +
        `🟢 Approved Applications: **${approvedApps}**\n` +
        `❌ Denied Applications: **${deniedApps}**\n` +
        `⚫ Blacklisted Users: **${blacklistedUsers}**\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `👥 GROUP MEMBERS\n\n` +
        `🔵 Group A: **${groupACount}**\n` +
        `🟢 Group B: **${groupBCount}**\n` +
        `🟡 Group C: **${groupCCount}**\n` +
        `🟠 Group D: **${groupDCount}**\n` +
        `🟣 Group E: **${groupECount}**\n` +
        `🔴 Group F: **${groupFCount}**\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `🎫 Open Tickets: **${openTickets}**\n` +
        `🔒 Closed Tickets: **${closedTickets}**`
      )
      .setTimestamp();

    const messages = await statsChannel.messages.fetch({ limit: 10 }).catch(() => null);
    const botMsg = messages ? messages.find(m => m.author.id === client.user.id) : null;

    if (botMsg) {
      await botMsg.edit({ embeds: [statsEmbed] });
    } else {
      await statsChannel.send({ embeds: [statsEmbed] });
    }
  } catch (err) {
    console.error('Error updating statistics:', err);
  }
}

// ==========================================
// BOT READY EVENT & PANEL SENDER
// ==========================================
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  for (const guild of client.guilds.cache.values()) {
    try {
      const panelChannel = await guild.channels.fetch(CHANNELS.PANEL).catch(() => null);
      if (panelChannel) {
        const messages = await panelChannel.messages.fetch({ limit: 10 }).catch(() => null);
        const existingPanel = messages ? messages.find(m => m.author.id === client.user.id && m.components.length > 0) : null;

        if (!existingPanel) {
          const panelEmbed = new EmbedBuilder()
            .setTitle('🎯 GROUP APPLICATION CENTER')
            .setColor(0x5865F2)
            .setDescription(
              '👋 Ku soo dhawoow Group Application-ka.\n\n' +
              'Haddii aad rabto inaad ku biirto mid ka mid ah Groups-keena, fadlan halkaan ka buuxi Application-kaaga.\n\n' +
              '📋 Codsigaaga waxaa si taxadar leh u eegi doona maamulka.\n\n' +
              '⏱️ Jawaabta waxaad heli doontaa sida ugu dhakhsaha badan, waxaana isku dayaynaa inaan kaga jawaabno 30 daqiiqo gudahood.\n\n' +
              '⚠️ Fadlan hal mar oo keliya codso.\n\n' +
              'Haddii aad horey Application u soo dirtay, mar labaad ma codsan kartid.'
            );

          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('apply_modal')
              .setLabel('📝 Codso Group')
              .setStyle(ButtonStyle.Primary)
          );

          await panelChannel.send({ embeds: [panelEmbed], components: [row] });
        }
      }

      await updateStatistics(guild);
    } catch (err) {
      console.error(`Error setting up panel/stats for guild ${guild.id}:`, err);
    }
  }
});

// ==========================================
// INTERACTION CREATE (BUTTONS, MODALS, COMMANDS)
// ==========================================
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  // 1. APPLICATION FORM TRIGGER
  if (interaction.isButton() && interaction.customId === 'apply_modal') {
    const userId = interaction.user.id;
    const record = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(userId);

    if (record && record.blacklisted === 1) {
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setTitle('⚫ Application Lama Oggola')
            .setColor(0xED4245)
            .setDescription(
              'Waxaad kujirtaa Blacklist.\n\n' +
              '🚫 Group kuma biiri kartid, Application cusubna ma soo diri kartid.\n\n' +
              '📌 Sababta:\nHorey ayaa Group looga saaray inactivity ama jebinta xeerarka Group-ka.'
            )
        ]
      });
    }

    if (record && record.has_applied === 1) {
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ Application Hore Ayaa Loo Soo Diray')
            .setColor(0xFEE75C)
            .setDescription(
              'Waxaad horey u soo dirtay Application.\n\n' +
              '🚫 Mar labaad Application ma soo diri kartid.\n\n' +
              'Haddii aad arrin ku saabsan Application-kaaga kala hadli rabto maamulka, fadlan isticmaal Ticket-kaaga.'
            )
        ]
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('application_form_modal')
      .setTitle('Codshiga Ku Biirista Group');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q1').setLabel('Magacaaga buuxa waa maxay?').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q2').setLabel('Meeqo sano jirtaa?').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q3').setLabel('Wadankee ku nooshahay?').setStyle(TextInputStyle.Short).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q4').setLabel('Maxaad uga mid noqonaysaa Group-kan?').setStyle(TextInputStyle.Paragraph).setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q5').setLabel('Aqoontaada Forex halkee maraysaa?').setStyle(TextInputStyle.Paragraph).setRequired(true)
      )
    );

    return await interaction.showModal(modal);
  }

  // 2. MODAL SUBMISSION HANDLING
  if (interaction.isModalSubmit() && interaction.customId === 'application_form_modal') {
    const userId = interaction.user.id;
    const check = db.prepare('SELECT has_applied, blacklisted FROM applications WHERE user_id = ?').get(userId);
    if ((check && check.has_applied === 1) || (check && check.blacklisted === 1)) {
      return interaction.reply({ content: 'Waxa uu nidaamku diiday inaad mar labaad soo dirto.', ephemeral: true });
    }

    const q1 = interaction.fields.getTextInputValue('q1');
    const q2 = interaction.fields.getTextInputValue('q2');
    const q3 = interaction.fields.getTextInputValue('q3');
    const q4 = interaction.fields.getTextInputValue('q4');
    const q5 = interaction.fields.getTextInputValue('q5');

    // Second part modal or standard fields collection logic. Since Discord allows max 5 inputs per modal, we collect 5 here and map standard fields.
    // For completeness within architectural bounds, we store these and open review.
    const appId = getNextAppId();
    const member = interaction.member;
    const rolesList = member.roles.cache.map(r => r.name).filter(r => r !== '@everyone').join(', ') || 'None';
    const createdAt = interaction.user.createdAt.toISOString();
    const joinedAt = member.joinedAt ? member.joinedAt.toISOString() : 'Unknown';
    const submittedAt = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO applications (
        user_id, username, display_name, full_name, age, country, reason, forex_knowledge,
        activity, respect, suggestion, previous_group, application_id, has_applied,
        application_status, current_roles, discord_created_at, server_joined_at, submitted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING', ?, ?, ?, ?)
    `).run(
      userId, interaction.user.tag, interaction.user.displayName, q1, q2, q3, q4, q5,
      'Active (Default)', 'Respectful (Default)', 'None', 'None', appId,
      rolesList, createdAt, joinedAt, submittedAt
    );

    await interaction.reply({
      content: '✅ Application-kaaga waa la guuleystay in la diiwaangeliyo! Maamulka ayaa eegaya.',
      ephemeral: true
    });

    const reviewChannel = await interaction.guild.channels.fetch(CHANNELS.REVIEW).catch(() => null);
    if (reviewChannel) {
      const reviewEmbed = new EmbedBuilder()
        .setTitle(`New Application: ${appId}`)
        .setColor(0x5865F2)
        .addFields(
          { name: 'Applicant', value: `<@${userId}>`, inline: true },
          { name: 'User ID', value: userId, inline: true },
          { name: 'Username', value: interaction.user.tag, inline: true },
          { name: 'Display Name', value: interaction.user.displayName, inline: true },
          { name: 'Full Name', value: q1, inline: false },
          { name: 'Age', value: q2, inline: true },
          { name: 'Country', value: q3, inline: true },
          { name: 'Reason for joining', value: q4, inline: false },
          { name: 'Forex knowledge', value: q5, inline: false },
          { name: 'Current Discord Roles', value: rolesList, inline: false },
          { name: 'Application ID', value: appId, inline: true },
          { name: 'Submission Time', value: new Date().toLocaleString(), inline: true },
          { name: 'Application Status', value: 'PENDING', inline: true }
        );

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_approve_${userId}`).setLabel('🟢 Approve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_approve_reason_${userId}`).setLabel('🟢 Approve with a Reason').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`app_deny_${userId}`).setLabel('🔴 Deny').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`app_deny_reason_${userId}`).setLabel('🔴 Deny with a Reason').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`app_blacklist_${userId}`).setLabel('⚫ Blacklist').setStyle(ButtonStyle.Secondary)
      );

      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`app_ticket_${userId}`).setLabel('🎫 Ticket').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`group_select_A_${userId}`).setLabel('🔵 Group A').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`group_select_B_${userId}`).setLabel('🟢 Group B').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`group_select_C_${userId}`).setLabel('🟡 Group C').setStyle(ButtonStyle.Secondary)
      );

      const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`group_select_D_${userId}`).setLabel('🟠 Group D').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`group_select_E_${userId}`).setLabel('🟣 Group E').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`group_select_F_${userId}`).setLabel('🔴 Group F').setStyle(ButtonStyle.Secondary)
      );

      await reviewChannel.send({ embeds: [reviewEmbed], components: [row1, row2, row3] });
    }

    await updateStatistics(interaction.guild);
    return;
  }

  // 3. ADMIN BUTTON CONTROLS
  if (interaction.isButton()) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const actionType = parts[1];
    const targetUserId = parts[parts.length - 1];

    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageRoles);
    if (!isStaff) {
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Ogolaansho Ma Haysatid')
            .setColor(0xED4245)
            .setDescription('Ma lihid permission-ka aad action-kan ku sameyn lahayd.')
        ]
      });
    }

    // Group Assignment pre-selection tracker storage or assignment
    if (customId.startsWith('group_select_')) {
      const groupKey = `GROUP_${parts[2]}`;
      db.prepare('UPDATE applications SET assigned_group = ? WHERE user_id = ?').run(groupKey, targetUserId);
      return interaction.reply({ content: `✅ Target assigned group updated to **Group ${parts[2]}**.`, ephemeral: true });
    }

    // APPROVE
    if (customId.startsWith('app_approve_') && !customId.includes('reason')) {
      const appRecord = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(targetUserId);
      if (!appRecord) return interaction.reply({ content: 'Record not found.', ephemeral: true });

      const groupKey = appRecord.assigned_group || 'GROUP_A';
      const roleId = GROUP_ROLE_MAP[groupKey];
      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);

      if (targetMember) {
        // Remove old group roles and assign new
        for (const rId of Object.values(ROLES)) {
          if (targetMember.roles.cache.has(rId)) {
            await targetMember.roles.remove(rId).catch(() => {});
          }
        }
        if (roleId) await targetMember.roles.add(roleId).catch(() => {});
      }

      db.prepare(`
        UPDATE applications SET application_status = 'APPROVED', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?
      `).run(new Date().toISOString(), interaction.user.id, targetUserId);

      // DM User
      if (targetMember) {
        await targetMember.send({
          content: `🎉 Hambalyo!\n\nApplication-kaaga waa la aqbalay.\n\n👥 Waxaa lagugu daray Group ${groupKey.replace('_', ' ')}.\n\n❤️ Soo dhawoow Group-ka!\n\n📖 Fadlan akhri oo raac xeerarka Group-ka:\n<#${CHANNELS.RULES}>\n\n👮 Waxaa ku aqbalay: <@${interaction.user.id}>`
        }).catch(() => {});
      }

      // Approved Log
      const approvedLogChannel = await interaction.guild.channels.fetch(CHANNELS.APPROVED).catch(() => null);
      if (approvedLogChannel) {
        await approvedLogChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Approved Application Log')
              .setColor(0x57F287)
              .addFields(
                { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                { name: 'User ID', value: targetUserId, inline: true },
                { name: 'Group', value: groupKey, inline: true },
                { name: 'Approved by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Application ID', value: appRecord.application_id, inline: true },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
              )
          ]
        });
      }

      await interaction.update({ content: `✅ Successfully approved by <@${interaction.user.id}>`, components: [] });
      await updateStatistics(interaction.guild);
      return;
    }

    // DENY
    if (customId.startsWith('app_deny_') && !customId.includes('reason')) {
      const appRecord = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(targetUserId);
      if (!appRecord) return interaction.reply({ content: 'Record not found.', ephemeral: true });

      db.prepare(`
        UPDATE applications SET application_status = 'DENIED', reviewed_at = ?, reviewed_by = ? WHERE user_id = ?
      `).run(new Date().toISOString(), interaction.user.id, targetUserId);

      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (targetMember) {
        await targetMember.send({
          content: `❌ Application-kaaga lama aqbalin.\n\nWaan ka xunnahay, Application-kaaga lama aqbalin waqtigan.\n\n👮 Waxaa diiday: <@${interaction.user.id}>\n\nMahadsanid waqtiga aad gelisay Application-ka.`
        }).catch(() => {});
      }

      const deniedLogChannel = await interaction.guild.channels.fetch(CHANNELS.DENIED).catch(() => null);
      if (deniedLogChannel) {
        await deniedLogChannel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Denied Application Log')
              .setColor(0xED4245)
              .addFields(
                { name: 'Applicant', value: `<@${targetUserId}>`, inline: true },
                { name: 'User ID', value: targetUserId, inline: true },
                { name: 'Denied by', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Application ID', value: appRecord.application_id, inline: true },
                { name: 'Timestamp', value: new Date().toLocaleString(), inline: true }
              )
          ]
        });
      }

      await interaction.update({ content: `❌ Denied by <@${interaction.user.id}>`, components: [] });
      await updateStatistics(interaction.guild);
      return;
    }

    // BLACKLIST
    if (customId.startsWith('app_blacklist_')) {
      const appRecord = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(targetUserId);
      if (!appRecord) return interaction.reply({ content: 'Record not found.', ephemeral: true });

      const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      if (targetMember) {
        for (const rId of Object.values(ROLES)) {
          if (targetMember.roles.cache.has(rId)) {
            await targetMember.roles.remove(rId).catch(() => {});
          }
        }
      }

      db.prepare(`
        UPDATE applications SET blacklisted = 1, blacklisted_at = ?, blacklisted_by = ? WHERE user_id = ?
      `).run(new Date().toISOString(), interaction.user.id, targetUserId);

      if (targetMember) {
        await targetMember.send({
          content: `⚫ **BLACKLIST NOTICE**\n\nWaxaad kujirtaa Blacklist.\n\n🚫 Group kuma biiri kartid sababtoo ah horey ayaa Group looga saaray.\n\n📌 Sababta:\nHorey ayaa Group looga saaray inactivity ama jebinta xeerarka Group-ka.\n\n❌ Application cusub ma soo diri kartid.\n❌ Group A, B, C, D, E ama F laguma dari karo.\n\n👮 Blacklist waxaa ku daray: <@${interaction.user.id}>\n🕐 Taariikh: ${new Date().toLocaleString()}`
        }).catch(() => {});
      }

      await interaction.update({ content: `⚫ Blacklisted by <@${interaction.user.id}>`, components: [] });
      await updateStatistics(interaction.guild);
      return;
    }

    // TICKET BUTTON MANUAL ACTION
    if (customId.startsWith('app_ticket_')) {
      const appRecord = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(targetUserId);
      if (!appRecord) return interaction.reply({ content: 'Record not found.', ephemeral: true });

      if (appRecord.ticket_status === 'OPEN' && appRecord.ticket_channel_id) {
        return interaction.reply({
          ephemeral: true,
          content: `⚠️ An active ticket already exists for this application: <#${appRecord.ticket_channel_id}>`
        });
      }

      const userObj = await client.users.fetch(targetUserId).catch(() => null);
      const channelName = `ticket-${userObj ? userObj.username : targetUserId}`.toLowerCase().replace(/[^a-z0-9]/g, '-');

      const ticketChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: targetUserId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannel]
          }
        ]
      }).catch(() => null);

      if (!ticketChannel) {
        return interaction.reply({ content: 'Failed to create ticket channel.', ephemeral: true });
      }

      db.prepare(`
        UPDATE applications SET ticket_id = ?, ticket_channel_id = ?, ticket_status = 'OPEN', ticket_created_at = ?, ticket_created_by = ? WHERE user_id = ?
      `).run(ticketChannel.id, ticketChannel.id, new Date().toISOString(), interaction.user.id, targetUserId);

      const ticketEmbed = new EmbedBuilder()
        .setTitle('🎫 APPLICATION TICKET')
        .setColor(0x5865F2)
        .setDescription(
          'Ku soo dhawoow Ticket-kaaga.\n\n' +
          'Halkan waxaad maamulka kala hadli kartaa wax kasta oo ku saabsan Application-kaaga.\n\n' +
          `📋 Application ID:\n${appRecord.application_id}\n\n` +
          `👤 User:\n<@${targetUserId}>\n\n` +
          `👮 Ticket-ka waxaa furay:\n<@${interaction.user.id}>\n\n` +
          '⏳ Fadlan sug jawaabta maamulka.'
        );

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`close_ticket_${targetUserId}`).setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ embeds: [ticketEmbed], components: [closeRow] });
      await interaction.reply({ ephemeral: true, content: `✅ Ticket created successfully: <#${ticketChannel.id}>` });
      await updateStatistics(interaction.guild);
      return;
    }

    // CLOSE TICKET
    if (customId.startsWith('close_ticket_')) {
      const appRecord = db.prepare('SELECT * FROM applications WHERE user_id = ?').get(targetUserId);
      if (!appRecord) return interaction.reply({ content: 'Record not found.', ephemeral: true });

      db.prepare(`
        UPDATE applications SET ticket_status = 'CLOSED', ticket_closed_at = ?, ticket_closed_by = ? WHERE user_id = ?
      `).run(new Date().toISOString(), interaction.user.id, targetUserId);

      await interaction.reply({
        content: `🔒 Ticket-ka waa la xiray.\n\nTicket-kan hadda waa la xiray.\n\n👮 Waxaa xiray: <@${interaction.user.id}>\n🕐 ${new Date().toLocaleString()}`
      });

      setTimeout(async () => {
        try {
          if (interaction.channel && interaction.channel.deletable) {
            await interaction.channel.delete();
          }
        } catch {}
      }, 5000);

      await updateStatistics(interaction.guild);
      return;
    }
  }
});

// ==========================================
// ADMIN COMMAND: /reset-application
// ==========================================
client.on('messageCreate', async message => {
  if (!message.guild || message.author.bot) return;

  if (message.content.startsWith('/reset-application')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: '❌ Ogolaansho Ma Haysatid. Ma lihid permission-ka aad action-kan ku sameyn lahayd.' });
    }

    const args = message.content.split(' ');
    const mentionedUser = message.mentions.users.first();

    if (!mentionedUser) {
      return message.reply({ content: 'Fadlan tixraac isticmaalaha: `/reset-application @user`' });
    }

    db.prepare('UPDATE applications SET has_applied = 0, application_status = \'PENDING\' WHERE user_id = ?').run(mentionedUser.id);
    await message.reply({ content: `✅ Successfully reset application state for <@${mentionedUser.id}>. has_applied = false.` });
    await updateStatistics(message.guild);
  }
});

// ==========================================
// LOGIN BOT
// ==========================================
client.login('YOUR_BOT_TOKEN');
