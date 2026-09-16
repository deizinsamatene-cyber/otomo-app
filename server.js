require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const upload = multer({ dest: 'uploads/' }); // 一時保存フォルダ
const ai = new GoogleGenAI();

app.use(express.json());
app.use(express.static('public'));

// セッションごとのチャット履歴を保持
const chatSessions = {};

app.post('/api/chat', upload.single('media'), async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        const file = req.file;

        if (!chatSessions[sessionId]) {
            chatSessions[sessionId] = ai.chats.create({
                model: 'gemini-2.5-flash',
                config: {
                    systemInstruction: "あなたは音楽学習プラットフォーム「otomo」の優秀なAIアシスタントです。音楽理論、楽譜の読み方、楽器の練習方法などを分かりやすく教えてください。"
                }
            });
        }

        const chat = chatSessions[sessionId];
        let response;

        // 画像や動画ファイルが添付されている場合
        if (file) {
            const fileBuffer = fs.readFileSync(file.path);
            const base64Data = fileBuffer.toString('base64');

            response = await chat.sendMessage({
                message: [
                    message || "このファイルについて解説してください。",
                    {
                        inlineData: {
                            data: base64Data,
                            mimeType: file.mimetype
                        }
                    }
                ]
            });

            // 一時ファイルを削除
            fs.unlinkSync(file.path);
        } else {
            // テキストのみの場合
            response = await chat.sendMessage({ message });
        }

        res.json({ reply: response.text });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "AIの応答取得に失敗しました。" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`otomo サーバー起動完了: http://localhost:3000`);
});