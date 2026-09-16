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

// リトライ用のヘルパー関数（エラー時に待機して再試行する）
async function retryOperation(fn, retries = 3, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            // 503エラー（UNAVAILABLE）かつ、まだ試行回数が残っている場合
            if (error.status === 503 && i < retries - 1) {
                console.log(`APIが混雑しています（503）。${delay / 1000}秒後に再試行します... (${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                delay *= 2; // 待機時間を少しずつ長くする（指数バックオフ）
            } else {
                throw error;
            }
        }
    }
}

app.post('/api/chat', upload.single('media'), async (req, res) => {
    try {
        const { message, sessionId = 'default' } = req.body;
        const file = req.file;

        if (!chatSessions[sessionId]) {
            chatSessions[sessionId] = ai.chats.create({
                model: 'gemini-3.6-flash',
                config: {
                    systemInstruction: "あなたは音楽学習プラットフォーム「otomo」の優秀なAIアシスタントです。音楽理論、楽譜の読み方、楽器の練習方法などを分かりやすく教えてください。"
                }
            });
        }

        const chat = chatSessions[sessionId];
        let response;

        // リトライ関数を使ってメッセージを送信する
        await retryOperation(async () => {
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
                fs.unlinkSync(file.path); // 一時ファイルを削除
            } else {
                response = await chat.sendMessage({ message });
            }
        });

        res.json({ reply: response.text });
    } catch (error) {
        console.error("API Error:", error);
        res.status(500).json({ error: "AIの応答取得に失敗しました。しばらく待ってから再度お試しください。" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`otomo サーバー起動完了: http://localhost:3000`);
});