require("dotenv").config();
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const Video = require("../models/Video"); // or ../models/Video

const FILES = [
    // "qt-2020.seed.json",
    // "qt-2021.seed.json",
    // "qt-2022.seed.json",
    // "qt-2023.seed.json",
    // "qt-2024.seed.json",
    // "qt-2025.seed.json",
    "live.seed.json",
    // "other.seed.json",
];

function readJson(file) {
    const p = path.join(__dirname, "..", "seed", file);
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, "utf-8"));
}

async function main() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("MongoDB connected");

    // ✅ One-time cleanup during dev:
    // Deletes old mock stuff too.

    await Video.deleteMany({});

    // await Video.deleteMany({
    //     $or: [
    //         { category: "QT", qtDate: /^2025-/ },
    //         { category: "Live" },
    //         { category: "Other" },
    //     ],
    // });
    console.log("Deleted ALL existing videos");

    let total = 0;

    for (const f of FILES) {
        const items = readJson(f);
        if (!items.length) {
            console.log(`Skipping empty/missing: ${f}`);
            continue;
        }

        // const docs = items.map((v) => ({
        //     ...v,
        //     thumbnailUrl:
        //         v.thumbnailUrl && v.thumbnailUrl.trim()
        //             ? v.thumbnailUrl
        //             : `https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`,
        // }));

        const docs = items
            .filter(v => v.youtubeId && v.youtubeId !== "REPLACE_ME")
            .map(v => ({
                ...v,
                thumbnailUrl:
                    v.thumbnailUrl && v.thumbnailUrl.trim()
                        ? v.thumbnailUrl
                        : `https://img.youtube.com/vi/${v.youtubeId}/hqdefault.jpg`,
            }));


        const inserted = await Video.insertMany(docs);
        total += inserted.length;
        console.log(`Seeded ${inserted.length} from ${f}`);
    }

    console.log(`✅ Done. Total seeded: ${total}`);
    await mongoose.disconnect();
}

main().catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
});
