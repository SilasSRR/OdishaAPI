const express = require("express");
const PushToken = require("../models/PushToken");
const { requireAuth } = require("../middleware/auth");
const { sendPushToEnabledUsers } = require("../services/pushNotifications");
const router = express.Router();

router.post("/register-token", requireAuth, async (req, res) => {
    try {
        const { expoPushToken, platform } = req.body;

        if (!expoPushToken) {
            return res.status(400).json({
                message: "Push token required",
            });
        }

        await PushToken.findOneAndUpdate(
            { expoPushToken },
            {
                userId: req.userId,
                expoPushToken,
                platform: platform || "",
                enabled: true,
            },
            {
                upsert: true,
                new: true,
            }
        );

        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({
            message: "Server error",
        });
    }
});

router.post("/test", requireAuth, async (req, res) => {
    try {
        await sendPushToEnabledUsers({
            title: "Odisha Test",
            body: "Push notifications are working!",
            data: { type: "test" },
        });

        res.json({ ok: true });
    } catch (e) {
        console.error("Test push error:", e);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;