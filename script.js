document.addEventListener('DOMContentLoaded', () => {
    const clockGrid = document.getElementById('clock-grid');
    const clockTemplate = document.getElementById('clock-template');
    const themeToggle = document.getElementById('theme-toggle');
    const htmlSelect = document.documentElement;
    const addClockBtn = document.getElementById('add-clock-btn');
    const pickerContainer = document.getElementById('timezone-picker');
    const timezoneSearch = document.getElementById('timezone-search');
    const timezoneList = document.getElementById('timezone-list');

    // State
    let clocks = JSON.parse(localStorage.getItem('clocks')) || [];

    // TRANSFORM: Deduplicate Clocks immediately
    // usage of Map to keep unique timezones, preserving order of first occurrence
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

    // Ensure Salesforce Default exists if explicitly missing (e.g. from fresh start)
    // But deduplication above handles the case where it existed multiple times.
    // If it's missing entirely (user never had it or deleted it before I hid the button), duplicate logic shouldn't add it back unless we consider this a "reset".
    // However, user said "display by default", so let's ensure it's there if the list implies a default state (e.g. only local clock).
    // If user has many clocks, we assume they are customizing, so we don't force it.
    // But given the "I see two" issue, the main fix is the deduplication above.

    // Fallback: If localStorage was empty, `clocks` is [], then we add defaults.
    if (localStorage.getItem('clocks') === null || clocks.length === 0) {
        clocks = [
            { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, isLocal: true },
            { timezone: 'Etc/GMT+6', isLocal: false }
        ];
    } else {
        // If we have data, we just save the deduplicated version back to ensure it persists clean
        localStorage.setItem('clocks', JSON.stringify(clocks));
    }

    // Theme Logic
    const savedTheme = localStorage.getItem('theme') || 'light';
    htmlSelect.setAttribute('data-theme', savedTheme);

    themeToggle.addEventListener('click', () => {
        const currentTheme = htmlSelect.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        htmlSelect.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });

    // Major Timezones (Curated List)
    const majorTimezones = [
        'UTC', // Added UTC
        'Pacific/Midway', 'Pacific/Honolulu', 'America/Anchorage', 'America/Los_Angeles',
        'America/Denver', 'America/Chicago', 'America/New_York', 'America/Sao_Paulo',
        'Atlantic/Azores', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
        'Europe/Moscow', 'Africa/Cairo', 'Africa/Johannesburg', 'Asia/Dubai',
        'Asia/Karachi', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok',
        'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland',
        'Etc/GMT+6' // For Salesforce / Marketing Cloud (Fixed -06:00)
    ];

    // Custom Display Names
    const customLabels = {
        'UTC': 'UTC',
        'Etc/GMT+6': 'Salesforce / MCE'
    };

    // Helper to get offset in minutes
    function getOffsetMinutes(timeZone) {
        try {
            const now = new Date();
            const str = now.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
            // str format like "1/31/2026, 10:00:00 AM GMT-05:00" or "... GMT+05:30"
            const match = str.match(/GMT([+-])(\d{2}):(\d{2})/);
            if (!match) return 0; // UTC or error
            const sign = match[1] === '+' ? 1 : -1;
            const hours = parseInt(match[2], 10);
            const mins = parseInt(match[3], 10);
            return sign * (hours * 60 + mins);
        } catch (e) {
            console.error("Error getting offset for", timeZone, e);
            return 0;
        }
    }

    // Prepare Sorted List
    const processedTimezones = majorTimezones.map(tz => {
        const offsetMins = getOffsetMinutes(tz);

        // Format Offset String
        const sign = offsetMins >= 0 ? '+' : '-';
        const abs = Math.abs(offsetMins);
        const h = Math.floor(abs / 60).toString().padStart(2, '0');
        const m = (abs % 60).toString().padStart(2, '0');
        const offsetLabel = `GMT${sign}${h}:${m}`;

        // City Name
        const city = tz.split('/').pop().replace(/_/g, ' ');

        return {
            id: tz,
            city: city,
            offsetMins: offsetMins,
            offsetLabel: offsetLabel,
            searchStr: (city + " " + tz + (customLabels[tz] || "")).toLowerCase()
        };
    }).sort((a, b) => a.offsetMins - b.offsetMins);

    // Helper to get offset string
    function getOffsetString(timeZone) {
        try {
            const now = new Date();
            const str = now.toLocaleString('en-US', { timeZone, timeZoneName: 'longOffset' });
            const match = str.match(/GMT([+-]\d{2}:\d{2})/);
            return match ? `GMT${match[1]}` : 'GMT+00:00';
        } catch (e) {
            return 'GMT+00:00';
        }
    }

    function renderTimezoneList(filter = "") {
        timezoneList.innerHTML = '';
        const lowerFilter = filter.toLowerCase();

        processedTimezones.forEach(data => {
            if (data.searchStr.includes(lowerFilter)) {
                const li = document.createElement('li');
                li.className = 'timezone-option';

                // Display Logic
                let label = customLabels[data.id];
                if (!label) {
                    label = data.id.replace(/_/g, ' ').split('/').join(' / ');
                }

                li.textContent = `${label} (${data.offsetLabel})`;
                li.dataset.timezone = data.id;
                li.addEventListener('click', () => {
                    addClock(data.id);
                    closePicker();
                });
                timezoneList.appendChild(li);
            }
        });
    }

    // Enhanced Search Aliases
    const extraAliases = {
        'Asia/Kolkata': 'Delhi New Delhi Mumbai India',
        'America/Los_Angeles': 'San Francisco Seattle California',
        'America/New_York': 'Boston',
        'Europe/London': 'UK',
        'Asia/Shanghai': 'Beijing China',
        'Asia/Tokyo': 'Japan'
    };

    // Re-process with aliases
    processedTimezones.forEach(item => {
        if (extraAliases[item.id]) {
            item.searchStr += " " + extraAliases[item.id].toLowerCase();
        }
    });

    // Picker Logic
    function openPicker() {
        pickerContainer.classList.remove('hidden');
        timezoneSearch.value = "";
        renderTimezoneList();
        timezoneSearch.focus();
    }

    function closePicker() {
        pickerContainer.classList.add('hidden');
    }

    function togglePicker() {
        if (pickerContainer.classList.contains('hidden')) {
            openPicker();
        } else {
            closePicker();
        }
    }

    addClockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (clocks.length >= 8) {
            alert('Max 8 clocks allowed.');
            return;
        }
        togglePicker();
    });

    timezoneSearch.addEventListener('input', (e) => {
        renderTimezoneList(e.target.value);
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!pickerContainer.classList.contains('hidden') &&
            !pickerContainer.contains(e.target) &&
            e.target !== addClockBtn &&
            !addClockBtn.contains(e.target)) {
            closePicker();
        }
    });

    // UI functions
    function renderClocks() {
        clockGrid.innerHTML = '';

        // Auto-sort by offset
        clocks.sort((a, b) => getOffsetMinutes(a.timezone) - getOffsetMinutes(b.timezone));
        // Save the sorted order so it persists correctly
        saveClocks();

        // Granular Spacing Support via Data Attribute
        clockGrid.setAttribute('data-clock-count', clocks.length);

        clocks.forEach((clockData, index) => {
            const clone = clockTemplate.content.cloneNode(true);
            const card = clone.querySelector('.clock-card');

            // Elements
            const hourHand = clone.querySelector('.hour-hand');
            const minuteHand = clone.querySelector('.minute-hand');
            const secondHand = clone.querySelector('.second-hand');
            const dateDisplay = clone.querySelector('.date-display');
            const timezoneDisplay = clone.querySelector('.timezone-display');
            const removeBtn = clone.querySelector('.remove-btn');
            const homeIcon = clone.querySelector('.home-icon');
            const salesforceIcon = clone.querySelector('.salesforce-icon');

            // Metadata linkage
            card.dataset.timezone = clockData.timezone;
            card.dataset.index = index;

            // Setup controls
            if (clockData.isLocal) {
                homeIcon.style.display = 'block';
                salesforceIcon.style.display = 'none';
                removeBtn.style.display = 'none';
            } else if (clockData.timezone === 'Etc/GMT+6') {
                homeIcon.style.display = 'none';
                salesforceIcon.style.display = 'block';
                // User requirement: "MCE clock shouldn't show the delete icon"
                removeBtn.style.display = 'none';
            } else {
                homeIcon.style.display = 'none';
                salesforceIcon.style.display = 'none';
                removeBtn.style.display = 'flex';

                // Add event listener ONLY for removable clocks
                removeBtn.addEventListener('click', () => removeClock(index));
            }

            // Initial Update
            updateSingleClock(clockData.timezone, hourHand, minuteHand, secondHand, dateDisplay, timezoneDisplay);

            clockGrid.appendChild(clone);
        });
    }

    function removeClock(index) {
        if (confirm('Are you sure you want to remove this clock?')) {
            clocks.splice(index, 1);
            saveClocks();
            renderClocks();
        }
    }

    function addClock(timezone) {
        if (clocks.length >= 8) {
            alert('Max 8 clocks allowed.');
            return;
        }
        clocks.push({ timezone, isLocal: false });
        saveClocks();
        renderClocks();
    }

    function saveClocks() {
        localStorage.setItem('clocks', JSON.stringify(clocks));
    }

    // Clock Loop
    function updateSingleClock(timezone, hourHand, minuteHand, secondHand, dateDisplay, timezoneDisplay) {
        try {
            const now = new Date();
            const timeInTz = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

            const seconds = timeInTz.getSeconds();
            const milliseconds = now.getMilliseconds();
            const minutes = timeInTz.getMinutes();
            const hours = timeInTz.getHours();

            // Day/Night Logic (Simple 6am-6pm)
            const isDay = hours >= 6 && hours < 18;

            const card = dateDisplay.closest('.clock-card');
            if (card) {
                if (isDay) {
                    card.classList.add('day');
                    card.classList.remove('night');
                } else {
                    card.classList.add('night');
                    card.classList.remove('day');
                }
            }

            const secondsDegrees = ((seconds + milliseconds/1000) / 60) * 360;
            const minutesDegrees = ((minutes / 60) * 360) + ((seconds/60)*6);
            const hoursDegrees = ((hours / 12) * 360) + ((minutes/60)*30);

            secondHand.style.transform = `translateX(-50%) rotate(${secondsDegrees}deg)`;
            minuteHand.style.transform = `translateX(-50%) rotate(${minutesDegrees}deg)`;
            hourHand.style.transform = `translateX(-50%) rotate(${hoursDegrees}deg)`;

            // Date text
            const options = { month: 'short', day: 'numeric', timeZone: timezone };
            dateDisplay.textContent = now.toLocaleDateString('en-US', options).toUpperCase();

            // Timezone Text Logic
            let displayName = customLabels[timezone];
            if (!displayName) {
                displayName = timezone.replace(/_/g, ' ').split('/').join(' / ').toUpperCase();
            }

            // GMT Offset
            const offsetLabel = getOffsetString(timezone);

            // Season Logic
            let season = 'WINTER';

            // Static Timezones override
            if (timezone === 'UTC' || timezone === 'Etc/GMT+6') {
                season = 'No DST';
            } else {
                try {
                    const longName = now.toLocaleDateString('en-US', { timeZone: timezone, timeZoneName: 'long' });
                    const isSummer = longName.toLowerCase().includes('daylight') || longName.toLowerCase().includes('summer');
                    season = isSummer ? 'SUMMER' : 'WINTER';
                } catch (e) {
                    // fallback if long name lookup fails
                }
            }

            timezoneDisplay.innerHTML = `
                <div>${displayName}</div>
                <div class="timezone-details">${offsetLabel} • ${season}</div>
            `;
        } catch (e) {
            console.error("Error updating clock for", timezone, e);
        }
    }

    function tick() {
        const renderedCards = document.querySelectorAll('.clock-card');
        renderedCards.forEach(card => {
            const tz = card.dataset.timezone;
            const hourHand = card.querySelector('.hour-hand');
            const minuteHand = card.querySelector('.minute-hand');
            const secondHand = card.querySelector('.second-hand');
            const dateDisplay = card.querySelector('.date-display');
            const timezoneDisplay = card.querySelector('.timezone-display');

            if (tz && hourHand) {
                 updateSingleClock(tz, hourHand, minuteHand, secondHand, dateDisplay, timezoneDisplay);
            }
        });
        requestAnimationFrame(tick);
    }

    renderClocks();
    requestAnimationFrame(tick);
});
