document.addEventListener('DOMContentLoaded', () => {
    const clockGrid = document.getElementById('clock-grid');
    const clockTemplate = document.getElementById('clock-template');
    const themeToggle = document.getElementById('theme-toggle');
    const htmlSelect = document.documentElement;
    const addClockBtn = document.getElementById('add-clock-btn');
    const pickerContainer = document.getElementById('timezone-picker');
    const timezoneSearch = document.getElementById('timezone-search');
    const timezoneList = document.getElementById('timezone-list');
    const displayToggle = document.getElementById('display-toggle');
    const mceBtn = document.getElementById('mce-btn');

    // MCE Elements
    const mceInlineControls = document.getElementById('mce-inline-controls');
    const datetimeInput = document.getElementById('datetime-input');
    const applyTimeBtn = document.getElementById('apply-time-btn');
    const mceFeedback = document.getElementById('mce-feedback');
    const mceOptionsList = document.getElementById('mce-options-list');
    const mceOpts = document.querySelectorAll('.mce-opt');
    const mceResetBtn = document.getElementById('mce-reset-btn');
    const notificationToast = document.getElementById('notification-toast');


    // Script Output Panel
    const scriptOutput = document.getElementById('script-output');
    const closeScriptBtn = document.getElementById('close-script-panel');
    const copyBtns = document.querySelectorAll('.copy-btn');

    if (closeScriptBtn) {
        closeScriptBtn.addEventListener('click', () => {
            scriptOutput.classList.add('hidden');
        });
    }

    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const text = document.getElementById(targetId).textContent;
            navigator.clipboard.writeText(text).then(() => {
                const originalText = btn.textContent;
                btn.textContent = "COPIED!";
                btn.classList.add('copied');
                setTimeout(() => {
                    btn.textContent = originalText;
                    btn.classList.remove('copied');
                }, 2000);
            });
        });
    });

    // --- STATE & INITIALIZATION ---
    let clocks = JSON.parse(localStorage.getItem('clocks')) || [];
    let displayMode = localStorage.getItem('displayMode') || 'analog';
    let overrideTime = null; // Stays null for live time

    // Deduplicate Clocks immediately
    const uniqueClocks = new Map();
    clocks.forEach(clock => {
        if (!uniqueClocks.has(clock.timezone)) {
            uniqueClocks.set(clock.timezone, clock);
        }
    });
    clocks = Array.from(uniqueClocks.values());

    // Ensure Local Clock always exists
    if (!clocks.some(c => c.isLocal)) {
        clocks.unshift({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, isLocal: true });
    }

    // Default Fallback
    if (localStorage.getItem('clocks') === null || clocks.length === 0) {
        clocks = [
            { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, isLocal: true },
            { timezone: 'Etc/GMT+6', isLocal: false }
        ];
    }
    localStorage.setItem('clocks', JSON.stringify(clocks));

    // --- THEME LOGIC ---
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlSelect.setAttribute('data-theme', savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlSelect.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        htmlSelect.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // --- DISPLAY TOGGLE LOGIC ---
    function updateToggleIcon() {
        if (!displayToggle) return;
        const analogIcon = displayToggle.querySelector('.analog');
        const digitalIcon = displayToggle.querySelector('.digital');
        if (displayMode === 'analog') {
            analogIcon.style.display = 'none';
            digitalIcon.style.display = 'block';
            displayToggle.setAttribute('aria-label', 'Switch to Digital');
        } else {
            analogIcon.style.display = 'block';
            digitalIcon.style.display = 'none';
            displayToggle.setAttribute('aria-label', 'Switch to Analog');
        }
    }
    updateToggleIcon();

    displayToggle.addEventListener('click', () => {
        displayMode = displayMode === 'analog' ? 'digital' : 'analog';
        localStorage.setItem('displayMode', displayMode);
        updateToggleIcon();
        renderClocks();
    });

    // --- MCE CONVERTER LOGIC ---
    if (mceBtn) {
        mceBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            mceOptionsList.classList.toggle('hidden');
            // Close other pickers if open
            pickerContainer.classList.add('hidden');

            // Focus logic
            if (!mceOptionsList.classList.contains('hidden')) {
                const firstOpt = mceOptionsList.querySelector('.mce-opt');
                if (firstOpt) firstOpt.focus();
            }
        });
    }

    // Handle MCE Menu Actions
    mceOpts.forEach(opt => {
        opt.tabIndex = 0; // Make focusable

        const action = () => {
             const actionType = opt.dataset.action;
            mceOptionsList.classList.add('hidden');

            if (actionType === 'convert') {
                mceInlineControls.classList.remove('hidden');
                clockGrid.classList.add('mce-active'); // Add extra padding for scrolling
                datetimeInput.focus();
                if (mceResetBtn) mceResetBtn.classList.remove('hidden');
            } else if (actionType === 'reset') {
                resetToLive();
            }
        };

        opt.addEventListener('click', action);
        opt.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                action();
            }
        });
    });

    // Close MCE picker when clicking outside
    document.addEventListener('click', (e) => {
        if (mceOptionsList && !mceOptionsList.contains(e.target) && e.target !== mceBtn) {
            mceOptionsList.classList.add('hidden');
        }
    });

    if (mceResetBtn) {
        mceResetBtn.addEventListener('click', () => {
            resetToLive();
        });
    }

    function resetToLive() {
        overrideTime = null;
        datetimeInput.value = "";
        mceInlineControls.classList.add('hidden');
        clockGrid.classList.remove('mce-active'); // Remove extra padding
        mceFeedback.textContent = "";
        if (mceResetBtn) mceResetBtn.classList.add('hidden');
        renderClocks();
        requestAnimationFrame(tick);
    }

    applyTimeBtn.addEventListener('click', () => {
        let inputVal = datetimeInput.value.trim();
        if (!inputVal) return;

        // Pre-process common variations for robust parsing
        inputVal = inputVal.replace(/(\d)(AM|PM)/i, '$1 $2');
        inputVal = inputVal.replace(/([a-z]{3}\s\d{1,2})\s(\d{4})/i, '$1, $2');

        // 1. Parse the input as a "nominal" date (using browser's local parser first)
        const nominalDate = new Date(inputVal);

        if (isNaN(nominalDate.getTime())) {
            mceFeedback.textContent = "Invalid format.";
            mceFeedback.style.color = "var(--bauhaus-red)";
        } else {
            // Save current scroll position and first clock position
            const scrollY = window.scrollY;
            const firstClock = clockGrid.querySelector('.clock-card');
            const firstClockTop = firstClock ? firstClock.getBoundingClientRect().top : 0;

            // 2. We want the entered hours/minutes to represent Salesforce time (UTC-6)
            // We extract the YMD HM from the nominal date and construct a UTC date shifted by 6 hours
            const year = nominalDate.getFullYear();
            const month = nominalDate.getMonth();
            const day = nominalDate.getDate();
            const hour = nominalDate.getHours();
            const min = nominalDate.getMinutes();
            const sec = nominalDate.getSeconds();
            const ms = nominalDate.getMilliseconds();

            // UTC = SalesforceTime + 6 hours
            overrideTime = new Date(Date.UTC(year, month, day, hour + 6, min, sec, ms));

            mceFeedback.textContent = "Locked to Salesforce (UTC-6)";
            mceFeedback.style.color = "var(--bauhaus-blue)";
            clockGrid.classList.add('mce-active'); // Add extra padding for scrolling
            if (mceResetBtn) mceResetBtn.classList.remove('hidden');
            renderClocks();

            // Restore visual position by compensating for layout changes
            requestAnimationFrame(() => {
                const firstClockAfter = clockGrid.querySelector('.clock-card');
                if (firstClockAfter) {
                    const firstClockTopAfter = firstClockAfter.getBoundingClientRect().top;
                    const offset = firstClockTopAfter - firstClockTop;
                    window.scrollTo(0, scrollY + offset);
                }
            });
        }
    });

    // --- TIMEZONE DATA ---
    // --- TIMEZONE DATA ---
    const timezoneDatabase = [
        { iana: 'Etc/GMT+12', windows: 'Dateline Standard Time', label: 'International Date Line West' },
        { iana: 'Etc/GMT+11', windows: 'UTC-11', label: 'Coordinated Universal Time-11' },
        { iana: 'Pacific/Honolulu', windows: 'Hawaiian Standard Time', label: 'USA / Honolulu' },
        { iana: 'America/Anchorage', windows: 'Alaskan Standard Time', label: 'USA / Anchorage' },
        { iana: 'America/Los_Angeles', windows: 'Pacific Standard Time', label: 'USA / Los Angeles' },
        { iana: 'America/Denver', windows: 'Mountain Standard Time', label: 'USA / Denver' },
        { iana: 'America/Phoenix', windows: 'US Mountain Standard Time', label: 'USA / Phoenix' },
        { iana: 'America/Chicago', windows: 'Central Standard Time', label: 'USA / Chicago' },
        { iana: 'America/Regina', windows: 'Canada Central Standard Time', label: 'Canada / Regina' },
        { iana: 'America/New_York', windows: 'Eastern Standard Time', label: 'USA / New York' },
        { iana: 'America/Halifax', windows: 'Atlantic Standard Time', label: 'Canada / Halifax' },
        { iana: 'America/St_Johns', windows: 'Newfoundland Standard Time', label: 'Canada / St. Johns' },
        { iana: 'America/Sao_Paulo', windows: 'E. South America Standard Time', label: 'Brazil / Sao Paulo' },
        { iana: 'America/Bogota', windows: 'SA Pacific Standard Time', label: 'Colombia / Bogota' },
        { iana: 'America/Argentina/Buenos_Aires', windows: 'Argentina Standard Time', label: 'Argentina / Buenos Aires' },
        { iana: 'Atlantic/Azores', windows: 'Azores Standard Time', label: 'Portugal / Azores' },
        { iana: 'Atlantic/Cape_Verde', windows: 'Cape Verde Standard Time', label: 'Cape Verde / Praia' },
        { iana: 'Europe/London', windows: 'GMT Standard Time', label: 'UK / London' },
        { iana: 'Europe/Paris', windows: 'Romance Standard Time', label: 'France / Paris' },
        { iana: 'Europe/Berlin', windows: 'W. Europe Standard Time', label: 'Germany / Berlin' },
        { iana: 'Europe/Warsaw', windows: 'Central European Standard Time', label: 'Poland / Warsaw' },
        { iana: 'Europe/Athens', windows: 'GTB Standard Time', label: 'Greece / Athens' },
        { iana: 'Europe/Moscow', windows: 'Russian Standard Time', label: 'Russia / Moscow' },
        { iana: 'Africa/Cairo', windows: 'Egypt Standard Time', label: 'Egypt / Cairo' },
        { iana: 'Africa/Johannesburg', windows: 'South Africa Standard Time', label: 'South Africa / Johannesburg' },
        { iana: 'Asia/Jerusalem', windows: 'Israel Standard Time', label: 'Israel / Jerusalem' },
        { iana: 'Asia/Riyadh', windows: 'Arab Standard Time', label: 'Saudi Arabia / Riyadh' },
        { iana: 'Asia/Dubai', windows: 'Arabian Standard Time', label: 'UAE / Dubai' },
        { iana: 'Asia/Tehran', windows: 'Iran Standard Time', label: 'Iran / Tehran' },
        { iana: 'Asia/Karachi', windows: 'Pakistan Standard Time', label: 'Pakistan / Karachi' },
        { iana: 'Asia/Kolkata', windows: 'India Standard Time', label: 'India / Kolkata' },
        { iana: 'Asia/Dhaka', windows: 'Bangladesh Standard Time', label: 'Bangladesh / Dhaka' },
        { iana: 'Asia/Yekaterinburg', windows: 'Ekaterinburg Standard Time', label: 'Russia / Yekaterinburg' },
        { iana: 'Asia/Bangkok', windows: 'SE Asia Standard Time', label: 'Thailand / Bangkok' },
        { iana: 'Asia/Novosibirsk', windows: 'N. Central Asia Standard Time', label: 'Russia / Novosibirsk' },
        { iana: 'Asia/Shanghai', windows: 'China Standard Time', label: 'China / Shanghai' },
        { iana: 'Asia/Krasnoyarsk', windows: 'North Asia Standard Time', label: 'Russia / Krasnoyarsk' },
        { iana: 'Asia/Irkutsk', windows: 'North Asia East Standard Time', label: 'Russia / Irkutsk' },
        { iana: 'Asia/Tokyo', windows: 'Tokyo Standard Time', label: 'Japan / Tokyo' },
        { iana: 'Asia/Yakutsk', windows: 'Yakutsk Standard Time', label: 'Russia / Yakutsk' },
        { iana: 'Asia/Vladivostok', windows: 'Vladivostok Standard Time', label: 'Russia / Vladivostok' },
        { iana: 'Asia/Magadan', windows: 'Magadan Standard Time', label: 'Russia / Magadan' },
        { iana: 'Australia/Darwin', windows: 'AUS Central Standard Time', label: 'Australia / Darwin' },
        { iana: 'Australia/Adelaide', windows: 'Cen. Australia Standard Time', label: 'Australia / Adelaide' },
        { iana: 'Australia/Brisbane', windows: 'E. Australia Standard Time', label: 'Australia / Brisbane' },
        { iana: 'Australia/Sydney', windows: 'AUS Eastern Standard Time', label: 'Australia / Sydney' },
        { iana: 'Australia/Perth', windows: 'W. Australia Standard Time', label: 'Australia / Perth' },
        { iana: 'Pacific/Guam', windows: 'West Pacific Standard Time', label: 'Guam / Hagatna' },
        { iana: 'Pacific/Auckland', windows: 'New Zealand Standard Time', label: 'New Zealand / Auckland' },
        { iana: 'Pacific/Tongatapu', windows: 'Tonga Standard Time', label: 'Tonga / Nuku\'alofa' },
        { iana: 'Pacific/Fiji', windows: 'Fiji Standard Time', label: 'Fiji / Suva' },
        { iana: 'Pacific/Pago_Pago', windows: 'UTC-11', label: 'Midway Island / Samoa' },
        { iana: 'UTC', windows: 'UTC', label: 'UTC' },
        { iana: 'Etc/GMT+6', windows: 'Central America Standard Time', label: 'Salesforce / MCE' }
    ];

    function getOffsetMinutes(timeZone, referenceDate = new Date()) {
        try {
            const str = referenceDate.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
            const match = str.match(/GMT([+-])(\d{2}):(\d{2})/);
            if (!match) return 0;
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const mins = parseInt(match[3], 10);
            return sign * (hours * 60 + mins);
        } catch (e) {
            return 0;
        }
    }

    function getOffsetString(timeZone, referenceDate = new Date()) {
        try {
            const str = referenceDate.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
            const match = str.match(/GMT([+-]\d{2}:\d{2})/);
            return match ? `GMT${match[1]}` : 'GMT+00:00';
        } catch (e) {
            return 'GMT+00:00';
        }
    }

    const processedTimezones = timezoneDatabase.map(tz => {
        const offsetMins = getOffsetMinutes(tz.iana);
        const sign = offsetMins >= 0 ? '+' : '-';
        const abs = Math.abs(offsetMins);
        const h = Math.floor(abs / 60).toString().padStart(2, '0');
        const m = (abs % 60).toString().padStart(2, '0');
        const offsetLabel = `GMT${sign}${h}:${m}`;

        return {
            id: tz.iana,
            city: tz.label, // Using label as primary identifier for search/display logic
            windows: tz.windows,
            offsetMins: offsetMins,
            offsetLabel: offsetLabel,
            searchStr: (tz.label + " " + tz.iana + " " + tz.windows).toLowerCase(),
            original: tz
        };
    }).sort((a, b) => a.offsetMins - b.offsetMins);

    // --- PICKER LOGIC ---
    function renderTimezoneList(filter = "") {
        timezoneList.innerHTML = '';
        const lowerFilter = filter.toLowerCase();
        // Get currently used timezones to filter them out
        const usedTimezones = clocks.map(c => c.timezone);

        processedTimezones.forEach(data => {
            // Skip if timezone is already added
            if (usedTimezones.includes(data.id)) return;

            if (data.searchStr.includes(lowerFilter)) {
                const li = document.createElement('li');
                li.className = 'timezone-option';
                li.textContent = `${data.city} (${data.offsetLabel})`; // city is now the full label e.g. "Poland / Warsaw"
                li.title = data.windows; // Tooltip with Windows Timezone Name
                li.dataset.timezone = data.id;
                li.tabIndex = 0; // Make focusable

                const selectAction = () => {
                    addClock(data.id);
                    closePicker();
                    addClockBtn.focus(); // Return focus
                };

                li.addEventListener('click', selectAction);
                li.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectAction();
                    }
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        const next = li.nextElementSibling;
                        if (next) next.focus();
                    }
                    if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        const prev = li.previousElementSibling;
                        if (prev) prev.focus();
                        else timezoneSearch.focus();
                    }
                });
                timezoneList.appendChild(li);
            }
        });
    }

    function openPicker() {
        pickerContainer.classList.remove('hidden');
        timezoneSearch.value = "";
        renderTimezoneList();
        timezoneSearch.focus();
    }

    function closePicker() {
        pickerContainer.classList.add('hidden');
    }

    addClockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (clocks.length >= 8) {
            showNotification('MAX 8 CLOCKS ALLOWED');
            return;
        }
        if (pickerContainer.classList.contains('hidden')) openPicker();
        else closePicker();
    });

    timezoneSearch.addEventListener('input', (e) => renderTimezoneList(e.target.value));

    // Search Box Keyboard Nav
    timezoneSearch.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const firstItem = timezoneList.firstElementChild;
            if (firstItem) firstItem.focus();
        }
    });

    document.addEventListener('click', (e) => {
        if (!pickerContainer.classList.contains('hidden') &&
            !pickerContainer.contains(e.target) &&
            e.target !== addClockBtn &&
            !addClockBtn.contains(e.target)) {
            closePicker();
        }
    });

    // --- CLOCK RENDERING ---
    function renderClocks() {
        clockGrid.innerHTML = '';
        const ref = overrideTime || new Date();
        clocks.sort((a, b) => getOffsetMinutes(a.timezone, ref) - getOffsetMinutes(b.timezone, ref));
        saveClocks();
        clockGrid.setAttribute('data-clock-count', clocks.length);

        clocks.forEach((clockData, index) => {
            const clone = clockTemplate.content.cloneNode(true);
            const card = clone.querySelector('.clock-card');
            const hourHand = clone.querySelector('.hour-hand');
            const minuteHand = clone.querySelector('.minute-hand');
            const secondHand = clone.querySelector('.second-hand');
            const dateDisplay = clone.querySelector('.date-display');
            const timezoneDisplay = clone.querySelector('.timezone-display');
            const removeBtn = clone.querySelector('.remove-btn');
            const homeIcon = clone.querySelector('.home-icon');
            const salesforceIcon = clone.querySelector('.salesforce-icon');
            const analogFace = clone.querySelector('.analog-face');
            const digitalFace = clone.querySelector('.digital-face');
            const deleteOverlay = clone.querySelector('.delete-overlay');
            const confirmBtn = clone.querySelector('.confirm-delete');
            const cancelBtn = clone.querySelector('.cancel-delete');

            const getScriptContainer = clone.querySelector('.get-script-container');
            const getScriptBtn = clone.querySelector('.get-script-btn');
            const scriptOptions = clone.querySelector('.script-options');

            card.dataset.timezone = clockData.timezone;
            card.dataset.index = index;

            // Faces Visibility
            if (displayMode === 'analog') {
                analogFace.classList.remove('hidden');
                digitalFace.classList.add('hidden');
            } else {
                analogFace.classList.add('hidden');
                digitalFace.classList.remove('hidden');
            }

            // Controls
            const isSalesforce = clockData.timezone === 'Etc/GMT+6';
            if (clockData.isLocal) {
                homeIcon.style.display = 'block';
                salesforceIcon.style.display = 'none';
                removeBtn.style.display = 'none';
                getScriptContainer.classList.toggle('hidden', !overrideTime);
            } else if (isSalesforce) {
                homeIcon.style.display = 'none';
                salesforceIcon.style.display = 'block';
                removeBtn.style.display = 'none';
                getScriptContainer.classList.add('hidden'); // Never for Salesforce
            } else {
                homeIcon.style.display = 'none';
                salesforceIcon.style.display = 'none';
                removeBtn.style.display = 'flex';
                getScriptContainer.classList.toggle('hidden', !overrideTime);

                removeBtn.addEventListener('click', () => {
                    deleteOverlay.classList.remove('hidden');
                });

                cancelBtn.addEventListener('click', () => {
                    deleteOverlay.classList.add('hidden');
                });

                confirmBtn.addEventListener('click', () => {
                    clocks.splice(index, 1);
                    saveClocks();
                    renderClocks();
                });
            }

            // Simplified Get Script Logic - Direct Multi-Language output (DST Aware Refined)
            getScriptBtn.addEventListener('click', () => {
                const iana = clockData.timezone;
                const tzEntry = timezoneDatabase.find(t => t.iana === iana);
                const windowsName = tzEntry ? tzEntry.windows : 'Target Standard Time';
                const now = overrideTime || new Date();
                const isLocal = clockData.isLocal;
                const isUtc = iana === 'UTC';

                // 1. Calculate Offsets for Winter (Jan) and Summer (Jul)
                const currentYear = now.getFullYear();
                const jan = new Date(currentYear, 0, 1);
                const jul = new Date(currentYear, 6, 1);

                const systemOffset = -360; // SFMC is fixed UTC-6

                const offWinter = getOffsetMinutes(iana, jan);
                const offSummer = getOffsetMinutes(iana, jul);

                const offsetWinterHours = (offWinter - systemOffset) / 60;
                const offsetSummerHours = (offSummer - systemOffset) / 60;

                // 2. Get Timezone Shortcut for Alias
                let tzShort = 'TZ';
                try {
                    const formatter = new Intl.DateTimeFormat('en-US', {
                        timeZone: iana,
                        timeZoneName: 'short'
                    });
                    tzShort = formatter.formatToParts(now).find(p => p.type === 'timeZoneName')?.value || 'TZ';
                } catch (e) {}

                const sanitizedTz = tzShort.replace(/\+/g, 'plus').replace(/-/g, 'minus');

                // 3. Generate Snippets
                const sqlSnippet = `[DateColumn] AT TIME ZONE 'Central America Standard Time' AT TIME ZONE '${windowsName}' AS [DateColumn_${sanitizedTz}]`;

                let ampSnippet, ssjsSnippet;

                if (isLocal) {
                    ampSnippet = `%%[\n    VAR @date, @convertedDate\n    SET @date = [DateColumn]\n    SET @convertedDate = SystemDateToLocalDate(@date)\n]%%`;
                    ssjsSnippet = `<script runat="server">\n    Platform.Load('Core', '1.1.1');\n    var date = Attribute.GetValue('DateColumn');\n    var convertedDate = Platform.Function.SystemDateToLocalDate(date);\n</script>`;
                } else if (isUtc) {
                    ampSnippet = `%%[\n    VAR @date, @convertedDate\n    SET @date = [DateColumn]\n    SET @convertedDate = DateAdd(@date, 6, 'H')\n]%%`;
                    ssjsSnippet = `<script runat="server">\n    Platform.Load('Core', '1.1.1');\n    var date = Attribute.GetValue('DateColumn'); \n    var convertedDate = Platform.Function.DateAdd(date, 6, 'H');\n</script>`;
                } else {
                    // Logic with User-Defined DST bounds
                    ampSnippet = `%%[\n    VAR @date, @summerTimeStart, @summerTimeEnd, @winterOffset, @summerOffset, @offset, @convertedDate\n    SET @date = [DateColumn]\n    SET @summerTimeStart = '${currentYear}-03-30' /* UPDATE TO ACTUAL */\n    SET @summerTimeEnd = '${currentYear}-10-26'   /* UPDATE TO ACTUAL */\n    \n    SET @winterOffset = ${offsetWinterHours}\n    SET @summerOffset = ${offsetSummerHours}\n    \n    IF @date >= @summerTimeStart AND @date <= @summerTimeEnd THEN\n        SET @offset = @summerOffset\n    ELSE\n        SET @offset = @winterOffset\n    ENDIF\n    \n    SET @convertedDate = DateAdd(@date, @offset, 'H')\n]%%`;

                    ssjsSnippet = `<script runat="server">\n    Platform.Load('Core', '1.1.1');\n    var date = Attribute.GetValue('DateColumn');\n    var summerTimeStart = new Date('${currentYear}-03-30'); // UPDATE TO ACTUAL\n    var summerTimeEnd = new Date('${currentYear}-10-26');   // UPDATE TO ACTUAL\n    \n    var offset = (date >= summerTimeStart && date <= summerTimeEnd) ? ${offsetSummerHours} : ${offsetWinterHours};\n    var convertedDate = Platform.Function.DateAdd(date, offset, 'H');\n</script>`;
                }

                // 4. Populate UI
                document.getElementById('sql-text').textContent = sqlSnippet;
                document.getElementById('ampscript-text').textContent = ampSnippet;
                document.getElementById('ssjs-text').textContent = ssjsSnippet;

                scriptOutput.classList.remove('hidden');
            });

            updateSingleClock(
                clockData.timezone,
                hourHand, minuteHand, secondHand,
                dateDisplay, timezoneDisplay,
                analogFace, digitalFace,
                ref
            );
            clockGrid.appendChild(clone);
        });
    }

    function addClock(timezone) {
        if (clocks.length >= 8) {
            showNotification('MAX 8 CLOCKS ALLOWED');
            return;
        }
        clocks.push({ timezone, isLocal: false });
        saveClocks();
        renderClocks();
    }

    function saveClocks() { localStorage.setItem('clocks', JSON.stringify(clocks)); }

    function updateSingleClock(timezone, hourHand, minuteHand, secondHand, dateDisplay, timezoneDisplay, analogFace, digitalFace, referenceDate = new Date()) {
        try {
            // Use Intl.DateTimeFormat to reliably get components in the target timezone
            const formatter = new Intl.DateTimeFormat('en-US', {
                timeZone: timezone,
                hour: 'numeric',
                minute: 'numeric',
                second: 'numeric',
                hour12: false,
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            const parts = formatter.formatToParts(referenceDate);
            const getPart = (type) => parts.find(p => p.type === type)?.value;

            const h = parseInt(getPart('hour'), 10);
            const m = parseInt(getPart('minute'), 10);
            const s = parseInt(getPart('second'), 10);
            const ms = referenceDate.getMilliseconds();

            const card = timezoneDisplay ? timezoneDisplay.closest('.clock-card') : null;
            if (card) {
                const isDay = h >= 6 && h < 18;
                card.classList.toggle('day', isDay);
                card.classList.toggle('night', !isDay);
            }

            if (displayMode === 'analog' && hourHand) {
                // Ensure second hand reflects the applied point in time exactly
                const sDeg = ((s + ms / 1000) / 60) * 360;
                const mDeg = ((m / 60) * 360) + ((s / 60) * 6);
                const hDeg = ((h / 12) * 360) + ((m / 60) * 30);

                secondHand.style.transform = `translateX(-50%) rotate(${sDeg}deg)`;
                minuteHand.style.transform = `translateX(-50%) rotate(${mDeg}deg)`;
                hourHand.style.transform = `translateX(-50%) rotate(${hDeg}deg)`;

                if (dateDisplay) {
                    const monthStr = getPart('month').toUpperCase();
                    const dayStr = getPart('day');
                    dateDisplay.textContent = `${monthStr} ${dayStr}`;
                }
            }

            if (displayMode === 'digital' && digitalFace) {
                const hStr = h.toString().padStart(2, '0');
                const mStr = m.toString().padStart(2, '0');
                digitalFace.querySelector('.digital-time').textContent = `${hStr}:${mStr}`;

                const monthStr = getPart('month').toUpperCase();
                const dayStr = getPart('day');
                const yearStr = getPart('year');
                digitalFace.querySelector('.digital-date').textContent = `${monthStr} ${dayStr}, ${yearStr}`;
            }

            // Find Label
            const tzData = timezoneDatabase.find(t => t.iana === timezone);
            const displayName = tzData ? tzData.label : timezone.replace(/_/g, ' ').split('/').join(' / ');

            const offset = getOffsetString(timezone, referenceDate);
            let season = 'WINTER';
            if (timezone === 'UTC' || timezone === 'Etc/GMT+6') {
                season = 'No DST';
            } else {
                try {
                    const long = referenceDate.toLocaleString('en-US', { timeZone: timezone, timeZoneName: 'long' });
                    season = long.toLowerCase().includes('daylight') || long.toLowerCase().includes('summer') ? 'SUMMER' : 'WINTER';
                } catch (e) {}
            }
            if (timezoneDisplay) {
                timezoneDisplay.innerHTML = `<div>${displayName}</div><div class="timezone-details">${offset} • ${season}</div>`;
            }
        } catch (e) {
            console.error("Error updating clock:", e);
        }
    }

    function tick() {
        const ref = overrideTime || new Date();
        const cards = document.querySelectorAll('.clock-card');
        cards.forEach(card => {
            const tz = card.dataset.timezone;
            const hourHand = card.querySelector('.hour-hand');
            const minuteHand = card.querySelector('.minute-hand');
            const secondHand = card.querySelector('.second-hand');
            const dateDisplay = card.querySelector('.date-display');
            const timezoneDisplay = card.querySelector('.timezone-display');
            const analogFace = card.querySelector('.analog-face');
            const digitalFace = card.querySelector('.digital-face');
            if (tz) updateSingleClock(tz, hourHand, minuteHand, secondHand, dateDisplay, timezoneDisplay, analogFace, digitalFace, ref);
        });

        if (!overrideTime) {
            requestAnimationFrame(tick);
        }
    }

    // --- UTILS ---
    let toastTimeout;
    function showNotification(msg) {
        if (!notificationToast) return;
        notificationToast.textContent = msg;
        notificationToast.classList.remove('hidden');

        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            notificationToast.classList.add('hidden');
        }, 3000);
    }

    // INITIAL STARTUP
    renderClocks();
    requestAnimationFrame(tick);
});
