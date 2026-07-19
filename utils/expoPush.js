import { Expo } from 'expo-server-sdk';

const expo = new Expo({
  accessToken: process.env.EXPO_ACCESS_TOKEN,
});

export const sendNotification = async ({
  recipients = [],
  title,
  body,
  data = {},
  type = 'general',
  category = 'General',
  url = '/notifications',
  sound = 'default',
  priority = 'high',
  ttlSeconds = 300,
  badge = 0,
}) => {
  const validTokens = recipients
    .filter(Boolean)
    .filter((token) => typeof token === 'string' && Expo.isExpoPushToken(token));

  if (validTokens.length === 0) {
    return {
      success: true,
      sent: 0,
      recipients: 0,
      skipped: recipients.length,
    };
  }

  const chunks = [];
  for (let index = 0; index < validTokens.length; index += 100) {
    chunks.push(validTokens.slice(index, index + 100));
  }

  const tickets = [];

  for (const chunk of chunks) {
    const messages = chunk.map((token) => ({
      to: token,
      sound,
      title,
      body,
      data: {
        ...data,
        type,
        category,
        url,
        title,
        body,
        message: body,
      },
      priority,
      ttl: ttlSeconds,
      badge,
    }));

    const chunkTickets = await expo.sendPushNotificationsAsync(messages);
    tickets.push(...chunkTickets);
  }

  return {
    success: true,
    sent: tickets.length,
    recipients: validTokens.length,
    tickets,
  };
};
