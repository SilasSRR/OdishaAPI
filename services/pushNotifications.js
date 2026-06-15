const { Expo } = require("expo-server-sdk");
const PushToken = require("../models/PushToken");

const expo = new Expo();

async function sendPushToEnabledUsers({ title, body, data = {} }) {
  const tokens = await PushToken.find({ enabled: true }).lean();

  const messages = [];

  for (const item of tokens) {
    if (!Expo.isExpoPushToken(item.expoPushToken)) continue;

    messages.push({
      to: item.expoPushToken,
      sound: "default",
      title,
      body,
      data,
    });
  }

  if (messages.length === 0) {
    console.log("[PUSH] No enabled push tokens.");
    return;
  }

  const chunks = expo.chunkPushNotifications(messages);

  for (const chunk of chunks) {
    try {
      const tickets = await expo.sendPushNotificationsAsync(chunk);
      console.log("[PUSH] Tickets:", tickets);
    } catch (e) {
      console.error("[PUSH] Send error:", e);
    }
  }
}

async function sendDailyQtNotification(video) {
  if (!video) return;

  await sendPushToEnabledUsers({
    title: "New Daily QT Available",
    body: video.title || "Today's Daily QT is ready.",
    data: {
      type: "daily_qt",
      videoId: String(video._id),
      category: "QT",
    },
  });
}

module.exports = {
  sendPushToEnabledUsers,
  sendDailyQtNotification,
};