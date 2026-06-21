import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));

// Initialize Google GenAI on the backend
const geminiApiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Simulated Database (data_mock.json) to persist during live preview
// ---------------------------------------------------------------------------
const MOCK_DB_PATH = path.join(process.cwd(), "data_mock.json");

interface MockDb {
  users: Array<{ id: string; email: string }>;
  searches: Array<{
    id: string;
    user_id: string | null;
    input_text: string;
    dominant_emotion: string;
    emotion_vector: Record<string, number>;
    result_outfit_ids: string[];
    similarity_scores: number[];
    created_at: string;
  }>;
  wardrobe_items: Array<{
    id: string;
    user_id: string;
    item_image_url: string;
    category: string;
    style_tags: string[];
    created_at: string;
  }>;
  favorites: Array<{
    id: string;
    user_id: string;
    outfit_id: string;
    image_url: string;
    style_tags: string[];
    source: string;
    created_at: string;
  }>;
}

const defaultDb: MockDb = {
  users: [
    { id: "guest-user-session-id-123", email: "guest@moodfit.ai" }
  ],
  searches: [],
  wardrobe_items: [
    // Pre-populate some gorgeous personal items to make the library beautiful out of box
    {
      id: "pre-item-1",
      user_id: "guest-user-session-id-123",
      item_image_url: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=300",
      category: "top",
      style_tags: ["minimalist", "casual"],
      created_at: new Date().toISOString(),
    },
    {
      id: "pre-item-2",
      user_id: "guest-user-session-id-123",
      item_image_url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=300",
      category: "bottom",
      style_tags: ["vintage", "grunge"],
      created_at: new Date().toISOString(),
    },
    {
      id: "pre-item-3",
      user_id: "guest-user-session-id-123",
      item_image_url: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=300",
      category: "other",
      style_tags: ["dark academia", "elegant"],
      created_at: new Date().toISOString(),
    }
  ],
  favorites: [],
};

function readDb(): MockDb {
  try {
    if (fs.existsSync(MOCK_DB_PATH)) {
      const db = JSON.parse(fs.readFileSync(MOCK_DB_PATH, "utf-8"));
      if (!db.favorites) db.favorites = [];
      return db;
    }
  } catch {
    // suppress
  }
  return defaultDb;
}

function writeDb(db: MockDb) {
  try {
    fs.writeFileSync(MOCK_DB_PATH, JSON.stringify(db, null, 2), "utf-8");
  } catch {
    // suppress
  }
}

// Global curated outfit library representing our FAISS DeepFashion index
const GLOBAL_OUTFITS = [
  {
    outfit_id: "outfit-1",
    image_url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600",
    style_tags: ["minimalist", "beige coat"],
    dominant_color: "beige",
    emotions: ["calm", "nostalgic", "melancholic"],
  },
  {
    outfit_id: "outfit-2",
    image_url: "https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&q=80&w=600",
    style_tags: ["casual", "cozy knitwear"],
    dominant_color: "white",
    emotions: ["calm", "romantic"],
  },
  {
    outfit_id: "outfit-3",
    image_url: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=600",
    style_tags: ["dark academia", "wool overcoat"],
    dominant_color: "black",
    emotions: ["melancholic", "dark", "nostalgic"],
  },
  {
    outfit_id: "outfit-4",
    image_url: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&q=80&w=600",
    style_tags: ["streetwear", "trendy pink"],
    dominant_color: "pink",
    emotions: ["joyful", "energetic"],
  },
  {
    outfit_id: "outfit-5",
    image_url: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&q=80&w=600",
    style_tags: ["boho chic", "yellow silk"],
    dominant_color: "yellow",
    emotions: ["joyful", "romantic", "calm"],
  },
  {
    outfit_id: "outfit-6",
    image_url: "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&q=80&w=600",
    style_tags: ["grunge", "leather jacket"],
    dominant_color: "black",
    emotions: ["energetic", "dark"],
  },
  {
    outfit_id: "outfit-7",
    image_url: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600",
    style_tags: ["romantic", "pastel dress"],
    dominant_color: "pastel",
    emotions: ["romantic", "calm", "joyful"],
  },
  {
    outfit_id: "outfit-8",
    image_url: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?auto=format&fit=crop&q=80&w=600",
    style_tags: ["minimalist", "relaxed linen"],
    dominant_color: "gray",
    emotions: ["calm", "melancholic"],
  },
  {
    outfit_id: "outfit-9",
    image_url: "https://images.unsplash.com/photo-1485230895905-ec40ba36b9bc?auto=format&fit=crop&q=80&w=600",
    style_tags: ["vintage", "retro denim"],
    dominant_color: "blue",
    emotions: ["nostalgic", "joyful"],
  },
  {
    outfit_id: "outfit-10",
    image_url: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=600",
    style_tags: ["casual", "cozy oversized sweater"],
    dominant_color: "cream",
    emotions: ["calm", "romantic"],
  }
];

// Initialize DB file
writeDb(readDb());

// ---------------------------------------------------------------------------
// Express backend API routers & Auth Middleware Helpers
// ---------------------------------------------------------------------------

function getUserId(req: any): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  const userIdHeader = req.headers["x-user-id"];
  if (userIdHeader) {
    return String(userIdHeader);
  }
  return "guest-user-session-id-123";
}

// 1. Core Predicting Retrieval Pipeline
app.post("/api/v1/predict", async (req, res) => {
  const { text } = req.body;

  if (!text || text.trim().split(/\s+/).length < 3) {
    return res.status(400).json({ error: "Input text must be at least 3 words." });
  }

  try {
    let dominant_emotion = "melancholic";
    let emotions = {
      melancholic: 0.15,
      joyful: 0.15,
      nostalgic: 0.15,
      energetic: 0.15,
      dark: 0.15,
      romantic: 0.15,
      calm: 0.10,
    };
    let mood_summary = "A delicate and melancholic aesthetic.";
    let confidence = 0.5;

    if (ai) {
      // Call Gemini to act exactly as the multi-class sequence classifier
      const prompt = `Analyze the emotion, tone, and aesthetic mood of the following poetry verse or prose:
"${text}"

Extract the exact emotion probabilities summing up to 1.0. Your output must strictly fit the JSON schema specified.
Classes to evaluate: melancholic, joyful, nostalgic, energetic, dark, romantic, calm.
Also write a 1-sentence poetic mood summary describing the visual aesthetic.
If the dominant emotion probability (confidence) behaves < 0.40, return a low confidence score.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              emotions: {
                type: Type.OBJECT,
                properties: {
                  melancholic: { type: Type.NUMBER },
                  joyful: { type: Type.NUMBER },
                  nostalgic: { type: Type.NUMBER },
                  energetic: { type: Type.NUMBER },
                  dark: { type: Type.NUMBER },
                  romantic: { type: Type.NUMBER },
                  calm: { type: Type.NUMBER },
                },
                required: ["melancholic", "joyful", "nostalgic", "energetic", "dark", "romantic", "calm"],
              },
              dominant_emotion: { type: Type.STRING },
              mood_summary: { type: Type.STRING },
              confidence: { type: Type.NUMBER },
            },
            required: ["emotions", "dominant_emotion", "mood_summary", "confidence"],
          },
        },
      });

      try {
        const parsed = JSON.parse(response.text?.trim() || "{}");
        if (parsed.emotions) emotions = parsed.emotions;
        if (parsed.dominant_emotion) dominant_emotion = parsed.dominant_emotion.toLowerCase();
        if (parsed.mood_summary) mood_summary = parsed.mood_summary;
        if (parsed.confidence) confidence = parsed.confidence;
      } catch {
        // use fallback
      }
    } else {
      // Basic mock NLP heuristics if API key is missing
      const lowercase = text.toLowerCase();
      if (lowercase.includes("rain") || lowercase.includes("cry") || lowercase.includes("sad") || lowercase.includes("autumn")) {
        dominant_emotion = "melancholic";
        emotions = { melancholic: 0.7, dark: 0.1, nostalgic: 0.1, calm: 0.1, energetic: 0.0, romantic: 0.0, joyful: 0.0 };
        mood_summary = "A melancholic and dark autumn aesthetic evoking quiet solitude.";
      } else if (lowercase.includes("sun") || lowercase.includes("happy") || lowercase.includes("laugh") || lowercase.includes("gold")) {
        dominant_emotion = "joyful";
        emotions = { joyful: 0.7, energetic: 0.2, romantic: 0.1, calm: 0.0, dark: 0.0, nostalgic: 0.0, melancholic: 0.0 };
        mood_summary = "A sparkling and joyful aesthetic overflowing with golden hues.";
      } else if (lowercase.includes("love") || lowercase.includes("kiss") || lowercase.includes("rose")) {
        dominant_emotion = "romantic";
        emotions = { romantic: 0.8, calm: 0.1, nostalgic: 0.1, dark: 0.0, energetic: 0.0, joyful: 0.0, melancholic: 0.0 };
        mood_summary = "A passionate, romantic style mirroring roses and intimate warmth.";
      }
    }

    // Enforce ML confidence boundary < 0.40 check
    if (confidence < 0.40) {
      return res.status(422).json({
        detail: `Text too ambiguous for emotion extraction (confidence ${confidence.toFixed(2)} < threshold 0.40)`
      });
    }

    // Perform simulated FAISS vector search matching against GLOBAL OUTFITS
    // Outfits that contain or match the dominant emotion get highly scored
    let matches = GLOBAL_OUTFITS.map((outfit) => {
      let baseScore = 0.5 + Math.random() * 0.2; // base random match margin
      if (outfit.emotions.includes(dominant_emotion)) {
        baseScore += 0.22;
      }
      return {
        outfit_id: outfit.outfit_id,
        image_url: outfit.image_url,
        similarity_score: Math.min(0.99, Number(baseScore.toFixed(4))),
        style_tags: outfit.style_tags,
        source: "deepfashion"
      };
    });

    // Score user's personal wardrobe items as well if they exist!
    const db = readDb();
    const guestUser = getUserId(req); // simulated logged in user
    const personalItems = db.wardrobe_items.filter((item) => item.user_id === guestUser);

    let personalMatches = personalItems.map((item) => {
      // Score personal items based on style tags overlap or simple heuristic
      let baseScore = 0.52 + Math.random() * 0.15;
      const isMatch = item.style_tags.some(t => t.includes(dominant_emotion) || mood_summary.toLowerCase().includes(t));
      if (isMatch) baseScore += 0.25;

      return {
        outfit_id: item.id,
        image_url: item.item_image_url,
        // Apply Wardrobe boost of +0.05
        similarity_score: Math.min(0.99, Number((baseScore + 0.05).toFixed(4))),
        style_tags: item.style_tags,
        source: "wardrobe"
      };
    });

    // Merge searches
    let combinedResults = [...personalMatches, ...matches];
    combinedResults.sort((a, b) => b.similarity_score - a.similarity_score);

    // Choose top 5 matching items
    const topResults = combinedResults.slice(0, 5);

    // Save search history
    const searchId = `search-${Date.now()}`;
    db.searches.unshift({
      id: searchId,
      user_id: guestUser,
      input_text: text,
      dominant_emotion,
      emotion_vector: emotions,
      result_outfit_ids: topResults.map((r) => r.outfit_id),
      similarity_scores: topResults.map((r) => r.similarity_score),
      created_at: new Date().toISOString(),
    });
    writeDb(db);

    return res.json({
      search_id: searchId,
      dominant_emotion,
      mood_summary,
      emotion_breakdown: emotions,
      results: topResults,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "ML prediction failed." });
  }
});

// 2. Personal Search Archive Lists
app.get("/api/v1/history", (req, res) => {
  const db = readDb();
  // Filter Guest matches
  const guestUser = getUserId(req);
  const userSearches = db.searches.filter((s) => s.user_id === guestUser);
  return res.json(userSearches.slice(0, 20));
});

// 3. Simulated Auth endpoints
app.post("/api/v1/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) {
    return res.status(400).json({ error: "Account not found with this email. Please sign up." });
  }
  return res.json({ message: "Login successful", user_id: user.id, email: user.email });
});

app.post("/api/v1/auth/register", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }
  const db = readDb();
  const existing = db.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) {
    return res.status(400).json({ error: "This email address is already registered." });
  }

  const userId = `user-${Date.now()}`;
  const newUser = { id: userId, email: email.trim().toLowerCase() };
  db.users.push(newUser);

  // Seed new users with some beautifully styled baseline wardrobe garments to make their closet populated!
  db.wardrobe_items.push(
    {
      id: `pre-item-1-${userId}`,
      user_id: userId,
      item_image_url: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=300",
      category: "top",
      style_tags: ["minimalist", "casual"],
      created_at: new Date().toISOString(),
    },
    {
      id: `pre-item-2-${userId}`,
      user_id: userId,
      item_image_url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=300",
      category: "bottom",
      style_tags: ["vintage", "grunge"],
      created_at: new Date().toISOString(),
    },
    {
      id: `pre-item-3-${userId}`,
      user_id: userId,
      item_image_url: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=300",
      category: "other",
      style_tags: ["dark academia", "elegant"],
      created_at: new Date().toISOString(),
    }
  );

  writeDb(db);
  return res.json({ message: "Created credentials successfully", user_id: userId, email: email.trim().toLowerCase() });
});

app.post("/api/v1/auth/google", (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid Google email address is required or selected." });
  }

  const db = readDb();
  const normalizedEmail = email.trim().toLowerCase();
  let user = db.users.find(u => u.email.toLowerCase() === normalizedEmail);

  if (!user) {
    // Register Google User on the fly gracefully
    const userId = `google-user-${Date.now()}`;
    user = { id: userId, email: normalizedEmail };
    db.users.push(user);

    // Seed new user with some baselines
    db.wardrobe_items.push(
      {
        id: `pre-item-1-${userId}`,
        user_id: userId,
        item_image_url: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=300",
        category: "top",
        style_tags: ["minimalist", "casual"],
        created_at: new Date().toISOString(),
      },
      {
        id: `pre-item-2-${userId}`,
        user_id: userId,
        item_image_url: "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&q=80&w=300",
        category: "bottom",
        style_tags: ["vintage", "grunge"],
        created_at: new Date().toISOString(),
      },
      {
        id: `pre-item-3-${userId}`,
        user_id: userId,
        item_image_url: "https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&q=80&w=300",
        category: "other",
        style_tags: ["dark academia", "elegant"],
        created_at: new Date().toISOString(),
      }
    );
    writeDb(db);
  }

  return res.json({ message: "Google authentication approved", user_id: user.id, email: user.email });
});

app.post("/api/v1/auth/logout", (req, res) => {
  return res.json({ message: "Logged out" });
});

// 4. Wardrobe Upload Feature (Sect 9)
app.post("/api/v1/wardrobe/upload", async (req, res) => {
  // In simulated frontend, we send image as base64 list: { files: ["data:image/png;base64,..."] }
  const { files } = req.body;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No image files provided." });
  }

  const batch_id = `batch-${Date.now()}`;
  const db = readDb();
  const guestUser = getUserId(req);

  // Simulate background tasks: we can segment items using Gemini API!
  // Send the image base64 directly to Gemini to analyze and suggest sub-items with tags!
  try {
    for (const fileBase64 of files) {
      if (!ai) {
        // Fallback simulated crop item
        db.wardrobe_items.push({
          id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          user_id: guestUser,
          item_image_url: fileBase64, // local data URL representation
          category: ["top", "bottom", "dress", "other"][Math.floor(Math.random() * 4)],
          style_tags: ["casual", "minimalist"],
          created_at: new Date().toISOString(),
        });
        continue;
      }

      // If Gemini holds valid key, parse image structure
      const base64Data = fileBase64.split(",")[1] || fileBase64;
      const mimeType = fileBase64.split(";")[0]?.split(":")[1] || "image/jpeg";

      const prompt = `Analyze this wardrobe or outfit picture. Detect and list separate segmented clothing items (e.g. top, bottom, shoes, outer jacket).
For each detected garment: suggest a category ('top', 'bottom', 'dress', 'other'), and assign 2-3 accurate style tags (e.g. 'dark academia', 'minimalist', 'brutalist streetwear', 'cozy autumn').
Return exactly as JSON matching the schema.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { inlineData: { mimeType, data: base64Data } },
          { text: prompt },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                category: { type: Type.STRING },
                style_tags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["category", "style_tags"],
            },
          },
        },
      });

      try {
        const segments = JSON.parse(response.text?.trim() || "[]");
        if (segments && segments.length > 0) {
          segments.forEach((seg: any) => {
            db.wardrobe_items.push({
              id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: guestUser,
              item_image_url: fileBase64, // Keep image preview
              category: seg.category || "other",
              style_tags: seg.style_tags || ["wardrobe"],
              created_at: new Date().toISOString(),
            });
          });
        } else {
          throw new Error("Zero sub items parsed.");
        }
      } catch {
        // Fallback push whole item
        db.wardrobe_items.push({
          id: `item-${Date.now()}`,
          user_id: guestUser,
          item_image_url: fileBase64,
          category: "other",
          style_tags: ["wardrobe", "aesthetic"],
          created_at: new Date().toISOString(),
        });
      }
    }

    writeDb(db);
    return res.json({
      batch_id,
      status: "ready",
      image_count: files.length,
      message: "Processed and Segmented!"
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed segmenting crops." });
  }
});

app.get("/api/v1/wardrobe/status/:batch_id", (req, res) => {
  return res.json({
    batch_id: req.params.batch_id,
    status: "ready",
    items_extracted: 3
  });
});

app.get("/api/v1/wardrobe/items", (req, res) => {
  const db = readDb();
  const guestUser = getUserId(req);
  const items = db.wardrobe_items.filter((i) => i.user_id === guestUser);
  return res.json({ items, total: items.length, page: 1 });
});

app.delete("/api/v1/wardrobe/items/:item_id", (req, res) => {
  const { item_id } = req.params;
  const db = readDb();
  db.wardrobe_items = db.wardrobe_items.filter((i) => i.id !== item_id);
  writeDb(db);
  return res.status(204).send();
});

app.get("/api/v1/wardrobe/stats", (req, res) => {
  const db = readDb();
  const guestUser = getUserId(req);
  const items = db.wardrobe_items.filter((i) => i.user_id === guestUser);

  const categories: Record<string, number> = { top: 0, bottom: 0, dress: 0, other: 0 };
  items.forEach((item) => {
    const cat = item.category.toLowerCase();
    if (categories[cat] !== undefined) {
      categories[cat] += 1;
    } else {
      categories.other += 1;
    }
  });

  return res.json({
    total_items: items.length,
    categories,
    index_status: items.length > 0 ? "active" : "empty",
    last_updated: new Date().toISOString(),
  });
});

// 5. Saved Outfit Favorites Endpoint
app.get("/api/v1/favorites", (req, res) => {
  const db = readDb();
  const guestUser = getUserId(req);
  const favs = db.favorites.filter((f) => f.user_id === guestUser);
  return res.json({ favorites: favs });
});

app.post("/api/v1/favorites", (req, res) => {
  const { outfit_id, image_url, style_tags, source } = req.body;
  if (!outfit_id || !image_url) {
    return res.status(400).json({ error: "outfit_id and image_url are required" });
  }
  const db = readDb();
  const guestUser = getUserId(req);

  const existingIndex = db.favorites.findIndex(f => f.user_id === guestUser && f.outfit_id === outfit_id);
  if (existingIndex !== -1) {
    db.favorites.splice(existingIndex, 1);
    writeDb(db);
    return res.json({ status: "unfavorited", isFavorited: false });
  }

  const newFav = {
    id: `fav-${Date.now()}`,
    user_id: guestUser,
    outfit_id,
    image_url,
    style_tags: style_tags || [],
    source: source || "deepfashion",
    created_at: new Date().toISOString()
  };
  db.favorites.push(newFav);
  writeDb(db);
  return res.json({ status: "favorited", isFavorited: true, item: newFav });
});

app.delete("/api/v1/favorites/:outfit_id", (req, res) => {
  const { outfit_id } = req.params;
  const db = readDb();
  const guestUser = getUserId(req);
  db.favorites = db.favorites.filter(f => !(f.user_id === guestUser && f.outfit_id === outfit_id));
  writeDb(db);
  return res.status(204).send();
});


// ---------------------------------------------------------------------------
// Integrate Vite build and startup processes
// ---------------------------------------------------------------------------

async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "127.0.0.1", () => {
    console.log(`MoodFit preview server online at http://127.0.0.1:${PORT}`);
  });
}

start();
