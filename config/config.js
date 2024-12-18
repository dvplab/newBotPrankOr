import dotenv from 'dotenv';
dotenv.config(); // Загружает переменные окружения из .env

export const config = {
    token: process.env.TOKEN,
    channelId: process.env.CHANNEL_ID,
    port: process.env.PORT,
    mongoURI: process.env.MONGO_URI,
    domain: process.env.DOMAIN,
    channelId1: process.env.CHANNEL_ID_1, // ID первого канала
    channelId2: process.env.CHANNEL_ID_2, // ID второго канала
    channelLink1: process.env.CHANNEL_LINK_1, // Ссылка на первый канал
    channelLink2: process.env.CHANNEL_LINK_2, // Ссылка на второй канал
};
