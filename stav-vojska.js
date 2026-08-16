(async function () {
    'use strict';

    const SCRIPT_ID = 'dk-army-tool-v34-test';

    const STORAGE_GROUP = 'dkArmyToolGroup';
    const STORAGE_TYPE = 'dkArmyToolType';

    document.getElementById(SCRIPT_ID)?.remove();

    const normalize = s =>
        (s || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

    const cleanText = s =>
        (s || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

    const toNumber = s => {

        const text =
            String(s || '')
                .replace(/\u00a0/g, ' ')
                .trim();

        if (!text) {
            return 0;
        }

        /*
         * DK může na některých zařízeních zobrazit např.
         * "12215 (30)". Číslo v závorce není stav vojska.
         */
        const beforeBracket =
            text.split('(')[0]
                .trim();

        const match =
            beforeBracket.match(
                /\d[\d\s.]*/
            );

        if (!match) {
            return 0;
        }

        return (
            parseInt(
                match[0]
                    .replace(/[^\d]/g, ''),
                10
            ) || 0
        );
    };

    const fmt = n =>
        Number(n || 0)
            .toLocaleString('cs-CZ');

    const TYPES = {

        own: {
            label: 'Vlastní',
            matches: ['vlastní']
        },

        village: {
            label: 'Ve vesnici',
            matches: ['ve vesnici']
        },

        outside: {
            label: 'Mimo vesnici',
            matches: ['venku']
        },

        travelling: {
            label: 'Na cestě',
            matches: [
                'na cestě',
                'na ceste'
            ]
        },

        total: {
            label: 'Celkem',
            matches: ['celkem']
        }
    };

    async function fetchDoc(url) {

        const response = await fetch(
            url,
            {
                credentials: 'same-origin'
            }
        );

        if (!response.ok) {
            throw new Error(
                'HTTP ' + response.status
            );
        }

        const html =
            await response.text();

        return new DOMParser()
            .parseFromString(
                html,
                'text/html'
            );
    }

    function getBaseUrl() {

        const current =
            new URL(location.href);

        const url =
            new URL(
                location.origin +
                location.pathname
            );

        const village =
            current.searchParams
                .get('village');

        if (village) {
            url.searchParams.set(
                'village',
                village
            );
        }

        url.searchParams.set(
            'screen',
            'overview_villages'
        );

        url.searchParams.set(
            'mode',
            'units'
        );

        return url;
    }

    async function loadSummary(groupId) {

        const url = getBaseUrl();

        url.searchParams.set(
            'group',
            groupId
        );

        url.searchParams.set(
            'page',
            '-1'
        );

        return fetchDoc(
            url.toString()
        );
    }

    async function loadSupports(groupId) {

        const url = getBaseUrl();

        url.searchParams.set(
            'type',
            'away_detail'
        );

        url.searchParams.set(
            'filter_villages',
            '1'
        );

        url.searchParams.set(
            'group',
            groupId
        );

        url.searchParams.set(
            'page',
            '-1'
        );

        return fetchDoc(
            url.toString()
        );
    }

    function findSummaryTable(doc) {

        return [
            ...doc.querySelectorAll('table')
        ].find(table => {

            const text =
                normalize(
                    table.textContent
                );

            return (
                text.includes('vlastní') &&
                text.includes('ve vesnici') &&
                text.includes('venku') &&
                text.includes('na cestě') &&
                text.includes('celkem')
            );
        });
    }

    function findSupportTable(doc) {

        const tables =
            [
                ...doc.querySelectorAll(
                    'table'
                )
            ];

        let table =
            tables.find(t => {

                const text =
                    normalize(
                        t.textContent
                    );

                return (
                    text.includes(
                        'vzdálenost'
                    ) &&
                    t.querySelectorAll(
                        'input[type="checkbox"]'
                    ).length > 1
                );
            });

        if (table) {
            return table;
        }

        table =
            tables.find(t => {

                const checkboxes =
                    t.querySelectorAll(
                        'input[type="checkbox"]'
                    ).length;

                const coordinates =
                    (
                        t.textContent
                            .match(
                                /\(\d{1,3}\|\d{1,3}\)/g
                            ) || []
                    ).length;

                return (
                    checkboxes > 3 &&
                    coordinates > 3
                );
            });

        return table || null;
    }

    function getUnitKeyFromElement(element) {

        if (!element) {
            return null;
        }

        const candidates = [
            element.getAttribute?.('data-unit'),
            element.getAttribute?.('data-unit-id'),
            element.className,
            element.id,
            element.getAttribute?.('src'),
            element.getAttribute?.('href'),
            element.getAttribute?.('title'),
            element.getAttribute?.('alt')
        ]
            .filter(Boolean)
            .map(String);

        for (const value of candidates) {

            let match =
                value.match(
                    /unit[_-]([a-z0-9_]+)/i
                );

            if (match) {
                return match[1]
                    .replace(/\.(png|gif|webp).*$/i, '');
            }

            match =
                value.match(
                    /units\/([a-z0-9_]+)/i
                );

            if (match) {
                return match[1]
                    .replace(/\.(png|gif|webp).*$/i, '');
            }
        }

        return null;
    }


    function getKnownUnitKeys() {

        const candidates = [
            window.game_data?.units,
            window.GameData?.units,
            window.TribalWars?.game_data?.units
        ];

        for (const value of candidates) {

            if (
                Array.isArray(value) &&
                value.length
            ) {

                return value
                    .map(unit =>
                        typeof unit === 'string'
                            ? unit
                            : unit?.id ||
                              unit?.name ||
                              unit?.key
                    )
                    .filter(Boolean);
            }
        }

        /*
         * Pouze poslední záloha. Skutečný seznam se přednostně
         * bere z game_data konkrétního světa.
         */
        return [
            'spear',
            'sword',
            'axe',
            'archer',
            'spy',
            'light',
            'marcher',
            'heavy',
            'ram',
            'catapult',
            'knight',
            'snob',
            'militia'
        ];
    }


    function unitIconFallback(key) {

        const existing =
            document.querySelector(
                `img[src*="unit_${key}."], img[src*="/units/${key}."]`
            );

        if (existing?.src) {
            return existing.src;
        }

        return (
            location.origin +
            '/graphic/unit/unit_' +
            key +
            '.png'
        );
    }


    function extractUnits(table) {

        let best = [];

        for (
            const row
            of table.querySelectorAll('tr')
        ) {

            const cells =
                [
                    ...row.querySelectorAll(
                        ':scope > th, :scope > td'
                    )
                ];

            const units = [];

            cells.forEach(
                (cell, cellIndex) => {

                    let found = null;

                    const elements = [
                        cell,
                        ...cell.querySelectorAll('*')
                    ];

                    for (const element of elements) {

                        const key =
                            getUnitKeyFromElement(
                                element
                            );

                        if (!key) {
                            continue;
                        }

                        const img =
                            element.tagName === 'IMG'
                                ? element
                                : element.querySelector?.('img');

                        found = {
                            key,
                            icon:
                                img?.src ||
                                unitIconFallback(key),

                            title:
                                img?.title ||
                                img?.alt ||
                                element.getAttribute?.('title') ||
                                key,

                            /*
                             * Použijeme jen pokud řádek hlavičky nemá colspan.
                             */
                            cellIndex:
                                cells.every(
                                    c =>
                                        Number(c.colSpan || 1) === 1
                                )
                                    ? cellIndex
                                    : null
                        };

                        break;
                    }

                    if (
                        found &&
                        !units.some(
                            unit =>
                                unit.key ===
                                found.key
                        )
                    ) {
                        units.push(found);
                    }
                }
            );

            if (
                units.length >
                best.length
            ) {
                best = units;
            }
        }

        /*
         * Na mobilu v režimu "Web pro počítače" mohou být některé
         * ikony v DOM skryté / vykreslené jinak. Proto seznam doplníme
         * podle game_data daného světa.
         */
        const known =
            getKnownUnitKeys();

        if (
            known.length >
            best.length
        ) {

            const byKey =
                new Map(
                    best.map(
                        unit => [
                            unit.key,
                            unit
                        ]
                    )
                );

            best =
                known.map(key => {

                    const existing =
                        byKey.get(key);

                    return (
                        existing || {
                            key,
                            icon:
                                unitIconFallback(
                                    key
                                ),
                            title: key,
                            cellIndex: null
                        }
                    );
                });
        }

        return best;
    }


    function getTroopCells(
        cells,
        units,
        fallbackStart
    ) {

        const mapped =
            units.map(
                unit =>
                    Number.isInteger(
                        unit.cellIndex
                    )
                        ? cells[
                            unit.cellIndex
                          ]
                        : null
            );

        /*
         * Absolutní mapování použijeme jen pokud jsou známé
         * všechny sloupce a všechny existují i v datovém řádku.
         */
        if (
            mapped.length ===
                units.length &&
            mapped.every(Boolean)
        ) {
            return mapped;
        }

        /*
         * Fallback pro klasickou tabulku DK:
         * jednotky jsou souvisle za popisným sloupcem.
         */
        return cells.slice(
            fallbackStart,
            fallbackStart +
            units.length
        );
    }


    function detectRowType(cells) {

        for (
            let i = 0;
            i < cells.length;
            i++
        ) {

            const text =
                normalize(
                    cells[i].textContent
                );

            for (
                const [key, def]
                of Object.entries(TYPES)
            ) {

                if (
                    def.matches.includes(text)
                ) {

                    return {
                        type: key,
                        index: i
                    };
                }
            }
        }

        return null;
    }

    function parseSummary(
        doc,
        requestedType
    ) {

        const table =
            findSummaryTable(doc);

        if (!table) {
            throw new Error(
                'Souhrnná tabulka vojsk nebyla nalezena.'
            );
        }

        const units =
            extractUnits(table);

        if (!units.length) {
            throw new Error(
                'Jednotky nebyly rozpoznány.'
            );
        }

        const sums =
            Array(
                units.length
            ).fill(0);

        let villageCount = 0;

        for (
            const row
            of table.querySelectorAll('tr')
        ) {

            const cells =
                [
                    ...row.querySelectorAll(
                        'td'
                    )
                ];

            if (!cells.length) {
                continue;
            }

            const detected =
                detectRowType(cells);

            if (
                !detected ||
                detected.type !==
                requestedType
            ) {
                continue;
            }

            const troopCells =
                getTroopCells(
                    cells,
                    units,
                    detected.index + 1
                );

            if (
                troopCells.length !==
                units.length
            ) {
                continue;
            }

            villageCount++;

            troopCells.forEach(
                (cell, index) => {

                    sums[index] +=
                        toNumber(
                            cell.textContent
                        );
                }
            );
        }

        return {
            units,
            sums,
            villageCount
        };
    }

    function parseSupports(doc) {

        const table =
            findSupportTable(doc);

        if (!table) {
            throw new Error(
                'Tabulka podpor nebyla nalezena.'
            );
        }

        const units =
            extractUnits(table);

        if (!units.length) {
            throw new Error(
                'Jednotky podpor nebyly rozpoznány.'
            );
        }

        const rawSupports = [];

        let sourceVillage = '';

        for (
            const tr
            of table.querySelectorAll('tr')
        ) {

            const cells =
                [
                    ...tr.querySelectorAll(
                        'td'
                    )
                ];

            if (!cells.length) {
                continue;
            }

            const rowText =
                cleanText(
                    tr.textContent
                );

            const first =
                cleanText(
                    cells[0]
                        ?.textContent
                );

            const second =
                normalize(
                    cells[1]
                        ?.textContent
                );

            if (
                second ===
                've vesnici'
            ) {

                sourceVillage =
                    first;

                continue;
            }

            const checkbox =
                tr.querySelector(
                    'input[type="checkbox"]'
                );

            if (!checkbox) {
                continue;
            }

            if (
                !/\(\d{1,3}\|\d{1,3}\)/
                    .test(rowText)
            ) {
                continue;
            }

            let target = first;

            if (
                !/\(\d{1,3}\|\d{1,3}\)/
                    .test(target)
            ) {

                target = '';

                for (
                    let i = 0;
                    i < Math.min(
                        3,
                        cells.length
                    );
                    i++
                ) {

                    const candidate =
                        cleanText(
                            cells[i]
                                .textContent
                        );

                    if (
                        /\(\d{1,3}\|\d{1,3}\)/
                            .test(candidate)
                    ) {

                        target =
                            candidate;

                        break;
                    }
                }
            }

            if (!target) {
                continue;
            }

            const distance =
                cleanText(
                    cells[1]
                        ?.textContent
                );

            if (
                distance &&
                !/^\d+(?:[.,]\d+)?$/
                    .test(distance)
            ) {
                continue;
            }

            const troopCells =
                getTroopCells(
                    cells,
                    units,
                    2
                );

            if (
                troopCells.length !==
                units.length
            ) {
                continue;
            }

            const values =
                troopCells.map(
                    cell =>
                        toNumber(
                            cell.textContent
                        )
                );

            if (
                values.every(
                    value =>
                        value === 0
                )
            ) {
                continue;
            }

            const coords =
                target.match(
                    /\((\d{1,3}\|\d{1,3})\)/
                )?.[1] || target;

            rawSupports.push({
                source:
                    sourceVillage,

                target,

                coords,

                distance,

                values
            });
        }

        const grouped =
            new Map();

        for (
            const support
            of rawSupports
        ) {

            const key =
                support.coords;

            if (
                !grouped.has(key)
            ) {

                grouped.set(
                    key,
                    {
                        target:
                            support.target,

                        coords:
                            support.coords,

                        sources:
                            new Set(),

                        supportCount:
                            0,

                        distance:
                            support.distance,

                        values:
                            Array(
                                units.length
                            ).fill(0)
                    }
                );
            }

            const group =
                grouped.get(key);

            if (
                support.source
            ) {
                group.sources.add(
                    support.source
                );
            }

            group.supportCount++;

            const currentDistance =
                parseFloat(
                    String(
                        group.distance
                    )
                    .replace(',', '.')
                );

            const newDistance =
                parseFloat(
                    String(
                        support.distance
                    )
                    .replace(',', '.')
                );

            if (
                !Number.isNaN(
                    newDistance
                ) &&
                (
                    Number.isNaN(
                        currentDistance
                    ) ||
                    newDistance <
                    currentDistance
                )
            ) {

                group.distance =
                    support.distance;
            }

            support.values
                .forEach(
                    (value, index) => {

                        group.values[index] +=
                            value;
                    }
                );
        }

        return {
            units,
            rawSupports,
            supports:
                [...grouped.values()]
        };
    }

    function extractGroups(doc) {

        const groups = [
            {
                id: '0',
                name: 'Všechny'
            }
        ];

        for (
            const a
            of doc.querySelectorAll(
                'a[href*="group="]'
            )
        ) {

            try {

                const url =
                    new URL(
                        a.href,
                        location.href
                    );

                const id =
                    url.searchParams
                        .get('group');

                const name =
                    a.textContent
                        .replace(
                            /[\[\]<>]/g,
                            ''
                        )
                        .trim();

                if (
                    id !== null &&
                    name &&
                    !groups.some(
                        g => g.id === id
                    )
                ) {

                    groups.push({
                        id,
                        name
                    });
                }

            } catch (_) {}
        }

        return groups;
    }

    let supportSort = {
        column: 'target',
        direction: 'asc'
    };

    function sortSupports(data) {

        const sorted =
            [...data.supports];

        const direction =
            supportSort.direction ===
            'asc'
                ? 1
                : -1;

        sorted.sort(
            (a, b) => {

                if (
                    supportSort.column ===
                    'target'
                ) {

                    return (
                        a.target.localeCompare(
                            b.target,
                            'cs',
                            {
                                numeric: true,
                                sensitivity:
                                    'base'
                            }
                        ) *
                        direction
                    );
                }

                let valueA = 0;
                let valueB = 0;

                if (
                    supportSort.column ===
                    'count'
                ) {

                    valueA =
                        a.supportCount;

                    valueB =
                        b.supportCount;
                }

                else if (
                    supportSort.column ===
                    'distance'
                ) {

                    valueA =
                        parseFloat(
                            String(
                                a.distance || 0
                            )
                            .replace(',', '.')
                        ) || 0;

                    valueB =
                        parseFloat(
                            String(
                                b.distance || 0
                            )
                            .replace(',', '.')
                        ) || 0;
                }

                else if (
                    supportSort.column
                        .startsWith(
                            'unit-'
                        )
                ) {

                    const index =
                        parseInt(
                            supportSort.column
                                .replace(
                                    'unit-',
                                    ''
                                ),
                            10
                        );

                    valueA =
                        a.values[index] ||
                        0;

                    valueB =
                        b.values[index] ||
                        0;
                }

                if (
                    valueA <
                    valueB
                ) {

                    return (
                        -1 *
                        direction
                    );
                }

                if (
                    valueA >
                    valueB
                ) {

                    return (
                        1 *
                        direction
                    );
                }

                return a.target
                    .localeCompare(
                        b.target,
                        'cs',
                        {
                            numeric: true,
                            sensitivity:
                                'base'
                        }
                    );
            }
        );

        return sorted;
    }

    function sortArrow(column) {

        if (
            supportSort.column !==
            column
        ) {
            return '';
        }

        return (
            supportSort.direction ===
            'asc'
                ? ' ▲'
                : ' ▼'
        );
    }

    const box =
        document.createElement(
            'div'
        );

    box.id =
        SCRIPT_ID;

    box.innerHTML = `

        <div class="dk-head">

            <span>
                Stav vojska – TEST 3.4
            </span>

            <button
                class="dk-max"
                title="Maximalizovat"
            >
                □
            </button>

            <button
                class="dk-close"
                title="Zavřít"
            >
                ×
            </button>

        </div>

        <div class="dk-body">

            <div class="dk-row">

                <label>
                    Skupina:
                </label>

                <select
                    class="dk-group"
                >

                    <option value="0">
                        Všechny
                    </option>

                </select>

            </div>

            <div class="dk-tabs">

                <button
                    class="dk-tab active"
                    data-mode="summary"
                >
                    Souhrn vojska
                </button>

                <button
                    class="dk-tab"
                    data-mode="supports"
                >
                    Podpory mimo vesnice
                </button>

            </div>

            <div
                class="dk-summary-controls"
            >

                <div class="dk-row">

                    <label>
                        Druh:
                    </label>

                    <select
                        class="dk-type"
                    >

                        <option value="own">
                            Vlastní
                        </option>

                        <option value="village">
                            Ve vesnici
                        </option>

                        <option value="outside">
                            Mimo vesnici
                        </option>

                        <option value="travelling">
                            Na cestě
                        </option>

                        <option value="total">
                            Celkem
                        </option>

                    </select>

                </div>

            </div>

            <div class="dk-status">
                Načítám…
            </div>

            <div class="dk-summary-view">

                <div class="dk-units">
                </div>

                <div class="dk-bottom">

                    <strong
                        class="dk-village-count"
                    >
                    </strong>

                    <button
                        class="dk-export-summary"
                    >
                        Exportovat
                    </button>

                </div>

            </div>

            <div
                class="dk-support-view"
                style="display:none"
            >

                <div
                    class="dk-support-totals"
                >
                </div>

                <div
                    class="dk-support-info"
                >
                </div>

                <div
                    class="dk-scroll"
                >

                    <table
                        class="dk-support-table"
                    >

                        <thead>
                        </thead>

                        <tbody>
                        </tbody>

                    </table>

                </div>

                <div class="dk-bottom">

                    <strong
                        class="dk-support-count"
                    >
                    </strong>

                    <button
                        class="dk-export-supports"
                    >
                        Exportovat
                    </button>

                </div>

            </div>

        </div>
    `;

    document.body
        .appendChild(box);

    const style =
        document.createElement(
            'style'
        );

    style.textContent = `

        #${SCRIPT_ID} {

            position: fixed;

            top: 60px;

            left: 50%;

            transform:
                translateX(-50%);

            z-index: 999999;

            width: 800px;

            height: 620px;

            min-width: 520px;

            min-height: 360px;

            max-width: 96vw;

            max-height: 92vh;

            resize: both;

            overflow: hidden;

            background: #f4e4ba;

            color: #3b2412;

            border:
                2px solid #7b4d20;

            border-radius: 7px;

            box-shadow:
                0 5px 22px
                rgba(0,0,0,.45);

            font-family:
                Verdana,
                Arial,
                sans-serif;
        }

        #${SCRIPT_ID} .dk-head {

            position: relative;

            height: 42px;

            box-sizing:
                border-box;

            display: flex;

            justify-content:
                center;

            align-items:
                center;

            font-size: 18px;

            font-weight: bold;

            background: #c89952;

            border-bottom:
                2px solid #7b4d20;

            cursor: move;

            user-select: none;
        }

        #${SCRIPT_ID} .dk-max {

            position: absolute;

            right: 38px;

            top: 7px;

            width: 26px;

            height: 26px;

            border: 0;

            background:
                transparent;

            font-size: 19px;

            font-weight: bold;

            cursor: pointer;
        }

        #${SCRIPT_ID} .dk-close {

            position: absolute;

            right: 7px;

            top: 4px;

            width: 28px;

            height: 28px;

            border: 0;

            background:
                transparent;

            font-size: 23px;

            font-weight: bold;

            cursor: pointer;
        }

        #${SCRIPT_ID} .dk-body {

            height:
                calc(100% - 42px);

            box-sizing:
                border-box;

            padding: 10px;

            display: flex;

            flex-direction: column;

            overflow: hidden;
        }

        #${SCRIPT_ID} .dk-row {

            display: grid;

            grid-template-columns:
                90px 1fr;

            gap: 6px;

            align-items:
                center;

            margin-bottom: 7px;

            flex-shrink: 0;
        }

        #${SCRIPT_ID} label {

            font-weight: bold;
        }

        #${SCRIPT_ID} select {

            width: 100%;

            box-sizing:
                border-box;

            padding: 5px;
        }

        #${SCRIPT_ID} .dk-tabs {

            display: grid;

            grid-template-columns:
                1fr 1fr;

            gap: 4px;

            margin-bottom: 7px;

            flex-shrink: 0;
        }

        #${SCRIPT_ID} .dk-tab {

            padding: 7px;

            border:
                1px solid #976725;

            background:
                #e8ca82;

            font-weight: bold;

            cursor: pointer;
        }

        #${SCRIPT_ID} .dk-tab.active {

            background:
                #c89952;
        }

        #${SCRIPT_ID}
        .dk-summary-controls {

            flex-shrink: 0;
        }

        #${SCRIPT_ID} .dk-status {

            min-height: 18px;

            line-height: 18px;

            text-align: center;

            font-size: 11px;

            flex-shrink: 0;
        }

        #${SCRIPT_ID}
        .dk-summary-view {

            overflow: auto;
        }

        #${SCRIPT_ID} .dk-units {

            display: grid;

            grid-template-columns:
                repeat(
                    2,
                    minmax(0,1fr)
                );

            gap:
                3px 22px;

            padding: 8px;

            background:
                #faedcc;

            border:
                1px solid #ba8b45;
        }

        #${SCRIPT_ID} .dk-unit {

            min-height: 29px;

            display: flex;

            align-items: center;

            font-size: 15px;

            font-weight: bold;
        }

        #${SCRIPT_ID} .dk-unit img {

            width: 24px;

            height: 24px;

            object-fit:
                contain;

            margin-right: 7px;
        }

        #${SCRIPT_ID}
        .dk-support-view {

            flex: 1;

            min-height: 0;

            display: flex;

            flex-direction: column;

            overflow: hidden;
        }

        #${SCRIPT_ID}
        .dk-support-totals {

            display: flex;

            flex-wrap: wrap;

            gap:
                7px 15px;

            padding: 7px;

            background:
                #faedcc;

            border:
                1px solid #ba8b45;

            flex-shrink: 0;
        }

        #${SCRIPT_ID}
        .dk-support-total {

            display: flex;

            align-items: center;

            gap: 4px;

            font-weight: bold;
        }

        #${SCRIPT_ID}
        .dk-support-total img {

            width: 21px;

            height: 21px;
        }

        #${SCRIPT_ID}
        .dk-support-info {

            padding:
                5px 2px;

            font-size: 11px;

            flex-shrink: 0;
        }

        #${SCRIPT_ID} .dk-scroll {

            flex: 1;

            min-height: 150px;

            overflow: auto;

            border:
                1px solid #ba8b45;

            background:
                #faedcc;
        }

        #${SCRIPT_ID}
        .dk-support-table {

            width: 100%;

            border-collapse:
                collapse;

            background:
                #faedcc;

            font-size: 11px;
        }

        #${SCRIPT_ID}
        .dk-support-table th,

        #${SCRIPT_ID}
        .dk-support-table td {

            border:
                1px solid #d6ba7a;

            padding: 4px;

            text-align: center;

            white-space: nowrap;
        }

        #${SCRIPT_ID}
        .dk-support-table thead {

            position: sticky;

            top: 0;

            z-index: 5;
        }

        #${SCRIPT_ID}
        .dk-support-table th {

            background:
                #d6ad62;
        }

        #${SCRIPT_ID}
        .dk-support-table th:first-child,

        #${SCRIPT_ID}
        .dk-support-table td:first-child {

            text-align: left;

            min-width: 210px;
        }

        #${SCRIPT_ID}
        .dk-support-table th:nth-child(2),

        #${SCRIPT_ID}
        .dk-support-table td:nth-child(2) {

            min-width: 60px;
        }

        #${SCRIPT_ID}
        .dk-support-table th img {

            width: 20px;

            height: 20px;

            vertical-align: middle;
        }

        #${SCRIPT_ID}
        .dk-support-table tbody tr:hover {

            background:
                #ead49c;
        }

        #${SCRIPT_ID}
        .dk-sortable {

            cursor: pointer;

            user-select: none;
        }

        #${SCRIPT_ID}
        .dk-sortable:hover {

            background:
                #c89c4d;
        }

        #${SCRIPT_ID}
        .dk-sort-arrow {

            font-size: 9px;

            margin-left: 2px;

            vertical-align: middle;
        }

        #${SCRIPT_ID} .dk-bottom {

            display: flex;

            justify-content:
                space-between;

            align-items:
                center;

            gap: 10px;

            margin-top: 8px;

            flex-shrink: 0;
        }

        #${SCRIPT_ID}
        .dk-bottom button {

            padding:
                5px 10px;

            font-weight: bold;

            cursor: pointer;
        }

    `;

    document.head
        .appendChild(style);

    const groupSelect =
        box.querySelector(
            '.dk-group'
        );

    const typeSelect =
        box.querySelector(
            '.dk-type'
        );

    const status =
        box.querySelector(
            '.dk-status'
        );

    const summaryControls =
        box.querySelector(
            '.dk-summary-controls'
        );

    const summaryView =
        box.querySelector(
            '.dk-summary-view'
        );

    const supportView =
        box.querySelector(
            '.dk-support-view'
        );

    const unitsBox =
        box.querySelector(
            '.dk-units'
        );

    const villageCount =
        box.querySelector(
            '.dk-village-count'
        );

    const supportTotals =
        box.querySelector(
            '.dk-support-totals'
        );

    const supportInfo =
        box.querySelector(
            '.dk-support-info'
        );

    const supportHead =
        box.querySelector(
            '.dk-support-table thead'
        );

    const supportBody =
        box.querySelector(
            '.dk-support-table tbody'
        );

    const supportCount =
        box.querySelector(
            '.dk-support-count'
        );

    let currentMode =
        'summary';

    let summaryData =
        null;

    let supportData =
        null;

    let groupsLoaded =
        false;

    const savedType =
        localStorage.getItem(
            STORAGE_TYPE
        ) || 'own';

    if (
        TYPES[savedType]
    ) {
        typeSelect.value =
            savedType;
    }

    function populateGroups(groups) {

        const saved =
            localStorage.getItem(
                STORAGE_GROUP
            ) || '0';

        groupSelect.innerHTML =
            '';

        groups.forEach(
            group => {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    group.id;

                option.textContent =
                    group.name;

                groupSelect
                    .appendChild(
                        option
                    );
            }
        );

        if (
            [
                ...groupSelect.options
            ].some(
                option =>
                    option.value ===
                    saved
            )
        ) {

            groupSelect.value =
                saved;

        } else {

            groupSelect.value =
                '0';
        }
    }

    async function ensureGroups() {

        if (groupsLoaded) {
            return;
        }

        const doc =
            await loadSummary(
                '0'
            );

        populateGroups(
            extractGroups(doc)
        );

        groupsLoaded =
            true;
    }

    async function renderSummary() {

        status.textContent =
            'Načítám souhrn…';

        unitsBox.innerHTML =
            '';

        villageCount.textContent =
            '';

        try {

            await ensureGroups();

            const groupId =
                groupSelect.value ||
                '0';

            const doc =
                await loadSummary(
                    groupId
                );

            summaryData =
                parseSummary(
                    doc,
                    typeSelect.value
                );

            summaryData.units
                .forEach(
                    (unit, index) => {

                        const div =
                            document.createElement(
                                'div'
                            );

                        div.className =
                            'dk-unit';

                        const img =
                            document.createElement(
                                'img'
                            );

                        img.src =
                            unit.icon;

                        img.title =
                            unit.title;

                        const value =
                            document.createElement(
                                'span'
                            );

                        value.textContent =
                            fmt(
                                summaryData
                                    .sums[index]
                            );

                        div.appendChild(
                            img
                        );

                        div.appendChild(
                            value
                        );

                        unitsBox
                            .appendChild(
                                div
                            );
                    }
                );

            villageCount.textContent =

                'Celkem ' +

                summaryData
                    .villageCount +

                ' vesnic';

            localStorage.setItem(
                STORAGE_GROUP,
                groupId
            );

            localStorage.setItem(
                STORAGE_TYPE,
                typeSelect.value
            );

            status.textContent =
                'Hotovo';

        } catch (error) {

            console.error(error);

            status.textContent =
                'Chyba: ' +
                error.message;
        }
    }

    function renderSupportHeader() {

        if (!supportData) {
            return;
        }

        const headerRow =
            document.createElement(
                'tr'
            );

        function addTextHeader(
            title,
            column
        ) {

            const th =
                document.createElement(
                    'th'
                );

            th.className =
                'dk-sortable';

            th.dataset.sort =
                column;

            const text =
                document.createElement(
                    'span'
                );

            text.textContent =
                title;

            const arrow =
                document.createElement(
                    'span'
                );

            arrow.className =
                'dk-sort-arrow';

            arrow.textContent =
                sortArrow(column);

            th.appendChild(text);
            th.appendChild(arrow);

            th.addEventListener(
                'click',
                () =>
                    changeSort(column)
            );

            headerRow.appendChild(
                th
            );
        }

        addTextHeader(
            'Cílová vesnice',
            'target'
        );

        addTextHeader(
            'Podpor',
            'count'
        );

        addTextHeader(
            'Vzd.',
            'distance'
        );

        supportData.units
            .forEach(
                (unit, index) => {

                    const column =
                        'unit-' + index;

                    const th =
                        document.createElement(
                            'th'
                        );

                    th.className =
                        'dk-sortable';

                    th.dataset.sort =
                        column;

                    th.title =
                        'Seřadit podle: ' +
                        unit.title;

                    const img =
                        document.createElement(
                            'img'
                        );

                    img.src =
                        unit.icon;

                    img.title =
                        unit.title;

                    const arrow =
                        document.createElement(
                            'span'
                        );

                    arrow.className =
                        'dk-sort-arrow';

                    arrow.textContent =
                        sortArrow(
                            column
                        );

                    th.appendChild(img);

                    th.appendChild(
                        arrow
                    );

                    th.addEventListener(
                        'click',
                        () =>
                            changeSort(
                                column
                            )
                    );

                    headerRow.appendChild(
                        th
                    );
                }
            );

        supportHead.innerHTML =
            '';

        supportHead.appendChild(
            headerRow
        );
    }

    function changeSort(column) {

        if (
            supportSort.column ===
            column
        ) {

            supportSort.direction =

                supportSort.direction ===
                'asc'
                    ? 'desc'
                    : 'asc';

        } else {

            supportSort.column =
                column;

            supportSort.direction =

                column ===
                'target'
                    ? 'asc'
                    : 'desc';
        }

        renderSupportHeader();

        renderSupportRows();
    }

    function renderSupportRows() {

        if (!supportData) {
            return;
        }

        supportBody.innerHTML =
            '';

        const sorted =
            sortSupports(
                supportData
            );

        sorted.forEach(
            support => {

                const tr =
                    document.createElement(
                        'tr'
                    );

                const target =
                    document.createElement(
                        'td'
                    );

                target.textContent =
                    support.target;

                target.title =
                    [
                        ...support.sources
                    ].join('\n');

                const countCell =
                    document.createElement(
                        'td'
                    );

                countCell.textContent =
                    support.supportCount;

                const distanceCell =
                    document.createElement(
                        'td'
                    );

                distanceCell.textContent =
                    support.distance;

                tr.appendChild(
                    target
                );

                tr.appendChild(
                    countCell
                );

                tr.appendChild(
                    distanceCell
                );

                support.values
                    .forEach(
                        value => {

                            const td =
                                document.createElement(
                                    'td'
                                );

                            td.textContent =
                                value
                                    ? fmt(value)
                                    : '';

                            tr.appendChild(
                                td
                            );
                        }
                    );

                supportBody
                    .appendChild(
                        tr
                    );
            }
        );
    }

    async function renderSupports() {

        status.textContent =
            'Načítám podpory…';

        supportTotals.innerHTML =
            '';

        supportInfo.textContent =
            '';

        supportHead.innerHTML =
            '';

        supportBody.innerHTML =
            '';

        supportCount.textContent =
            '';

        try {

            await ensureGroups();

            const groupId =
                groupSelect.value ||
                '0';

            const doc =
                await loadSupports(
                    groupId
                );

            supportData =
                parseSupports(
                    doc
                );

            const totals =
                Array(
                    supportData
                        .units.length
                ).fill(0);

            supportData.supports
                .forEach(
                    support => {

                        support.values
                            .forEach(
                                (
                                    value,
                                    index
                                ) => {

                                    totals[index] +=
                                        value;
                                }
                            );
                    }
                );

            supportData.units
                .forEach(
                    (unit, index) => {

                        const div =
                            document.createElement(
                                'div'
                            );

                        div.className =
                            'dk-support-total';

                        const img =
                            document.createElement(
                                'img'
                            );

                        img.src =
                            unit.icon;

                        img.title =
                            unit.title;

                        const span =
                            document.createElement(
                                'span'
                            );

                        span.textContent =
                            fmt(
                                totals[index]
                            );

                        div.appendChild(
                            img
                        );

                        div.appendChild(
                            span
                        );

                        supportTotals
                            .appendChild(
                                div
                            );
                    }
                );

            supportInfo.textContent =

                'Jednotlivých podpor: ' +

                supportData
                    .rawSupports.length +

                ' | Cílových vesnic: ' +

                supportData
                    .supports.length;

            renderSupportHeader();

            renderSupportRows();

            supportCount.textContent =

                supportData
                    .supports.length +

                ' cílových vesnic';

            localStorage.setItem(
                STORAGE_GROUP,
                groupId
            );

            status.textContent =
                'Hotovo';

        } catch (error) {

            console.error(error);

            status.textContent =
                'Chyba: ' +
                error.message;
        }
    }

    async function switchMode(
        mode
    ) {

        currentMode =
            mode;

        box.querySelectorAll(
            '.dk-tab'
        ).forEach(
            button => {

                button.classList.toggle(
                    'active',
                    button.dataset.mode ===
                    mode
                );
            }
        );

        if (
            mode ===
            'summary'
        ) {

            summaryControls.style.display =
                '';

            summaryView.style.display =
                '';

            supportView.style.display =
                'none';

            await renderSummary();

        } else {

            summaryControls.style.display =
                'none';

            summaryView.style.display =
                'none';

            supportView.style.display =
                'flex';

            await renderSupports();
        }
    }

    box.querySelectorAll(
        '.dk-tab'
    ).forEach(
        button => {

            button.addEventListener(
                'click',
                () =>
                    switchMode(
                        button.dataset.mode
                    )
            );
        }
    );

    groupSelect.addEventListener(
        'change',
        async () => {

            if (
                currentMode ===
                'summary'
            ) {

                await renderSummary();

            } else {

                await renderSupports();
            }
        }
    );

    typeSelect.addEventListener(
        'change',
        renderSummary
    );

    box.querySelector(
        '.dk-export-summary'
    ).addEventListener(
        'click',
        async () => {

            if (!summaryData) {
                return;
            }

            const groupName =
                groupSelect.options[
                    groupSelect
                        .selectedIndex
                ]?.textContent ||
                '';

            let text =
                '[b]Stav vojska[/b]\n';

            text +=
                'Skupina: ' +
                groupName +
                '\n';

            text +=
                'Druh: ' +
                TYPES[
                    typeSelect.value
                ].label +
                '\n\n';

            summaryData.units
                .forEach(
                    (unit, index) => {

                        text +=
                            '[unit]' +
                            unit.key +
                            '[/unit] ' +

                            fmt(
                                summaryData
                                    .sums[index]
                            ) +

                            '\n';
                    }
                );

            text +=
                '\n[b]Celkem ' +

                summaryData
                    .villageCount +

                ' vesnic[/b]';

            try {

                await navigator
                    .clipboard
                    .writeText(
                        text
                    );

                status.textContent =
                    'Export zkopírován';

            } catch (_) {

                prompt(
                    'Zkopíruj export:',
                    text
                );
            }
        }
    );

    box.querySelector(
        '.dk-export-supports'
    ).addEventListener(
        'click',
        async () => {

            if (!supportData) {
                return;
            }

            let text =
                '[b]Podpory mimo vesnice[/b]\n\n';

            sortSupports(
                supportData
            ).forEach(
                support => {

                    text +=
                        '[b]' +
                        support.target +
                        '[/b]\n';

                    text +=
                        'Počet podpor: ' +
                        support.supportCount +
                        '\n';

                    if (
                        support.distance
                    ) {

                        text +=
                            'Vzdálenost: ' +
                            support.distance +
                            '\n';
                    }

                    supportData.units
                        .forEach(
                            (
                                unit,
                                index
                            ) => {

                                const amount =
                                    support
                                        .values[index];

                                if (!amount) {
                                    return;
                                }

                                text +=
                                    '[unit]' +
                                    unit.key +
                                    '[/unit] ' +
                                    fmt(
                                        amount
                                    ) +
                                    '\n';
                            }
                        );

                    text += '\n';
                }
            );

            try {

                await navigator
                    .clipboard
                    .writeText(
                        text
                    );

                status.textContent =
                    'Export zkopírován';

            } catch (_) {

                prompt(
                    'Zkopíruj export:',
                    text
                );
            }
        }
    );

    box.querySelector(
        '.dk-close'
    ).addEventListener(
        'click',
        () => box.remove()
    );

    const maxButton =
        box.querySelector(
            '.dk-max'
        );

    let maximized =
        false;

    let oldBoxState =
        null;

    maxButton.addEventListener(
        'click',
        () => {

            if (!maximized) {

                const rect =
                    box.getBoundingClientRect();

                oldBoxState = {

                    left:
                        rect.left +
                        'px',

                    top:
                        rect.top +
                        'px',

                    width:
                        rect.width +
                        'px',

                    height:
                        rect.height +
                        'px'
                };

                box.style.transform =
                    'none';

                box.style.left =
                    '2vw';

                box.style.top =
                    '3vh';

                box.style.width =
                    '96vw';

                box.style.height =
                    '92vh';

                maxButton.textContent =
                    '↙';

                maxButton.title =
                    'Obnovit velikost';

                maximized =
                    true;

            } else {

                box.style.transform =
                    'none';

                box.style.left =
                    oldBoxState
                        ?.left ||
                    '100px';

                box.style.top =
                    oldBoxState
                        ?.top ||
                    '60px';

                box.style.width =
                    oldBoxState
                        ?.width ||
                    '800px';

                box.style.height =
                    oldBoxState
                        ?.height ||
                    '620px';

                maxButton.textContent =
                    '□';

                maxButton.title =
                    'Maximalizovat';

                maximized =
                    false;
            }
        }
    );

    const header =
        box.querySelector(
            '.dk-head'
        );

    let dragging =
        false;

    let offsetX =
        0;

    let offsetY =
        0;

    header.addEventListener(
        'mousedown',
        event => {

            if (
                event.target
                    .closest('button')
            ) {
                return;
            }

            if (maximized) {
                return;
            }

            const rect =
                box.getBoundingClientRect();

            dragging =
                true;

            offsetX =
                event.clientX -
                rect.left;

            offsetY =
                event.clientY -
                rect.top;

            box.style.transform =
                'none';

            box.style.left =
                rect.left +
                'px';

            box.style.top =
                rect.top +
                'px';

            event.preventDefault();
        }
    );

    document.addEventListener(
        'mousemove',
        event => {

            if (!dragging) {
                return;
            }

            const maxX =
                window.innerWidth -
                box.offsetWidth;

            const maxY =
                window.innerHeight -
                box.offsetHeight;

            box.style.left =
                Math.max(
                    0,
                    Math.min(
                        maxX,
                        event.clientX -
                        offsetX
                    )
                ) +
                'px';

            box.style.top =
                Math.max(
                    0,
                    Math.min(
                        maxY,
                        event.clientY -
                        offsetY
                    )
                ) +
                'px';
        }
    );

    document.addEventListener(
        'mouseup',
        () => {

            dragging =
                false;
        }
    );

    await switchMode(
        'summary'
    );

})();
