// bot/src/lib/modmail/modmail.ts
import crypto from 'crypto';
import { EmbedBuilder, User, Guild, TextChannel, Message } from 'discord.js';

/**
 * Generate a unique modmail ticket ID
 * Format: MM-XXXXXX (6 alphanumeric characters)
 */
export function generateModmailTicketId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const length = 6;
    let result = 'MM-';
    
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    
    return result;
}

/**
 * Create an embed for displaying modmail message content
 */
export function createModmailMessageEmbed(
    user: User,
    content: string,
    attachments: string[],
    ticketId: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${user.tag} (${user.id})`,
            iconURL: user.displayAvatarURL(),
        })
        .setDescription(content || '*No message content*')
        .setColor(0x5865f2)
        .setFooter({ text: `Ticket ID: ${ticketId}` })
        .setTimestamp();

    if (attachments.length > 0) {
        // Add first image as embed image if available
        const imageAttachment = attachments.find(url => 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
        );
        if (imageAttachment) {
            embed.setImage(imageAttachment);
        }

        // List all attachments in a field
        embed.addFields({
            name: '📎 Attachments',
            value: attachments.map((url, i) => `[Attachment ${i + 1}](${url})`).join('\n'),
        });
    }

    return embed;
}

/**
 * Create an embed for displaying modmail ticket in the channel
 */
export function createModmailTicketEmbed(
    user: User,
    guild: Guild,
    content: string,
    attachments: string[],
    ticketId: string
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('📬 New Modmail Ticket')
        .setAuthor({
            name: `${user.tag} (${user.id})`,
            iconURL: user.displayAvatarURL(),
        })
        .setDescription(content || '*No message content*')
        .setColor(0x5865f2)
        .addFields(
            { name: 'Server', value: guild.name, inline: true },
            { name: 'Ticket ID', value: ticketId, inline: true }
        )
        .setTimestamp();

    if (attachments.length > 0) {
        // Add first image as embed image if available
        const imageAttachment = attachments.find(url => 
            /\.(jpg|jpeg|png|gif|webp)$/i.test(url)
        );
        if (imageAttachment) {
            embed.setImage(imageAttachment);
        }

        // List all attachments in a field
        embed.addFields({
            name: '📎 Attachments',
            value: attachments.map((url, i) => `[Attachment ${i + 1}](${url})`).join('\n'),
        });
    }

    return embed;
}

/**
 * Create an embed for staff reply
 */
export function createStaffReplyEmbed(
    staffUser: User,
    content: string,
    ticketId: string
): EmbedBuilder {
    return new EmbedBuilder()
        .setAuthor({
            name: `${staffUser.tag} (Staff)`,
            iconURL: staffUser.displayAvatarURL(),
        })
        .setDescription(content)
        .setColor(0x57f287)
        .setFooter({ text: `Ticket ID: ${ticketId}` })
        .setTimestamp();
}

/**
 * Create an embed for closed ticket notification
 */
export function createClosedTicketEmbed(
    ticketId: string,
    closedBy?: User
): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setTitle('🔒 Modmail Ticket Closed')
        .setDescription(
            'Your modmail ticket has been closed by the server staff.\n\n' +
            'If you need further assistance, you can submit a new modmail ticket.'
        )
        .setColor(0xed4245)
        .setFooter({ text: `Ticket ID: ${ticketId}` })
        .setTimestamp();

    if (closedBy) {
        embed.addFields({ name: 'Closed by', value: closedBy.tag });
    }

    return embed;
}

/**
 * Extract attachments from a Discord message
 */
export function extractAttachments(message: Message): string[] {
    return Array.from(message.attachments.values()).map(a => a.url);
}

/**
 * Validate message content for modmail
 */
export function validateModmailContent(content: string, attachments: string[]): string | null {
    if (!content?.trim() && attachments.length === 0) {
        return 'You must include either a message or an attachment.';
    }

    if (content && content.length > 2000) {
        return 'Message content must be 2000 characters or less.';
    }

    return null;
}
