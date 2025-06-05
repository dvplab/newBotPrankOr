import { Bot } from 'grammy';
import axios from 'axios';
import { config } from '../config/config.js';
import Chat from '../models/chat.js';

const bot = new Bot(config.token);

// Умная ссылка Flyer
const MINI_APP_LINK = 'https://t.me/FlyWebTasksBot/app?startapp=3HkVvy';

// Функция для сохранения chatId
export async function saveChatId(userId, chatId) {
    try {
        let user = await Chat.findOne({ userId });

        if (user) {
            user.chatId = chatId;
        } else {
            user = new Chat({ userId, chatId });
        }

        await user.save();
        console.log(`Сохранен chatId для userId ${userId}: ${chatId}`);
    } catch (error) {
        console.error('Ошибка при сохранении chatId:', error);
    }
}

// Проверка заданий Flyer
export async function checkTasksCompleted(userId) {
    try {
        const { data } = await axios.post(
            'https://api.flyerservice.io/get_completed_tasks',
            {
                key: config.flyerApiKey,
                user_id: userId,
            },
            {
                headers: { 'Content-Type': 'application/json' },
            }
        );

        if (
            data.error === 'The user does not have any tasks' ||
            (data.result?.count_all_tasks || 0) === 0
        ) {
            return { status: 'no_tasks' };
        }

        if (data.error) {
            console.warn('Flyer API error:', data.error);
            return { status: 'error' };
        }

        const completed = (data.result.completed_tasks || []).length;
        const total = data.result.count_all_tasks;

        if (completed === total) {
            return { status: 'completed' };
        } else {
            return { status: 'incomplete', completed, total };
        }
    } catch (error) {
        console.error('Flyer check error:', error.response?.data || error);
        return { status: 'error' };
    }
}

// Команда /start
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    // Сохраняем chatId
    await saveChatId(userId, chatId);

    // Проверяем статус заданий
    const flyerStatus = await checkTasksCompleted(userId);

    if (flyerStatus.status === 'completed') {
        const link = `${config.domain}/megapack?userId=${userId}`;
        return ctx.reply(
            `🔗 Вот твоя ссылка:\n\nОтправляй ссылку друзьям, чтобы пранкануть их.\n<a href="${link}">${link}</a>`,
            { parse_mode: 'HTML' }
        );
    }

    if (flyerStatus.status === 'incomplete') {
        const { completed, total } = flyerStatus;
        return ctx.reply(
            `🕒 Выполнено: ${completed} из ${total} заданий.\nЗавершите задания и снова нажмите /start:\n${MINI_APP_LINK}`
        );
    }

    if (flyerStatus.status === 'no_tasks') {
        // Проверим, есть ли пользователь в базе
        const existingUser = await Chat.findOne({ userId });

        if (existingUser) {
            // Пользователь уже был, даем доступ
            const link = `${config.domain}/megapack?userId=${userId}`;
            return ctx.reply(
                `🔗 Вот твоя ссылка:\n\nОтправляй ссылку друзьям, чтобы пранкануть их.\n<a href="${link}">${link}</a>`,
                { parse_mode: 'HTML' }
            );
        } else {
            // Новый пользователь без заданий — отправляем выполнять
            return ctx.reply(
                `📋 Чтобы получить доступ к ссылке, выполните задания:\n\n${MINI_APP_LINK}\n\nПосле выполнения нажмите /start`
            );
        }
    }

    // В случае ошибки — fallback
    return ctx.reply(
        `⚠️ Произошла ошибка при проверке заданий. Попробуйте позже.`
    );
});

export default bot;
