require('dotenv').config()
const { Stream } = require('./stream')
const Discord = require('discord.js-selfbot-v13')
const { writeFile } = require('fs')
let users = require('./users.json')

let intLoop = null
let loop = false
const reject = '❌'
const accept = '✅'
const prefix = '*'
const client = new Discord.Client({
    checkUpdate: false, // Disable update checking
    autoRedeemNitro: false,
    captchaKey: '',
    password: '',
    captchaService: ''
});
const token = process.env.token
let stream = new Stream(token)
const url_expression = /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/gi;
const url_regex = new RegExp(url_expression)

const helpMessage = `Help\n
    *p \`url\` | Youtube | direct link (without downloading)\n
    *play | Play video\n
    *pause | Pause video\n
    *duration | Show video duration\n
    *seek | Show current video time\n
    *seek \`sec, +sec, -sec\` | Change video time\n
    *loop | Toggle playing video on loop\n
    *stop | Stop streaming\n
    *screenshot | Take a screenshot of current video\n
`

const notAllowed = msg => {
    return stream.owner !== msg.author.id &&
        stream.owner !== process.env.owner_id &&
        !msg.member.permissions.has('ADMINISTRATOR')
}

client.on('ready', () => {
    console.log("Bot started")
})

console.log("[Debug] ENV token (truncated):", token ? token.slice(0,10)+"..." : "No token found");
process.env.owner_id
    ? console.log("[Debug] Owner ID found:", process.env.owner_id)
    : console.warn("[Debug] No owner_id in env");

client.on('messageCreate', msg => {
    console.log("[Debug] New message received:", msg.content);
    if (msg.content.startsWith(prefix)) {
        content = msg.content.split(" ")
        command = content[0].split(prefix)[1]

        if (process.env.owner_id && !users.includes(msg.author.id) && msg.author.id != process.env.owner_id) return

        switch (command) {
            case 'p':
                if (stream.in_progress && notAllowed(msg)) {
                    msg.reply("Another session is already in progress")
                    return
                }

                const voice_channel = msg.member.voice.channel
                if (!voice_channel) {
                    msg.reply("You need to be in a voice channel to use this command")
                    return
                }

                stream.in_progress = true
                stream.owner = msg.author.id
                stream.guild_id = msg.guild.id
                stream.channel_id = voice_channel.id
                url = content[content.length - 1]
                if (!url || !url.match(url_regex)) {
                    msg.react(reject)
                    return
                }

                !stream.in_loading ?
                    msg.channel.send("Please wait...")
                        .then(msg => {
                            // not safe...
                            if (url.includes('youtube.com') || url.includes('youtu.be'))
                                stream.load(url, true, msg)
                            else
                                stream.load(url, false, msg)
                        }) :
                    msg.reply("Another video loading is already in progress, Try again later.")
                break;
            case 'play':
                notAllowed(msg) ?
                    msg.react(reject) :
                    stream.play()
                break;
            case 'pause':
                notAllowed(msg) ?
                    msg.react(reject) :
                    stream.pause()
                break;
            case 'duration':
                stream.duration ?
                    msg.channel.send(stream.hms(stream.duration)) :
                    msg.reply("N/A, try again later")
                break;
            case 'seek':
                if (content[1])
                    notAllowed(msg) ?
                        msg.react(reject) :
                        stream.current(content[1])
                else
                    stream.current().then(result => {
                        if (result)
                            msg.channel.send(stream.hms(result))
                        else
                            msg.reply("N/A, try again later")
                    })
                break;
            case 'loop':
                if (notAllowed(msg))
                    msg.react(reject)
                else {
                    if (!loop) {
                        loop = true
                        intLoop = setInterval(() => {
                            stream.current().then(result => {
                                if (result >= stream.duration)
                                    stream.driver.executeScript('video.play()')
                            })
                        }, 100)
                        msg.reply("Video loop set")
                    } else {
                        loop = false
                        clearInterval(intLoop)
                        msg.reply("Video loop unset")
                    }
                }
                break;
            case 'stop':
                if (notAllowed(msg))
                    msg.react(reject)
                else {
                    stream.download_process && stream.download_process.kill()
                    stream.stop()
                    if (stream.in_loading) stream.killed = true
                    stream.in_loading = false
                    stream.in_progress = false
                    msg.react(accept)
                }
                break;
            case 'screenshot':
            case 'ss':
                if (notAllowed(msg)) {
                    msg.react(reject);
                    return;
                }
                
                msg.channel.send("Taking screenshot...").then(async statusMsg => {
                    const screenshot = await stream.takeScreenshot();
                    if (screenshot) {
                        await msg.channel.send({
                            files: [{
                                attachment: screenshot,
                                name: 'screenshot.png'
                            }]
                        });
                        statusMsg.delete().catch(() => {});
                    } else {
                        statusMsg.edit("Failed to take screenshot. Make sure video is playing.");
                    }
                });
                break;
            case 'help':
                msg.channel.send(helpMessage)
                break;
            case 'add':
                id = content[content.length - 1]
                if (!id || msg.author.id != process.env.owner_id) return

                users.push(id)
                writeFile('users.json', JSON.stringify(users), err => {
                    if (err) {
                        msg.channel.send(err)
                        return
                    }

                    msg.reply('User added')
                })
                break;
            case 'remove':
                id = content[content.length - 1]
                if (!id || msg.author.id != process.env.owner_id) return

                if (!users.includes(id)) {
                    msg.reply('User does not exist')
                    return
                }

                users = users.filter(e => e != id)
                writeFile('users.json', JSON.stringify(users), err => {
                    if (err) {
                        msg.channel.send(err)
                        return
                    }

                    msg.reply('User removed')
                })
                break;
            case 'list':
                msg.channel.send(users.length !== 0 ? users.join('\n\n') : 'No user available')
                break;
            default:
                console.log("[Debug] Unknown command:", command);
                msg.reply("Unknown command, type `*help` for list of commands")
        }

        process.env.log_channel_id &&
            client.channels.cache.get(process.env.log_channel_id).send(`Command: ${msg.content}\nSender: ${msg.author.username} | ${msg.author.id}`)
    }
})

// Add error handling for client connection
client.on('error', error => {
    console.error('Discord client error:', error);
});

// Add reconnection handling
client.on('disconnect', () => {
    console.log('Bot disconnected, attempting to reconnect...');
    client.login(token).catch(err => {
        console.error('Failed to reconnect:', err);
    });
});

// Modify the login to include error handling
client.login(token).catch(error => {
    console.error('Failed to login:', error);
});

// Add process error handlers
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});