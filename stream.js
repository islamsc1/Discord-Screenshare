const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const ytdl = require('ytdl-core');

class Video {
    async load(url, youtube_dl, msg) {
        if (this.in_loading) return
        this.in_loading = true
        this.driver.executeScript('video.innerHTML = null')

        if (youtube_dl) {
            await msg.edit("Fetching video formats...")
                .then(async msg => {
                    console.log("Fetching video formats...")
                    try {
                        let info = await ytdl.getInfo(url)
                        let formats = info.formats.filter(f => f.hasVideo && f.hasAudio)
                        formats = formats.filter(f => f.height <= 720 && f.fps <= 30)
                        formats = formats.sort((a, b) => b.height - a.height)

                        url = formats[0].url
                    }
                    catch (e) {
                        msg.edit(":no_entry_sign: " + String(e))
                    }
                })
        }

        await this.driver.executeScript(`video.src='${url}'`)
            .then(_ => {
                console.log('Loading...')
                msg.edit("Loading...")
                    .then(_ => {
                        var int1 = setInterval(() => {
                            is_error && clearInterval(int1)

                            if (this.killed) {
                                msg.edit(":no_entry_sign: Loading stopped")
                                this.in_loading = false
                                this.killed = false
                                clearInterval(int1)
                                clearInterval(int2)
                                clearInterval(int3)
                            }

                            this.driver.getCurrentUrl()
                                .then(url => {
                                    if (!this.init && url === "file:///channels/@me") {
                                        this.init = true
                                        this.open_guild()
                                        this.join(msg)
                                        clearInterval(int1)
                                    }
                                    else if (this.init)
                                        clearInterval(int1)
                                })
                        }, 10)
                    })
            })

        // Wait until video load
        let is_load
        var int2 = setInterval(() => {
            this.driver.executeScript("return video.duration")
                .then(result => {
                    if (result) {
                        is_load = true
                        this.duration = result
                        this.in_loading = false
                        msg.edit("Done, Type `*play` to start playing.")
                        clearInterval(int2)
                    }
                    else if (is_error)
                        clearInterval(int2)
                })
        }, 10)

        // Error event
        let is_error
        var int3 = setInterval(() => {
            this.driver.executeScript('return video_error')
                .then(error_msg => {
                    if (error_msg) {
                        msg.edit(":no_entry_sign: " + error_msg)
                        is_error = true
                        this.in_loading = false
                        this.driver.executeScript('video_error = ""')
                        clearInterval(int3)
                        return
                    }
                    else if (is_load)
                        clearInterval(int3)
                })
        }, 10)
    }

    play() {
        console.log("Play")
        this.start()
        this.driver.executeScript('video.play()')
    }

    pause() {
        console.log("Pause")
        this.driver.executeScript('video.pause()')
    }

    current(time = null) {
        if (time) {
            if (time[0] === '+' || time[0] === '-') {
                this.current().then(c => {
                    if (!c) return

                    let r
                    c = parseFloat(c)
                    const s = parseInt(time.slice(1))

                    time[0] === '+' ?
                        r = c + s :
                        r = c - s

                    this.driver.executeScript(`video.currentTime = ${r}`)
                })
            }
            else
                this.driver.executeScript(`video.currentTime = ${time}`)
        }
        else
            return this.driver.executeScript("return video.currentTime")
    }

    hms(sec) {
        if (sec)
            return new Date(sec * 1000).toISOString().substr(11, 8)
        return sec
    }
}

class Stream extends Video {
    client_url = `file://${__dirname}/client/index.html`

    constructor(token, headless = true) {
        super()
        this.debug = true; // Enable debugging
        const chrome_options = new chrome.Options()
        headless && chrome_options.addArguments('--headless')
        chrome_options.addArguments('--no-sandbox')
        chrome_options.addArguments('--window-size=1920,1080')
        chrome_options.addArguments('--disable-web-security')
        chrome_options.addArguments("--disable-gpu")
        chrome_options.addArguments("--disable-features=NetworkService")
        chrome_options.addArguments('--disable-dev-shm-usage')
        chrome_options.addArguments('--autoplay-policy=no-user-gesture-required')
        chrome_options.addArguments('user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.50 Safari/537.36')
        
        // Add codec support
        chrome_options.addArguments('--use-fake-ui-for-media-stream');
        chrome_options.addArguments('--use-fake-device-for-media-stream');
        chrome_options.addArguments('--autoplay-policy=no-user-gesture-required');
        chrome_options.addArguments('--enable-usermedia-screen-capturing');
        chrome_options.addArguments('--allow-file-access-from-files');
        chrome_options.addArguments('--enable-features=WebRTCPipeWireCapturer');
        
        console.log("[Debug] Webdriver starting with options:", chrome_options);
        this.driver = new webdriver.Builder()
            .forBrowser('chrome')
            .setChromeOptions(chrome_options)
            .build()
        
        this.driver.get(this.client_url).then(async () => {
            console.log("[Debug] Client page loaded");
            await this.verifyDOMElements();
        }).catch(err => {
            console.error("[Debug] Error loading client page:", err)
        });
        
        this.initDebugListeners()
    }

    async verifyDOMElements() {
        try {
            const check = await this.driver.executeScript(`
                return {
                    html: document.documentElement.innerHTML.length,
                    video: !!document.querySelector('video'),
                    discord: !!document.querySelector('[class*="discord"]'),
                    token: !!localStorage.getItem('token'),
                    url: window.location.href
                }
            `);
            console.log("[Debug] DOM Check:", check);
        } catch (e) {
            console.error("[Debug] DOM Check Error:", e);
        }
    }

    initDebugListeners() {
        // Add debug event listeners
        this.driver.executeScript(`
            video.addEventListener('play', () => {
                console.log('[Debug] Video started playing');
            });
            video.addEventListener('error', (e) => {
                console.error('[Debug] Video error:', e);
            });
            video.addEventListener('loadeddata', () => {
                console.log('[Debug] Video data loaded');
            });
        `).catch(e => console.error('[Debug] Error setting up listeners:', e));
    }

    async start() {
        console.log("[Debug] Starting stream...")
        try {
            const preCheck = await this.driver.executeScript(`
                return {
                    inVoice: !!document.querySelector('[class*="voiceCallWrapper"]'),
                    hasStreamButton: !!document.querySelector('[aria-label="Share Your Screen"]'),
                    channelName: document.querySelector('[class*="channelName"]')?.textContent,
                    videoElement: !!document.querySelector('video')
                }
            `);
            console.log("[Debug] Pre-stream check:", preCheck);

            if (!preCheck.inVoice) {
                console.error("[Debug] Not in voice channel!");
                return;
            }

            const result = await this.driver.executeScript(`
                const streamBtn = document.querySelector('[aria-label="Share Your Screen"]');
                if (!streamBtn) {
                    console.error('[Debug] Stream button not found');
                    return false;
                }
                console.log('[Debug] Stream button found:', streamBtn.className);
                streamBtn.click();
                return true;
            `);
            
            setTimeout(async () => {
                const postClick = await this.driver.executeScript(`
                    return {
                        streamActive: document.querySelector('[aria-label="Share Your Screen"]')?.className.includes('buttonActive'),
                        screenSharePicker: !!document.querySelector('[class*="shareScreen"]'),
                        errorPopup: !!document.querySelector('[class*="errorModal"]')
                    }
                `);
                console.log("[Debug] Post-click state:", postClick);
            }, 1000);

        } catch (e) {
            console.error("[Debug] Error in start():", e, e.stack);
        }
    }

    async checkStreamStatus() {
        try {
            const status = await this.driver.executeScript(`
                return {
                    videoPresent: !!document.querySelector('video'),
                    videoPlaying: !!(document.querySelector('video')?.currentTime > 0),
                    streamButton: !!document.querySelector('[aria-label="Share Your Screen"]')?.className.includes('buttonActive-3FrkXp'),
                    videoError: document.querySelector('video')?.error
                }
            `);
            console.log("[Debug] Stream status:", status);
            return status;
        } catch (e) {
            console.error("[Debug] Error checking stream status:", e);
            return null;
        }
    }

    async join(msg) {
        console.log("[Debug] Join process started");
        console.log("[Debug] Channel ID:", this.channel_id);
        console.log("[Debug] Guild ID:", this.guild_id);
        
        try {
            const pageState = await this.driver.executeScript(`
                return {
                    url: window.location.href,
                    ready: !!document.querySelector('#app-mount'),
                    loggedIn: !!document.querySelector('[class*="guilds-"]')
                }
            `);
            console.log("[Debug] Page state before join:", pageState);
        } catch (e) {
            console.error("[Debug] Error checking page state:", e);
        }

        var intJoin = setInterval(async () => {
            try {
                console.log("[Debug] Attempting to find channel element");
                const channelCheck = await this.driver.executeScript(`
                    const channel = document.querySelector("[data-list-item-id='channels___${this.channel_id}']");
                    if (!channel) {
                        return { found: false, html: document.documentElement.innerHTML.length };
                    }
                    return { 
                        found: true, 
                        visible: channel.offsetParent !== null,
                        disabled: channel.getAttribute('aria-disabled'),
                        text: channel.textContent
                    };
                `);
                console.log("[Debug] Channel element check:", channelCheck);

                if (channelCheck.found) {
                    console.log("[Debug] Channel found, attempting to click");
                    await this.driver.executeScript(`
                        document.querySelector("[data-list-item-id='channels___${this.channel_id}']").click();
                        console.log('[Debug] Channel clicked');
                    `);
                    
                    console.log("[Debug] Checking voice connection");
                    setTimeout(async () => {
                        const voiceCheck = await this.driver.executeScript(`
                            return {
                                voiceConnected: !!document.querySelector('[class*="voiceCallWrapper"]'),
                                streamButton: !!document.querySelector('[aria-label="Share Your Screen"]'),
                                channelHeader: !!document.querySelector('[class*="channelName"]')?.textContent
                            }
                        `);
                        console.log("[Debug] Voice connection state:", voiceCheck);
                        
                        if (voiceCheck.voiceConnected) {
                            this.start();
                            console.log("[Debug] Voice connected, starting stream");
                            clearInterval(intJoin);
                        }
                    }, 2000);
                } else {
                    console.log("[Debug] Channel not found, scrolling");
                    this.scroll();
                }
            } catch (e) {
                console.error("[Debug] Error in join process:", e);
                this.scroll();
            }
        }, 1000);
    }

    open_guild() {
        this.driver.executeScript(`document.querySelector('[data-list-item-id="guildsnav___${this.guild_id}"]').click()`)
    }

    is_full() {
        return this.driver.executeScript(`
            return document.querySelector("[aria-label='Channel is full']")
        `)
    }

    is_locked() {
        return this.driver.executeScript(`
            return document.querySelector("[data-list-item-id='channels___${this.channel_id}']").innerHTML.includes("Voice (Locked)")
        `)
    }

    scroll() {
        this.driver.executeScript(`
            var c_inject = document.getElementById("channels");
            if( c_inject.scrollTop === (c_inject.scrollHeight - c_inject.offsetHeight))
                c_inject.scroll(0, 0)
            else
                c_inject.scroll(0, c_inject.scrollTop + 250)
        `)
    }

    stop() {
        console.log("Stop")
        this.init = false
        this.driver.get(this.client_url)
    }
}

exports.Stream = Stream

class Stream extends Video {
    constructor(token, headless = true) {
        super()
        this.debug = true;
        const chrome_options = new chrome.Options()
        
        // Update Chrome options for better compatibility
        chrome_options.addArguments('--no-sandbox')
        chrome_options.addArguments('--disable-setuid-sandbox')
        chrome_options.addArguments('--disable-dev-shm-usage')
        chrome_options.addArguments('--disable-gpu')
        chrome_options.addArguments('--no-first-run')
        chrome_options.addArguments('--no-zygote')
        chrome_options.addArguments('--disable-features=IsolateOrigins,site-per-process')
        chrome_options.addArguments('--disable-web-security')
        chrome_options.addArguments('--allow-running-insecure-content')
        chrome_options.addArguments('--window-size=1920,1080')
        chrome_options.addArguments('--remote-debugging-port=9222')
        chrome_options.addArguments(`--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36`)

        console.log("[Debug] Initializing webdriver...")
        this.driver = new webdriver.Builder()
            .forBrowser('chrome')
            .setChromeOptions(chrome_options)
            .build()

        // Initialize Discord
        this.initializeDiscord(token);
    }

    async initializeDiscord(token) {
        try {
            console.log("[Debug] Loading Discord...");
            await this.driver.get('https://discord.com/channels/@me');
            
            // Set token and reload
            await this.driver.executeScript(`
                localStorage.setItem('token', '"${token}"');
                window.location.reload();
            `);

            // Wait for Discord to load
            await this.driver.wait(async () => {
                const check = await this.verifyDOMElements();
                return check.discord;
            }, 10000);

        } catch (e) {
            console.error("[Debug] Discord initialization error:", e);
        }
    }

    async join(msg) {
        console.log("[Debug] Join process started");
        console.log("[Debug] Channel ID:", this.channel_id);
        console.log("[Debug] Guild ID:", this.guild_id);

        try {
            // Wait for guild to load
            await this.driver.wait(async () => {
                try {
                    await this.driver.executeScript(`
                        document.querySelector('[data-list-item-id="guildsnav___${this.guild_id}"]').click();
                    `);
                    return true;
                } catch {
                    return false;
                }
            }, 5000);

            // Wait and click channel
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const joined = await this.driver.executeScript(`
                const channel = document.querySelector('[data-list-item-id="channels___${this.channel_id}"]');
                if (channel) {
                    channel.click();
                    return true;
                }
                return false;
            `);

            if (joined) {
                console.log("[Debug] Channel clicked, waiting for voice connection...");
                // Wait for voice connection
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.start();
            } else {
                console.error("[Debug] Could not find channel");
                msg.channel.send("Could not find voice channel");
            }

        } catch (e) {
            console.error("[Debug] Join error:", e);
            msg.channel.send("Failed to join voice channel");
        }
    }

    async start() {
        console.log("[Debug] Starting stream...");
        try {
            // Wait for voice connection
            await this.driver.wait(async () => {
                const check = await this.driver.executeScript(`
                    return !!document.querySelector('[class*="voiceCallWrapper"]');
                `);
                return check;
            }, 5000);

            // Click stream button
            await this.driver.executeScript(`
                const streamBtn = document.querySelector('[aria-label="Share Your Screen"]');
                if (streamBtn) {
                    streamBtn.click();
                    return true;
                }
                return false;
            `);

            // Verify stream started
            await new Promise(resolve => setTimeout(resolve, 2000));
            const streamStatus = await this.checkStreamStatus();
            console.log("[Debug] Stream status after start:", streamStatus);

        } catch (e) {
            console.error("[Debug] Stream start error:", e);
        }
    }

    // ...existing code...
}
