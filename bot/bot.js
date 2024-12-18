import { Bot } from 'grammy';
import axios from 'axios';
import { config } from '../config/config.js';

import Chat from '../models/chat.js';

// Место для хранения chat_id пользователей
const users = {};

const bot = new Bot(config.token);

// Каналы для проверки подписки
const CHANNELS = [
    {
        id: config.channelId1,
        name: 'Первый Паблик',
        link: config.channelLink1,
    },
    {
        id: config.channelId2,
        name: 'Второй Паблик',
        link: config.channelLink2,
    },
];

// Функция для сохранения chatId
export async function saveChatId(userId, chatId) {
    try {
        let user = await Chat.findOne({ userId });

        if (user) {
            // Обновляем chatId, если пользователь уже существует
            user.chatId = chatId;
        } else {
            // Создаем нового пользователя, если его еще нет в базе
            user = new Chat({ userId, chatId });
        }

        await user.save();
        console.log(`Сохранен chatId для userId ${userId}: ${chatId}`);
    } catch (error) {
        console.error('Ошибка при сохранении chatId:', error);
    }
}

// Функция для проверки подписки пользователя на каналы
export async function checkSubscriptions(userId) {
    let notSubscribed = [];

    for (const channel of CHANNELS) {
        try {
            const response = await axios.get(
                `https://api.telegram.org/bot${config.token}/getChatMember`,
                {
                    params: {
                        chat_id: channel.id,
                        user_id: userId,
                    },
                }
            );
            const memberStatus = response.data.result.status;

            if (
                !['member', 'administrator', 'creator'].includes(memberStatus)
            ) {
                notSubscribed.push(channel);
            }
        } catch (error) {
            console.error(
                `Ошибка при проверке подписки на ${channel.name}:`,
                error
            );
        }
    }

    return notSubscribed;
}

// Обработка команды "/start"
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Сохраняем chatId
    saveChatId(userId, chatId);

    // Проверка подписки на каналы
    const notSubscribed = await checkSubscriptions(userId);

    if (notSubscribed.length > 0) {
        // Отправка кнопок для подписки
        const buttons = notSubscribed.map((channel) => [
            { text: `Подписаться на ${channel.name}`, url: channel.link },
        ]);
        await ctx.reply(
            'Чтобы получить доступ к ссылке, подпишитесь на следующие каналы:',
            {
                reply_markup: { inline_keyboard: buttons },
            }
        );
    } else {
        // Генерация ссылки
        const link = `${config.domain}/megapack?userId=${userId}`;
        await ctx.reply(
            `🔗 Вот твоя ссылка:\n\nОтправляй ссылку друзьям, чтобы пранкануть их.\n<a href="${link}">${link}</a>`,
            { parse_mode: 'HTML' }
        );
    }
});

export default bot;
