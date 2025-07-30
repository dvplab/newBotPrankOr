import { Bot, InlineKeyboard } from 'grammy';
import axios from 'axios';
import { config } from '../config/config.js';
import Chat from '../models/chat.js';

const bot = new Bot(config.token);

// Константы для обязательных каналов
const CHANNELS = [
    { id: config.channelId1, link: config.channelLink1 },
    { id: config.channelId2, link: config.channelLink2 },
];

async function saveChatId(userId, chatId) {
    try {
        let user = await Chat.findOne({ userId });
        if (user) {
            user.chatId = chatId;
        } else {
            user = new Chat({ userId, chatId });
        }
        await user.save();
    } catch (error) {
        console.error('Ошибка при сохранении chatId:', error);
    }
}

// =============================
// FLYER API FUNCTIONS
// =============================
async function getTasksFromFlyer(userId, language_code = 'ru') {
    try {
        console.log('[Flyer API] get_tasks request:', {
            userId,
            language_code,
            limit: 4,
        });

        const { data } = await axios.post(
            'https://api.flyerservice.io/get_tasks',
            {
                key: config.flyerApiKey,
                user_id: userId,
                language_code,
                limit: 4,
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log('[Flyer API] get_tasks response:', data);

        if (data.error || !data.result || data.result.length === 0) {
            return [];
        }

        return data.result;
    } catch (e) {
        console.error(
            '[Flyer API] get_tasks error:',
            e.response?.data || e.message || e
        );
        return [];
    }
}

async function checkTaskCompletionFlyer(task) {
    try {
        if (
            task.status &&
            ['done', 'completed', 'complete', true].includes(task.status)
        ) {
            console.log('[Flyer API] check_task skipped (already done):', task);
            return true;
        }

        console.log('[Flyer API] check_task request:', {
            signature: task.signature,
        });

        const { data } = await axios.post(
            'https://api.flyerservice.io/check_task',
            {
                key: config.flyerApiKey,
                signature: task.signature,
            },
            { headers: { 'Content-Type': 'application/json' } }
        );

        console.log('[Flyer API] check_task response:', data);

        if (data.error) return false;

        // Теперь считаем waiting как успешный результат
        return (
            data.result === 'done' ||
            data.result === 'completed' ||
            data.result === true ||
            data.result === 'waiting'
        );
    } catch (e) {
        console.error(
            '[Flyer API] check_task error:',
            e.response?.data || e.message || e
        );
        return false;
    }
}

async function checkAllTasksCompletedFlyer(tasks) {
    for (const task of tasks) {
        if (!task.signature) return false;
        const done = await checkTaskCompletionFlyer(task);
        if (!done) return false;
    }
    return true;
}

// =============================
// BOT COMMANDS
// =============================
bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;
    await saveChatId(userId, chatId);

    const lang = ctx.from.language_code || 'ru';

    // 1. Получаем задания от Flyer
    let flyerTasks = await getTasksFromFlyer(userId, lang);

    if (flyerTasks.length === 0) {
        // Если заданий нет — проверяем подписку на обязательные каналы
        let allJoined = true;
        for (const ch of CHANNELS) {
            try {
                const member = await ctx.api.getChatMember(ch.id, userId);
                if (!member || ['left', 'kicked'].includes(member.status)) {
                    allJoined = false;
                    break;
                }
            } catch (err) {
                console.error('Ошибка при проверке подписки:', err);
                allJoined = false;
                break;
            }
        }

        if (allJoined) {
            // Подписан на оба канала — сразу даём доступ
            const link = `${config.domain}/megapack?userId=${userId}`;
            return ctx.reply(
                `🎉 Спасибо за подписку! Вот твоя ссылка:\n\n<a href="${link}">${link}</a>`,
                { parse_mode: 'HTML' }
            );
        } else {
            // Не подписан — показываем кнопки
            const keyboard = new InlineKeyboard();
            CHANNELS.forEach((ch) => keyboard.url('Подписаться', ch.link));
            keyboard.text('Продолжить', 'check_channels');

            return ctx.reply(
                'Подпишись на эти каналы, затем нажми "Продолжить":',
                { reply_markup: keyboard }
            );
        }
    }

    // Если задания есть — формируем клавиатуру
    const keyboard = new InlineKeyboard();
    flyerTasks.forEach((task) => {
        if (task.link && (task.title || task.name)) {
            keyboard.url('Подписаться', task.link);
        }
    });
    keyboard.text('Продолжить', 'check_flyer');

    await ctx.reply(
        'Выполни задания (подпишись), а затем нажми "Продолжить":',
        { reply_markup: keyboard }
    );
});

// =============================
// CALLBACKS
// =============================

// Проверка Flyer
bot.callbackQuery('check_flyer', async (ctx) => {
    const userId = ctx.from.id;
    const lang = ctx.from.language_code || 'ru';

    const tasks = await getTasksFromFlyer(userId, lang);
    if (tasks.length === 0) {
        await ctx.answerCallbackQuery(
            'Нет заданий для проверки, попробуйте ещё раз'
        );
        return ctx.reply('Задания отсутствуют, попробуйте перезапустить бота.');
    }

    const allDone = await checkAllTasksCompletedFlyer(tasks);
    if (allDone) {
        const link = `${config.domain}/megapack?userId=${userId}`;
        await ctx.reply(
            `🎉 Все задания выполнены! Вот твоя ссылка:\n\n<a href="${link}">${link}</a>`,
            {
                parse_mode: 'HTML',
            }
        );
        await ctx.answerCallbackQuery('Поздравляем! Ссылка отправлена.');
    } else {
        await ctx.reply(
            '❗ Не все задания выполнены. Пожалуйста, завершите все и нажмите "Продолжить" снова.'
        );
        await ctx.answerCallbackQuery('Задания не завершены.');
    }
});

// Проверка подписки на 2 канала
bot.callbackQuery('check_channels', async (ctx) => {
    const userId = ctx.from.id;

    let allJoined = true;
    for (const ch of CHANNELS) {
        try {
            const member = await ctx.api.getChatMember(ch.id, userId);
            if (!member || ['left', 'kicked'].includes(member.status)) {
                allJoined = false;
                break;
            }
        } catch (err) {
            console.error('Ошибка при проверке подписки:', err);
            allJoined = false;
            break;
        }
    }

    if (allJoined) {
        const link = `${config.domain}/megapack?userId=${userId}`;
        await ctx.reply(
            `🎉 Спасибо за подписку! Вот твоя ссылка, Отправь ее другу:\n\n<a href="${link}">${link}</a>`,
            { parse_mode: 'HTML' }
        );
        await ctx.answerCallbackQuery('Подписка подтверждена!');
    } else {
        const keyboard = new InlineKeyboard();
        CHANNELS.forEach((ch) => keyboard.url('Подписаться', ch.link));
        keyboard.text('Продолжить', 'check_channels');

        await ctx.reply(
            '❗ Ты не подписан на все каналы. Подпишись и нажми "Продолжить":',
            { reply_markup: keyboard }
        );
        await ctx.answerCallbackQuery('Подписка не подтверждена.');
    }
});

export default bot;
